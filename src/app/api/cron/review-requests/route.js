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
import { writeDroppingMissingColumns, ORDER_REVIEW_PLATFORM_COLUMNS } from '@/lib/optionalColumns.mjs';
import { decideForOrder, recordReviewAsk, reviewClickUrl } from '@/lib/reviewAskHistory.mjs';
import { getReviewSettings } from '@/lib/reviewSettings.mjs';
import { pickSocialPlatform } from '@/lib/reviewPlatformSplit.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // Prevent caching so cron runs accurately

// Which statuses qualify now comes from the Social Reviews settings; this is
// only the shape of the default, kept for readers of this file.
// See DEFAULT_TRIGGER_STATUSES in reviewSettings.mjs.

function getReviewEligibilityDate(order) {
  const when = new Date(orderCompletedAtMs(order));
  return Number.isNaN(when.getTime()) ? new Date(0) : when;
}

export async function GET(request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();

    // Everything tunable comes from the Social Reviews settings, so changing
    // the wait or which statuses qualify is a panel edit, not a deploy.
    const reviewSettings = await getReviewSettings(supabase);

    // Find completed orders that have not been asked for a review yet. The
    // orders table does not have updated_at, so we fetch candidates and derive
    // the completion date from activity_log, falling back to created_at.
    //
    // Two days, down from five (Omer, 2026-09-05): the order is still fresh in
    // the customer's mind, and the Trustpilot half is on its own ~7-day delay
    // anyway, so the two halves were never comparable. Configurable because
    // this is exactly the sort of number that gets tuned by watching results.
    const eligibleBefore = new Date();
    eligibleBefore.setDate(eligibleBefore.getDate() - reviewSettings.waitDays);

    const { data: candidateOrders, error } = await supabase
      .from('orders')
      .select('id, order_number, customer_email, customer_name, customer_phone, currency, payment_method, total_usd, total_crc, created_at, activity_log')
      .in('status', reviewSettings.triggerStatuses)
      .is('review_requested_at', null)
      .order('created_at', { ascending: true })
      .limit(100); // Process in batches to avoid timeouts

    if (error) {
      throw error;
    }

    const eligibleOrders = (candidateOrders || [])
      .filter((order) => getReviewEligibilityDate(order) <= eligibleBefore)
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
    // The two halves of the split must not bleed into each other. Every order
    // this cron reaches is, by construction, one the completion route left for
    // Google — the Trustpilot half is stamped and filtered out above. So the
    // Trustpilot link is dropped here even when REVIEW_LINK_TRUSTPILOT is set
    // (it is, in production): a customer asked for Google should not be handed
    // Trustpilot in the same breath, or the split stops being a split.
    // A link set in the Social Reviews panel outranks the site's business
    // links, which is why it is layered in as if it were the env override —
    // reviewDestinations already resolves that precedence, so it is not
    // reimplemented here.
    const destinations = {
      ...reviewDestinations(await getBusinessLinks(), {
        ...process.env,
        REVIEW_LINK_GOOGLE: reviewSettings.googleReviewUrl || process.env.REVIEW_LINK_GOOGLE,
        REVIEW_LINK_FACEBOOK: reviewSettings.facebookReviewUrl || process.env.REVIEW_LINK_FACEBOOK,
      }),
      trustpilot: '',
    };

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

      // The customer's history decides again here, five days after the order
      // was completed, rather than being trusted from then: they may have
      // ordered twice that week, or clicked a button from an earlier email in
      // the meantime. `offer` is the sites they have not already used.
      const decision = await decideForOrder(supabase, order, {
        // Google or Facebook by the configured ratio; Trustpilot is not on the
        // table here, it is delivered by the BCC on the completion email.
        firstChoice: pickSocialPlatform(order, { REVIEW_GOOGLE_SHARE: String(reviewSettings.googleSharePct) }),
        trustpilotHasRoom: false,
        policy: {
          reaskAfterDays: reviewSettings.reaskAfterDays,
          maxAsksWithoutClick: reviewSettings.maxAsksWithoutClick,
        },
      });

      if (!decision.ask) {
        // Only a real decision is final. `retry` means the history could not be
        // read at all, so the order is left untouched and reconsidered tomorrow
        // rather than quietly retired.
        if (!decision.retry) {
          await writeDroppingMissingColumns(
            { review_requested_at: new Date().toISOString(), review_platform: 'skipped' },
            ORDER_REVIEW_PLATFORM_COLUMNS,
            (row) => supabase.from('orders').update(row).eq('id', order.id),
          );
        }
        skippedCount++;
        continue;
      }

      const askId = await recordReviewAsk(supabase, {
        email: order.customer_email,
        order,
        platforms: decision.offer,
      });

      const isSpanish = order.currency === 'CRC';
      // Only the offered sites get a button, and each one goes through the
      // click redirect so the choice is recorded.
      const offered = {
        google: decision.offer.includes('google')
          ? reviewClickUrl(askId, 'google', destinations.google)
          : '',
        facebook: decision.offer.includes('facebook')
          ? reviewClickUrl(askId, 'facebook', destinations.facebook)
          : '',
        trustpilot: '',
      };

      const { subject, html } = buildReviewRequestEmail({
        customerName: order.customer_name,
        lang: isSpanish ? 'es' : 'en',
        destinations: offered,
      });

      // WhatsApp's approved template takes a single link, so it gets the first
      // site still on offer — Google when it is there, since that is the
      // listing the seller rating and the search result hang off. Sending the
      // site they already clicked would undo the whole point of the history.
      const waPlatform = decision.offer.includes('google') ? 'google' : decision.offer[0];
      const reviewLink = reviewClickUrl(askId, waPlatform, destinations[waPlatform] || destinations.google);

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

        // Mark as sent. Recorded as 'google' so it is not counted against the
        // Trustpilot monthly cap — these orders never touched Trustpilot. The
        // customer-level record was written before the send, by recordReviewAsk.
        await writeDroppingMissingColumns(
          { review_requested_at: new Date().toISOString(), review_platform: 'google' },
          ORDER_REVIEW_PLATFORM_COLUMNS,
          (row) => supabase.from('orders').update(row).eq('id', order.id),
        );

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
