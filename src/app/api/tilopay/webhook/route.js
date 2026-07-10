import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Tilopay payment callback.
//
// SECURITY: this endpoint moves orders to "Paid", so it is a fraud target. Two
// defenses are layered here:
//   1. Shared-secret gate — set TILOPAY_WEBHOOK_SECRET and append it to the
//      callback URL you configure in Tilopay (…/api/tilopay/webhook?secret=XXX).
//      When the env var is set we REQUIRE it, so forged calls are rejected.
//      (Left optional so enabling it is a deliberate, non-breaking step.)
//   2. Forward-only status + order-exists check — a webhook can never regress an
//      order that is already Paid/Completed, and can only act on a real order.
//
// It still does NOT prove the amount was paid in full — for that, re-query the
// transaction against Tilopay's API. Flagged to the owner as a follow-up.

const FINAL_PAID = new Set(['Paid', 'Completed', 'Shipped', 'Delivered']);

export async function POST(req) {
  try {
    // ── 1. Shared-secret gate (enforced only when configured) ──────────────
    const configuredSecret = process.env.TILOPAY_WEBHOOK_SECRET;
    if (configuredSecret) {
      const url = new URL(req.url);
      const provided = url.searchParams.get('secret') || req.headers.get('x-webhook-secret');
      if (provided !== configuredSecret) {
        console.warn('[Tilopay webhook] Rejected: missing/invalid secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await req.json();
    console.log('[Tilopay webhook] payload:', payload);

    const orderNumber = payload.orderNumber || payload.reference || payload.order_number;
    const statusCode = payload.code || payload.status;

    let statusText = 'Pending';
    if (statusCode === 1 || statusCode === 'APPROVED' || statusCode === 'approved') {
      statusText = 'Paid';
    } else if (statusCode === 2 || statusCode === 'REJECTED' || statusCode === 'rejected') {
      statusText = 'Rejected';
    } else if (statusCode === 3 || statusCode === 'ERROR' || statusCode === 'error') {
      statusText = 'Error';
    } else {
      statusText = statusCode ? `Status: ${statusCode}` : 'Pending';
    }

    if (!orderNumber) {
      return NextResponse.json({ error: 'Missing order number' }, { status: 400 });
    }

    if (isSupabaseConfigured && supabase) {
      // ── 2. Order must exist; read its current status first ───────────────
      const { data: existing, error: lookupErr } = await supabase
        .from('orders')
        .select('id, status')
        .eq('order_number', orderNumber)
        .maybeSingle();

      if (lookupErr) {
        console.error('[Tilopay webhook] Lookup failed:', lookupErr);
        return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
      }
      if (!existing) {
        // Unknown order number — likely a probe/forgery. Acknowledge without acting.
        console.warn('[Tilopay webhook] Unknown order number, ignoring:', orderNumber);
        return NextResponse.json({ received: true, ignored: 'unknown_order' });
      }

      // Forward-only: never move a settled/paid order backward on a later callback.
      if (FINAL_PAID.has(existing.status) && statusText !== 'Paid') {
        console.warn(`[Tilopay webhook] Ignoring "${statusText}" for already-settled order ${orderNumber} (${existing.status})`);
        return NextResponse.json({ received: true, ignored: 'already_settled' });
      }
      // Idempotent: nothing to do if the status is unchanged.
      if (existing.status === statusText) {
        return NextResponse.json({ received: true, unchanged: true });
      }

      const { error } = await supabase
        .from('orders')
        .update({ status: statusText })
        .eq('order_number', orderNumber);

      if (error) {
        console.error('[Tilopay webhook] Error updating Supabase:', error);
        return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
      }

      // Notify admins of a payment so it can be human-verified against Tilopay.
      if (statusText === 'Paid') {
        try {
          await supabase.from('admin_notifications').insert({
            type: 'payment_received',
            title: `Payment received: ${orderNumber}`,
            body: `Tilopay reported this order as Paid. Verify the amount in the Tilopay dashboard before fulfilling.`,
            link_tab: 'orders',
            link_ref: orderNumber,
          });
        } catch { /* notifications table may not exist yet */ }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[Tilopay webhook] Error processing request:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
