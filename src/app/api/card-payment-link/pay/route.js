import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCardPaymentOrderToken, getPublicBaseUrl } from '@/lib/cardPaymentLink';
import { isShieldHubPayConfigured, normalizeShieldHubPayName, processShieldHubPayTransaction } from '@/lib/shieldHubPay';
import { claimOrderForPayment, releaseOrderClaim, describeOrderPaymentState } from '@/lib/cardPaymentLock';

export const runtime = 'nodejs';

function normalizeCard(card = {}, fallbackHolder = 'Customer') {
  const expiry = String(card.expiry || '').replace(/\s+/g, '');
  const [rawMonth, rawYear] = expiry.includes('/') ? expiry.split('/') : [card.expiryMonth, card.expiryYear];
  const expiryMonth = String(rawMonth || '').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const yearDigits = String(rawYear || '').replace(/\D/g, '');
  const expiryYear = yearDigits.length === 4 ? yearDigits.slice(2) : yearDigits;

  return {
    holder: normalizeShieldHubPayName(card.holder, fallbackHolder),
    number: String(card.number || '').replace(/\D/g, ''),
    cvv: String(card.cvv || '').replace(/\D/g, ''),
    expiry_month: expiryMonth,
    expiry_year: expiryYear,
  };
}

function splitName(name = '') {
  const parts = normalizeShieldHubPayName(name).split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || 'Customer',
    last: parts.slice(1).join(' ') || parts[0] || 'Customer',
  };
}

function parseBillingAddress(shippingAddress = '') {
  const lines = String(shippingAddress || '').split('\n').map(line => line.trim()).filter(Boolean);
  const area = lines[2] || '';
  const areaParts = area.split(',').map(part => part.trim()).filter(Boolean);

  return {
    address: lines[3] || lines[0] || 'N/A',
    postal_code: lines[4] || '10101',
    city: areaParts[1] || areaParts[0] || 'San Jose',
    state: areaParts[0] || 'San Jose',
    country: 'CR',
  };
}

function statusToOrderStatus(status) {
  if (status === 'Approved') return 'Paid';
  if (status === 'Declined') return 'Declined';
  if (status === 'Failed') return 'Error';
  if (status === 'Redirect') return 'Pending - Card 3DS';
  return `Payment ${status || 'Pending'}`;
}

function buildPaymentPatch(status, transaction, email) {
  return {
    status,
    payment_method: 'card',
    customer_email: email,
    payment_transaction_id: transaction?.id ? String(transaction.id) : null,
    payment_provider_status: transaction?.status || null,
    payment_authorization: transaction?.authorization || null,
    payment_descriptor: transaction?.descriptor_text || null,
    payment_provider_response: transaction || null,
  };
}

export async function POST(request) {
  try {
    if (!isShieldHubPayConfigured()) {
      return NextResponse.json({ error: 'Shield Hub Pay credentials are not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { orderNumber, token, card, customerEmail, customerIp, lang = 'es' } = body;

    if (!orderNumber || !token) {
      return NextResponse.json({ error: 'Payment link is missing order or token details' }, { status: 400 });
    }

    if (!verifyCardPaymentOrderToken(orderNumber, token)) {
      return NextResponse.json({ error: 'Payment link signature is invalid. Please request a fresh card payment link.' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, customer_phone, customer_email, shipping_address, currency, total_usd, total_crc, shipping_cost_usd, shipping_cost_crc, items, status')
      .eq('order_number', orderNumber)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: error?.message || 'Order not found' }, { status: 404 });
    }

    const currentStatus = String(order.status || '').toLowerCase();
    if (currentStatus.includes('paid') || currentStatus.includes('complete')) {
      return NextResponse.json({ error: 'This order is already paid' }, { status: 409 });
    }

    const amountUsd = Number(order.total_usd || 0);
    if (!amountUsd || amountUsd <= 0) {
      return NextResponse.json({ error: 'Order total is missing' }, { status: 400 });
    }

    const email = String(customerEmail || order.customer_email || '').trim();
    if (!email) {
      return NextResponse.json({ error: 'Email is required for card payment' }, { status: 400 });
    }

    const normalizedCard = normalizeCard(card, order.customer_name);
    if (!normalizedCard.holder || normalizedCard.number.length < 12 || normalizedCard.cvv.length < 3 || !normalizedCard.expiry_month || !normalizedCard.expiry_year) {
      return NextResponse.json({ error: 'Missing or invalid card details' }, { status: 400 });
    }

    // Atomically claim the order so two concurrent requests can't both charge it.
    // The winner proceeds; a loser (another request already charging, or the order
    // already paid) is rejected here instead of hitting the gateway a second time.
    const claim = await claimOrderForPayment(supabase, order.order_number);
    if (!claim.claimed) {
      const state = await describeOrderPaymentState(supabase, order.order_number);
      if (state === 'settled') {
        return NextResponse.json({ error: 'This order is already paid' }, { status: 409 });
      }
      return NextResponse.json(
        { error: 'A payment for this order is already being processed. Please wait a moment before trying again.' },
        { status: 409 },
      );
    }

    const baseUrl = getPublicBaseUrl(request.url);
    const name = splitName(order.customer_name);
    let transaction;
    try {
      transaction = await processShieldHubPayTransaction({
        amount: amountUsd.toFixed(2),
        currency: 'USD',
        transaction_reference: order.order_number,
        redirectback_url: `${baseUrl}/thank-you?lang=${encodeURIComponent(lang)}&order=${encodeURIComponent(order.order_number)}`,
        notification_url: `${baseUrl}/api/shieldhubpay/webhook`,
        customer: {
          first: name.first,
          last: name.last,
          email,
          phone: order.customer_phone,
          ip: customerIp || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1',
        },
        billing: parseBillingAddress(order.shipping_address),
        card: normalizedCard,
      });
    } catch (chargeErr) {
      // The charge never produced a result, so release the claim to let the
      // customer retry rather than leaving the order stuck as "processing".
      await releaseOrderClaim(supabase, order.order_number);
      throw chargeErr;
    }

    const orderStatus = statusToOrderStatus(transaction.status);
    const patch = buildPaymentPatch(orderStatus, transaction, email);
    const { error: updateError } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', order.id);

    if (updateError) {
      const fallback = await supabase
        .from('orders')
        .update({ status: orderStatus, payment_method: 'card', customer_email: email })
        .eq('id', order.id);
      if (fallback.error) throw fallback.error;
      console.warn('[card-payment-link/pay] Payment metadata columns unavailable; updated status only:', updateError.message);
    }

    if (orderStatus === 'Paid') {
      await supabase.from('admin_notifications').insert({
        type: 'payment_received',
        title: `Card payment approved: ${order.order_number}`,
        body: `Shield Hub Pay approved transaction ${transaction?.id || ''}. Verify the amount before fulfilling.`,
        link_tab: 'orders',
        link_ref: order.order_number,
      });

      try {
        const items = Array.isArray(order.items) ? order.items : [];
        const subtotal = items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.qty) || 0)), 0);
        const currency = order.currency || 'USD';
        const shipping = currency === 'CRC' ? Number(order.shipping_cost_crc || 0) : Number(order.shipping_cost_usd || 0);
        const total = currency === 'CRC' ? Number(order.total_crc || 0) : Number(order.total_usd || 0);

        await fetch(`${baseUrl}/api/order-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNumber: order.order_number,
            customerName: order.customer_name,
            customerPhone: order.customer_phone,
            customerEmail: email,
            shippingAddress: order.shipping_address,
            items,
            total,
            totalUsd: order.total_usd,
            totalCrc: order.total_crc,
            subtotal,
            volumeDiscount: 0,
            promoDiscount: 0,
            shipping,
            currency,
            paymentMethod: 'card',
            status: orderStatus,
            customerReceiptOnly: true,
            forceCustomerReceipt: true,
            lang,
          }),
        });
      } catch (notifyError) {
        console.error('[card-payment-link/pay] Customer receipt failed:', notifyError);
      }
    }

    if (transaction.status === 'Approved') {
      return NextResponse.json({ ok: true, status: transaction.status, orderStatus, transactionId: transaction.id });
    }

    if (transaction.status === 'Redirect' && transaction.redirect_url && transaction.redirect_url !== 'No URL') {
      return NextResponse.json({
        ok: true,
        status: transaction.status,
        orderStatus,
        transactionId: transaction.id,
        paymentUrl: transaction.redirect_url,
      });
    }

    return NextResponse.json({
      ok: false,
      status: transaction.status,
      orderStatus,
      transactionId: transaction.id,
      error: transaction?.error?.messsage || transaction?.error?.message || `Payment ${transaction.status || 'failed'}`,
    }, { status: 402 });
  } catch (err) {
    console.error('[card-payment-link/pay]', err);
    return NextResponse.json({ error: err.message || 'Card payment failed' }, { status: 502 });
  }
}
