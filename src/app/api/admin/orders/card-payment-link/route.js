import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { buildCardPaymentPath, canSignCardPaymentLinks, getPublicBaseUrl } from '@/lib/cardPaymentLink';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
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
      .select('id, order_number, status')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message || 'Order not found' }, { status: 404 });
    }

    if (!order.order_number) {
      return NextResponse.json({ error: 'Order number is missing' }, { status: 400 });
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
