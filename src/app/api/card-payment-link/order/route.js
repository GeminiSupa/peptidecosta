import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCardPaymentOrderToken } from '@/lib/cardPaymentLink';

export const runtime = 'nodejs';

function publicOrder(order) {
  const currency = order.currency || 'USD';
  const amountUsd = Number(order.total_usd || 0);
  const amountCrc = Number(order.total_crc || 0);

  return {
    orderNumber: order.order_number,
    customerName: order.customer_name || '',
    customerEmail: order.customer_email || '',
    customerPhone: order.customer_phone || '',
    shippingAddress: order.shipping_address || '',
    currency,
    totalUsd: amountUsd,
    totalCrc: amountCrc,
    cardAmountUsd: amountUsd,
    status: order.status || 'Pending',
    items: Array.isArray(order.items)
      ? order.items.map(item => ({
          product: item.product || 'Item',
          qty: Number(item.qty || 1),
          price: Number(item.price || 0),
        }))
      : [],
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNumber = searchParams.get('order');
    const token = searchParams.get('token');

    if (!orderNumber || !token) {
      return NextResponse.json({ error: 'Payment link is missing order or token details' }, { status: 400 });
    }

    if (!verifyCardPaymentOrderToken(orderNumber, token)) {
      return NextResponse.json({ error: 'Payment link signature is invalid. Please request a fresh card payment link.' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from('orders')
      .select('order_number, customer_name, customer_email, customer_phone, shipping_address, currency, total_usd, total_crc, status, items')
      .eq('order_number', orderNumber)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message || 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, order: publicOrder(order) });
  } catch (err) {
    console.error('[card-payment-link/order]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
