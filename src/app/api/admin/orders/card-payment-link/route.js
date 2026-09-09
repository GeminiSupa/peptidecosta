import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { buildCardPaymentPath, canSignCardPaymentLinks, getPublicBaseUrl } from '@/lib/cardPaymentLink';
import { orderVisibleToAgent } from '@/lib/agentOrders';
import { areCardPaymentsPaused } from '@/lib/cardPaymentsPaused.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    // Staff-facing, so this one says plainly what is happening rather than
    // apologising: a link minted now would be refused the moment the customer
    // used it, and "the link you sent me does not work" is a worse experience
    // than being told up front to take the order another way.
    if (areCardPaymentsPaused()) {
      return NextResponse.json({
        error: 'Card payments are paused for maintenance, so payment links cannot be sent right now. Take the order by WhatsApp, SINPE or bank transfer instead.',
      }, { status: 503 });
    }

    if (!canSignCardPaymentLinks()) {
      return NextResponse.json({ error: 'Card payment link signing is not configured' }, { status: 500 });
    }

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, status, sales_agent')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message || 'Order not found' }, { status: 404 });
    }

    if (!order.order_number) {
      return NextResponse.json({ error: 'Order number is missing' }, { status: 400 });
    }

    if (!orderVisibleToAgent(order, auth.profile)) {
      return NextResponse.json({ error: 'Forbidden: order is not visible to this staff member' }, { status: 403 });
    }

    const status = String(order.status || '').toLowerCase();
    if (status.includes('paid') || status.includes('complete')) {
      return NextResponse.json({ error: 'This order is already paid or complete' }, { status: 409 });
    }

    const paymentPath = buildCardPaymentPath(order.order_number);
    const paymentUrl = `${getPublicBaseUrl(request.url)}${paymentPath}`;

    return NextResponse.json({ ok: true, paymentUrl, paymentPath });
  } catch (err) {
    console.error('[admin/orders/card-payment-link]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
