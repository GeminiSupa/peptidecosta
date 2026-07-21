import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isShieldHubPayConfigured, normalizeShieldHubPayName, processShieldHubPayTransaction } from '@/lib/shieldHubPay';
import { claimOrderForPayment, releaseOrderClaim, describeOrderPaymentState } from '@/lib/cardPaymentLock';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';

export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://peptidecosta.vercel.app');

function normalizeAmount(amount, currency) {
  return currency === 'CRC'
    ? String(Math.round(Number(amount)))
    : Number(amount).toFixed(2);
}

function splitName(name = '') {
  const parts = normalizeShieldHubPayName(name).split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || 'Customer',
    last: parts.slice(1).join(' ') || parts[0] || 'Customer',
  };
}

function parseBillingAddress(shippingAddress = '') {
  const lines = shippingAddress.split('\n').map(line => line.trim()).filter(Boolean);
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

function buildPaymentPatch(status, transaction) {
  return {
    status,
    payment_transaction_id: transaction?.id ? String(transaction.id) : null,
    payment_provider_status: transaction?.status || null,
    payment_authorization: transaction?.authorization || null,
    payment_descriptor: transaction?.descriptor_text || null,
    payment_provider_response: transaction || null,
  };
}

async function updateOrderStatus(orderNumber, status, transaction, orderContact = {}) {
  if (!orderNumber) return;

  try {
    const supabase = getSupabaseAdmin();
    const patch = buildPaymentPatch(status, transaction);
    const { error } = await supabase
      .from('orders')
      .update(patch)
      .eq('order_number', orderNumber);

    if (error) {
      const fallback = await supabase
        .from('orders')
        .update({ status })
        .eq('order_number', orderNumber);

      if (fallback.error) throw fallback.error;
      console.warn('[Shield Hub Pay] Payment metadata columns unavailable; updated status only:', error.message);
    }

    if (status === 'Paid') {
      const { error: cartCleanupError } = await markActiveAbandonedCartsConvertedForOrder(supabase, {
        status,
        customer_email: orderContact.customerEmail,
        customer_phone: orderContact.customerPhone,
      });
      if (cartCleanupError) {
        console.warn('[Shield Hub Pay] Paid cart cleanup failed:', cartCleanupError.message);
      }

      await supabase.from('admin_notifications').insert({
        type: 'payment_received',
        title: `Card payment approved: ${orderNumber}`,
        body: `Shield Hub Pay approved transaction ${transaction?.id || ''}. Verify the amount before fulfilling.`,
        link_tab: 'orders',
        link_ref: orderNumber,
      });
    }
  } catch (error) {
    console.error('[Shield Hub Pay] Order status update failed:', error.message);
  }
}

function statusToOrderStatus(status) {
  if (status === 'Approved') return 'Paid';
  if (status === 'Declined') return 'Declined';
  if (status === 'Failed') return 'Error';
  if (status === 'Redirect') return 'Pending - Card 3DS';
  return `Payment ${status || 'Pending'}`;
}

export async function POST(req) {
  try {
    if (!isShieldHubPayConfigured()) {
      return NextResponse.json({ error: 'Shield Hub Pay credentials are not configured' }, { status: 500 });
    }

    const body = await req.json();
    const {
      amount,
      currency = 'USD',
      orderNumber,
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,
      customerIp,
      card,
      lang = 'es',
    } = body;

    if (!amount || !orderNumber || !customerName || !customerPhone || !customerEmail || !shippingAddress) {
      return NextResponse.json({ error: 'Missing required billing fields' }, { status: 400 });
    }

    if (currency !== 'USD') {
      return NextResponse.json({ error: 'Card payments are currently configured for USD only' }, { status: 400 });
    }

    const normalizedCard = normalizeCard(card, customerName);
    if (!normalizedCard.holder || normalizedCard.number.length < 12 || normalizedCard.cvv.length < 3 || !normalizedCard.expiry_month || !normalizedCard.expiry_year) {
      return NextResponse.json({ error: 'Missing or invalid card details' }, { status: 400 });
    }

    // Atomically claim the order so two concurrent requests can't both charge it
    // (a double-click, two tabs, or a resend). The winner charges; a loser — the
    // order already paid, or already being processed — is rejected before the
    // gateway is touched a second time.
    const supabase = getSupabaseAdmin();
    const claim = await claimOrderForPayment(supabase, orderNumber);
    if (!claim.claimed) {
      const state = await describeOrderPaymentState(supabase, orderNumber);
      if (state === 'not_found') {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }
      if (state === 'settled') {
        return NextResponse.json({ error: 'This order is already paid' }, { status: 409 });
      }
      return NextResponse.json(
        { error: 'A payment for this order is already being processed. Please wait a moment before trying again.' },
        { status: 409 },
      );
    }

    const name = splitName(customerName);
    const formattedAmount = normalizeAmount(amount, currency);
    const baseUrl = APP_URL.replace(/\/$/, '');

    let transaction;
    try {
      transaction = await processShieldHubPayTransaction({
        amount: formattedAmount,
        currency,
        transaction_reference: orderNumber,
        redirectback_url: `${baseUrl}/thank-you?lang=${encodeURIComponent(lang)}&order=${encodeURIComponent(orderNumber)}`,
        notification_url: `${baseUrl}/api/shieldhubpay/webhook`,
        customer: {
          first: name.first,
          last: name.last,
          email: customerEmail,
          phone: customerPhone,
          ip: customerIp || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1',
        },
        billing: parseBillingAddress(shippingAddress),
        card: normalizedCard,
      });
    } catch (chargeErr) {
      // No charge result — release the claim so the customer can retry instead of
      // the order being stuck as "processing".
      await releaseOrderClaim(supabase, orderNumber);
      throw chargeErr;
    }

    const orderStatus = statusToOrderStatus(transaction.status);
    await updateOrderStatus(orderNumber, orderStatus, transaction, { customerEmail, customerPhone });

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
  } catch (error) {
    console.error('[Shield Hub Pay] Card processing failed:', error);
    return NextResponse.json({ error: error.message || 'Card payment failed' }, { status: 502 });
  }
}
