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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Prevent caching so cron runs accurately

const COMPLETION_MESSAGE_RE = /paid|complet/i;
const COMPLETE_STATUSES = ['Order Complete', 'Completed'];

function getReviewEligibilityDate(order) {
  let when = order?.created_at ? new Date(order.created_at) : new Date(0);

  if (Array.isArray(order?.activity_log)) {
    const completionLogs = order.activity_log.filter(
      (log) => log?.type === 'status_change' && COMPLETION_MESSAGE_RE.test(log?.message || '')
    );

    if (completionLogs.length > 0) {
      // activity_log is newest-first, so the last match is the first completion event.
      const firstCompletion = completionLogs[completionLogs.length - 1];
      if (firstCompletion?.at) when = new Date(firstCompletion.at);
    }
  }

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
    const SMTP_HOST = process.env.SMTP_HOST;
    const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
    const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;

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

      const reviewLink = process.env.REVIEW_LINK_TRUSTPILOT || process.env.REVIEW_LINK_GOOGLE || 'https://catalog.peptidescostarica.net/customer-feedback';
      
      const isSpanish = order.currency === 'CRC';
      const subject = isSpanish ? `¿Cómo va tu investigación? 🧪` : `How is your research going? 🧪`;
      const html = isSpanish 
        ? `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
          <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="96" height="81" style="display:block;width:96px;height:81px;margin:0 auto 14px auto;border:0;outline:none;text-decoration:none;border-radius:10px;">
          <h2>¡Nos encantaría saber tu opinión!</h2>
          <p>Hola ${order.customer_name || ''},</p>
          <p>Han pasado unos días desde que se completó tu pedido de Peptides Costa Rica. ¡Esperamos que tu investigación vaya de maravilla!</p>
          <p>Si tienes un momento, te agradeceríamos mucho que nos dejaras una reseña sobre tu experiencia con nuestros productos y servicio.</p>
          <p>
            <a href="${reviewLink}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Dejar una Reseña</a>
          </p>
          <p>Gracias,<br/>El equipo de Peptides Costa Rica</p>
        </div>
        ` 
        : `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333;">
          <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="96" height="81" style="display:block;width:96px;height:81px;margin:0 auto 14px auto;border:0;outline:none;text-decoration:none;border-radius:10px;">
          <h2>We'd love to hear from you!</h2>
          <p>Hi ${order.customer_name || 'there'},</p>
          <p>It's been a few days since your Peptides Costa Rica order was completed. We hope your research is going perfectly!</p>
          <p>If you have a moment, we would greatly appreciate it if you could leave a review about your experience with our products and service.</p>
          <p>
            <a href="${reviewLink}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Leave a Review</a>
          </p>
          <p>Thank you,<br/>The Peptides Costa Rica Team</p>
        </div>
      `;

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
