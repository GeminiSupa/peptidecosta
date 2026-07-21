import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isShieldHubPayConfigured, getShieldHubPayTransaction } from '@/lib/shieldHubPay';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';

export const runtime = 'nodejs';

const FINAL_PAID = new Set(['Paid', 'Completed', 'Shipped', 'Delivered']);

function statusToOrderStatus(status) {
  if (status === 'Approved') return 'Paid';
  if (status === 'Declined') return 'Declined';
  if (status === 'Failed') return 'Error';
  if (status === 'Redirect') return 'Pending - Card 3DS';
  return `Payment ${status || 'Pending'}`;
}

function buildPaymentPatch(status, payload) {
  return {
    status,
    payment_transaction_id: payload?.id ? String(payload.id) : null,
    payment_provider_status: payload?.status || null,
    payment_authorization: payload?.authorization || null,
    payment_descriptor: payload?.descriptor_text || null,
    payment_provider_response: payload || null,
  };
}

export async function POST(req) {
  try {
    const rawPayload = await req.json();
    const orderNumber = rawPayload.transaction_reference;
    const transactionId = rawPayload.id;

    if (!orderNumber) {
      return NextResponse.json({ error: 'Missing transaction reference' }, { status: 400 });
    }

    if (!transactionId) {
      return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
    }

    // Shield Hub Pay does not sign webhooks, so the POSTed body proves nothing —
    // anyone who knows an order number could claim it was paid. Re-fetch the
    // transaction from the gateway (authenticated with our credentials) and only
    // trust THAT copy for the status and stored payment metadata.
    if (!isShieldHubPayConfigured()) {
      console.error('[Shield Hub Pay webhook] Credentials not configured; cannot verify webhook.');
      return NextResponse.json({ error: 'Webhook verification unavailable' }, { status: 500 });
    }

    let payload;
    try {
      payload = await getShieldHubPayTransaction(transactionId);
    } catch (err) {
      console.error(`[Shield Hub Pay webhook] Could not verify transaction ${transactionId}:`, err.message);
      return NextResponse.json({ error: 'Transaction could not be verified with gateway' }, { status: 400 });
    }

    if (String(payload.transaction_reference || '') !== String(orderNumber)) {
      console.warn(`[Shield Hub Pay webhook] Reference mismatch: webhook says ${orderNumber}, gateway says ${payload.transaction_reference} (txn ${transactionId})`);
      return NextResponse.json({ error: 'Transaction reference mismatch' }, { status: 400 });
    }

    const statusText = statusToOrderStatus(payload.status);

    const supabase = getSupabaseAdmin();
    const { data: existing, error: lookupErr } = await supabase
      .from('orders')
      .select('id, status, customer_email, customer_phone')
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (lookupErr) {
      console.error('[Shield Hub Pay webhook] Lookup failed:', lookupErr.message);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }

    if (!existing) {
      console.warn('[Shield Hub Pay webhook] Unknown order number:', orderNumber);
      return NextResponse.json({ received: true, ignored: 'unknown_order' });
    }

    if (FINAL_PAID.has(existing.status) && statusText !== 'Paid') {
      return NextResponse.json({ received: true, ignored: 'already_settled' });
    }

    if (existing.status !== statusText) {
      const { error } = await supabase
        .from('orders')
        .update(buildPaymentPatch(statusText, payload))
        .eq('order_number', orderNumber);

      if (error) {
        const fallback = await supabase
          .from('orders')
          .update({ status: statusText })
          .eq('order_number', orderNumber);

        if (fallback.error) {
          console.error('[Shield Hub Pay webhook] Update failed:', fallback.error.message);
          return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
        }
        console.warn('[Shield Hub Pay webhook] Payment metadata columns unavailable; updated status only:', error.message);
      }
    }

    if (statusText === 'Paid') {
      const { error: cartCleanupError } = await markActiveAbandonedCartsConvertedForOrder(supabase, {
        ...existing,
        status: statusText,
      });
      if (cartCleanupError) {
        console.warn('[Shield Hub Pay webhook] Paid cart cleanup failed:', cartCleanupError.message);
      }

      try {
        await supabase.from('admin_notifications').insert({
          type: 'payment_received',
          title: `Card payment approved: ${orderNumber}`,
          body: `Shield Hub Pay reported this order as Paid. Verify transaction ${payload.id || ''} before fulfilling.`,
          link_tab: 'orders',
          link_ref: orderNumber,
        });
      } catch {
        // notification table may not exist yet
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Shield Hub Pay webhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
