import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCronRequest } from '@/lib/cronAuth';
import { canSendWhatsAppMarketing } from '@/lib/whatsappCompliance';
import {
  createTrustpilotServiceInvitation,
  getTrustpilotConfigStatus,
  isTrustpilotConfigured,
} from '@/lib/trustpilot';
import nodemailer from 'nodemailer';
import { getTransactionalSmtpConfig } from '@/lib/transactionalSmtp';
import { orderCompletedAtMs } from '@/lib/agentDashboard.mjs';
import { getBusinessLinks } from '@/lib/settings';
import { buildReviewRequestEmail, reviewDestinations } from '@/lib/reviewRequestEmail.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Prevent caching so cron runs accurately

const COMPLETE_STATUSES = ['Order Complete', 'Completed'];

function getReviewEligibilityDate(order) {
  const when = new Date(orderCompletedAtMs(order));
  return Number.isNaN(when.getTime()) ? new Date(0) : when;
}

export async function GET(request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();

    // Find completed orders that have not been asked for a review yet. The
    // orders table does not have updated_at, so we fetch candidates and derive
    // the completion date from activity_log, falling back to created_at.
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const { data: candidateOrders, error } = await supabase
      .from('orders')
      .select('id, order_number, customer_email, customer_name, customer_phone, currency, payment_method, total_usd, total_crc, created_at, activity_log')
      .in('status', COMPLETE_STATUSES)
      .is('review_requested_at', null)
      .order('created_at', { ascending: true })
      .limit(100); // Process in batches to avoid timeouts

    if (error) {
      throw error;
    }

    const eligibleOrders = (candidateOrders || [])
      .filter((order) => getReviewEligibilityDate(order) <= fiveDaysAgo)
      .slice(0, 50);

    if (!eligibleOrders || eligibleOrders.length === 0) {
      return NextResponse.json({ message: 'No eligible orders for review requests.' });
    }

    const trustpilotEnabled = isTrustpilotConfigured();
    const configStatus = getTrustpilotConfigStatus();
    const { host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, user: SMTP_USER, pass: SMTP_PASS } = getTransactionalSmtpConfig();

    if (!trustpilotEnabled && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)) {
      return NextResponse.json({
        error: 'No review invitation channel is configured',
        trustpilot: configStatus,
        smtpConfigured: false,
      }, { status: 500 });
    }

    const transporter = SMTP_HOST && SMTP_USER && SMTP_PASS
      ? nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_SECURE,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
          tls: { rejectUnauthorized: false }
        })
      : null;

    // Resolved once for the whole batch rather than per order: it is one read
    // of the same site_settings row the storefront review badges use, so a
    // profile changed in the admin CMS reaches this email too.
    const destinations = reviewDestinations(await getBusinessLinks());

    let trustpilotSentCount = 0;
    let emailSentCount = 0;
    let skippedCount = 0;
    let trustpilotFailedCount = 0;
    let emailFailedCount = 0;

    for (const order of eligibleOrders) {
      if (!order.customer_email) {
        skippedCount++;
        continue;
      }

      if (trustpilotEnabled) {
        try {
          await createTrustpilotServiceInvitation(order);

          await supabase
            .from('orders')
            .update({ review_requested_at: new Date().toISOString() })
            .eq('id', order.id);

          trustpilotSentCount++;
          continue;
        } catch (err) {
          trustpilotFailedCount++;
          console.error(`[CRON Review Requests] Trustpilot invitation failed for order ${order.order_number || order.id}`, err);

          if (process.env.TRUSTPILOT_FALLBACK_EMAIL_ON_ERROR !== 'true') {
            continue;
          }
        }
      }

      if (!transporter) {
        skippedCount++;
        continue;
      }

      const isSpanish = order.currency === 'CRC';
      const { subject, html } = buildReviewRequestEmail({
        customerName: order.customer_name,
        lang: isSpanish ? 'es' : 'en',
        destinations,
      });

      // WhatsApp's approved template takes a single link, so it gets the Google
      // one — the listing the seller rating and the search result hang off.
      // Adding Facebook there needs a new template through Meta review.
      const reviewLink = destinations.google;

      try {
        await transporter.sendMail({
          from: `Peptides Costa Rica <${SMTP_USER}>`,
          replyTo: 'omerforce@gmail.com',
          to: order.customer_email.trim(),
          subject,
          html,
        });

        // --- NEW: WhatsApp Review Request ---
        const metaToken = process.env.WHATSAPP_ACCESS_TOKEN;
        const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        let cleanPhone = order.customer_phone ? order.customer_phone.replace(/[^0-9]/g, '') : '';
        if (cleanPhone.length === 8) cleanPhone = '506' + cleanPhone;
        // Only send the WhatsApp review request to numbers that explicitly opted in.
        const waGate = cleanPhone ? await canSendWhatsAppMarketing(supabase, cleanPhone) : { ok: false };

        if (cleanPhone && metaToken && metaPhoneId && waGate.ok) {
          await fetch(`https://graph.facebook.com/v25.0/${metaPhoneId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${metaToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanPhone,
              type: 'template',
              template: {
                name: 'review_request_5_day',
                language: { code: isSpanish ? 'es' : 'en' },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: order.customer_name || (isSpanish ? '' : 'there') },
                      { type: 'text', text: reviewLink }
                    ]
                  }
                ]
              }
            }),
          }).catch(e => console.error(`Failed to send WhatsApp review request to ${cleanPhone}`, e));
        }
        // ------------------------------------

        // Mark as sent in DB
        await supabase
          .from('orders')
          .update({ review_requested_at: new Date().toISOString() })
          .eq('id', order.id);

        emailSentCount++;
      } catch (err) {
        emailFailedCount++;
        console.error(`Failed to send review request to ${order.customer_email}`, err);
      }
    }

    return NextResponse.json({
      success: true,
      trustpilotEnabled,
      trustpilotSent: trustpilotSentCount,
      fallbackEmailsSent: emailSentCount,
      skipped: skippedCount,
      trustpilotFailed: trustpilotFailedCount,
      emailFailed: emailFailedCount,
    });

  } catch (err) {
    console.error('[CRON Review Requests]', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
