import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyChargxWebhookSignature } from '@/lib/chargxPay.mjs';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { declineReasonFrom, gatewayStatusToOrderStatus } from '@/lib/paymentOutcome.mjs';
import { sendPaymentResultEmails, shouldSendPaymentResultEmail } from '@/lib/paymentResultEmail.mjs';
import { getPublicSiteUrl } from '@/lib/publicUrl';
import { withPaymentStatusActivity } from '@/lib/paymentStatusActivity.mjs';

export const runtime = 'nodejs';

const FINAL_PAID = new Set(['Paid', 'Completed', 'Shipped', 'Delivered']);
const MAX_SKEW_SECONDS = 5 * 60;

function eventName(payload) {
  return String(payload?.type || payload?.event || payload?.eventType || '').toLowerCase();
}

function isSuccessEvent(name) {
  return name.includes('succeeded') || name.includes('paid') || name.includes('approved');
}

function isDeclineEvent(name) {
  return name.includes('failed') || name.includes('declin') || name.includes('canceled') || name.includes('cancelled');
}

function collectRefs(payload) {
  const blobs = [payload, payload?.data, payload?.result, payload?.object].filter((item) => item && typeof item === 'object');
  const refs = [];
  for (const blob of blobs) {
    for (const key of ['orderId', 'order_id', 'merchantOrderId', 'transaction_reference', 'id']) {
      if (blob[key] != null && blob[key] !== '') refs.push(String(blob[key]));
    }
  }
  return [...new Set(refs)];
}

export async function POST(req) {
  try {
    const secret = process.env.CHARGX_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Chargex webhook] CHARGX_WEBHOOK_SECRET is not set.');
      return NextResponse.json({ error: 'Webhook verification unavailable' }, { status: 500 });
    }

    const rawBody = await req.text();
    const timestamp = req.headers.get('webhook-timestamp');
    const signature = req.headers.get('webhook-signature');
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > MAX_SKEW_SECONDS) {
      return NextResponse.json({ error: 'Webhook timestamp is not current' }, { status: 400 });
    }
    if (!verifyChargxWebhookSignature({ secret, timestamp, signatureHeader: signature, rawBody })) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const name = eventName(payload);
    if (!isSuccessEvent(name) && !isDeclineEvent(name)) {
      return NextResponse.json({ received: true, ignored: 'unhandled_event' });
    }

    const gatewayStatus = isSuccessEvent(name) ? 'Approved' : 'Declined';
    const statusText = gatewayStatusToOrderStatus(gatewayStatus);
    const refs = collectRefs(payload);
    if (!refs.length) {
      console.warn('[Chargex webhook] Signed event had no order reference:', name);
      return NextResponse.json({ received: true, ignored: 'no_reference' });
    }

    const supabase = getSupabaseAdmin();
    let existing = null;
    for (const ref of refs) {
      const byNumber = await supabase
        .from('orders')
        .select('id, order_number, status, customer_email, customer_phone, activity_log, payment_method')
        .eq('order_number', ref)
        .maybeSingle();
      if (byNumber.data) {
        existing = byNumber.data;
        break;
      }
      const byTxn = await supabase
        .from('orders')
        .select('id, order_number, status, customer_email, customer_phone, activity_log, payment_method')
        .eq('payment_transaction_id', ref)
        .maybeSingle();
      if (byTxn.data) {
        existing = byTxn.data;
        break;
      }
    }

    if (!existing) {
      console.warn('[Chargex webhook] No order matched', refs.join(', '));
      return NextResponse.json({ received: true, ignored: 'unknown_order' });
    }

    if (FINAL_PAID.has(existing.status) && statusText !== 'Paid') {
      return NextResponse.json({ received: true, ignored: 'already_settled' });
    }

    const statusChanged = existing.status !== statusText;
    const theirId = refs.find((ref) => ref.startsWith('order_')) || null;

    if (statusChanged) {
      const paymentPatch = withPaymentStatusActivity(existing, {
        status: statusText,
        ...(theirId ? { payment_transaction_id: theirId } : {}),
        payment_provider_status: gatewayStatus,
        payment_descriptor: 'Chargex',
        payment_provider_response: { event: name, refs },
      }, { by: 'Chargex' });
      const { error } = await supabase.from('orders').update(paymentPatch).eq('id', existing.id);
      if (error) {
        console.error('[Chargex webhook] Update failed:', error.message);
        return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
      }
    }

    if (statusChanged && shouldSendPaymentResultEmail(statusText)) {
      const { data: orderRow } = await supabase.from('orders').select('*').eq('id', existing.id).maybeSingle();
      if (orderRow) {
        await sendPaymentResultEmails(getPublicSiteUrl(req.url), orderRow, existing.order_number, {
          declineReason: declineReasonFrom({ message: payload?.error?.[0]?.errorText || payload?.message }),
          firstTeamAlert: String(orderRow.payment_method || '').toLowerCase() === 'card',
          logPrefix: '[Chargex webhook]',
        });
      }
    }

    if (statusText === 'Paid') {
      const { error: cartCleanupError } = await markActiveAbandonedCartsConvertedForOrder(supabase, {
        ...existing,
        status: statusText,
      });
      if (cartCleanupError) {
        console.warn('[Chargex webhook] Paid cart cleanup failed:', cartCleanupError.message);
      }
      try {
        await supabase.from('admin_notifications').insert({
          type: 'payment_received',
          title: `Card payment approved: ${existing.order_number}`,
          body: `Chargex reported this order as Paid. Verify it in the Chargex dashboard before fulfilling.`,
          link_tab: 'orders',
          link_ref: existing.order_number,
        });
      } catch {
        // notification table may not exist yet
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Chargex webhook] Error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
