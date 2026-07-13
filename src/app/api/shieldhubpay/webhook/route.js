import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const FINAL_PAID = new Set(['Paid', 'Completed', 'Shipped', 'Delivered']);

function statusToOrderStatus(status) {
  if (status === 'Approved') return 'Paid';
  if (status === 'Declined') return 'Declined';
  if (status === 'Failed') return 'Error';
  if (status === 'Redirect') return 'Pending - Card 3DS';
  return `Payment ${status || 'Pending'}`;
}

export async function POST(req) {
  try {
    const payload = await req.json();
    const orderNumber = payload.transaction_reference;
    const statusText = statusToOrderStatus(payload.status);

    if (!orderNumber) {
      return NextResponse.json({ error: 'Missing transaction reference' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: lookupErr } = await supabase
      .from('orders')
      .select('id, status')
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
        .update({ status: statusText })
        .eq('order_number', orderNumber);

      if (error) {
        console.error('[Shield Hub Pay webhook] Update failed:', error.message);
        return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
      }
    }

    if (statusText === 'Paid') {
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
