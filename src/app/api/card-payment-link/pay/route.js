import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCardPaymentOrderToken, getPublicBaseUrl } from '@/lib/cardPaymentLink';
import { isShieldHubPayConfigured, normalizeShieldHubPayName, processShieldHubPayTransaction } from '@/lib/shieldHubPay';
import { claimOrderForPayment, releaseOrderClaim, describeOrderPaymentState } from '@/lib/cardPaymentLock';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { classifyPaymentOutcome, declineReasonFrom, gatewayStatusToOrderStatus, ORDER_STATUS } from '@/lib/paymentOutcome.mjs';
import { sendPaymentResultEmails } from '@/lib/paymentResultEmail.mjs';
import { parseBillingAddress } from '@/lib/billingAddress.mjs';
import { cardCheckoutMessage } from '@/lib/cardCheckoutMessages.mjs';

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

function statusToOrderStatus(status) {
  return gatewayStatusToOrderStatus(status, {
    onUnknown: (raw) => console.warn(`[card-payment-link/pay] Unrecognised gateway status "${raw}"; order left pending for review.`),
  });
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

/**
 * Stop the payment with something the customer can read.
 *
 * The paying customer here is not a developer looking at a console. Every
 * internal reason is logged and none of them is returned.
 */
function stopPayment(key, lang, httpStatus, internalReason) {
  const { message, retryable, code } = cardCheckoutMessage(key, lang);
  if (internalReason) console.error(`[card-payment-link/pay] ${code}: ${internalReason}`);
  return NextResponse.json({ error: message, errorCode: code, retryable }, { status: httpStatus });
}

export async function POST(request) {
  // Declared out here so the catch can still answer in the customer language.
  let customerLang = 'es';

  try {
    const body = await request.json();
    const { orderNumber, token, card, customerEmail, customerIp, lang = 'es' } = body;
    customerLang = lang === 'en' ? 'en' : 'es';

    // Checked after the body is read so the reply is in their language.
    if (!isShieldHubPayConfigured()) {
      return stopPayment('unavailable', customerLang, 500, 'Shield Hub Pay credentials are not configured');
    }

    if (!orderNumber || !token) {
      return stopPayment('link_invalid', lang, 400, 'Payment link is missing order or token details');
    }

    if (!verifyCardPaymentOrderToken(orderNumber, token)) {
      return stopPayment('link_invalid', lang, 403, 'Payment link signature is invalid');
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from('orders')
      // Keep this tolerant of deployment order: the discount migration may be
      // applied just after the code deploy, and select('*') does not ask
      // PostgREST for columns that are not in its schema cache yet.
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (error || !order) {
      return stopPayment('link_invalid', lang, 404, error?.message || 'Order not found');
    }

    const currentStatus = String(order.status || '').toLowerCase();
    if (currentStatus.includes('paid') || currentStatus.includes('complete')) {
      return stopPayment('already_paid', lang, 409, 'Order is already settled');
    }

    const amountUsd = Number(order.total_usd || 0);
    if (!amountUsd || amountUsd <= 0) {
      return stopPayment('unavailable', lang, 400, 'Order total is missing');
    }

    const email = String(customerEmail || order.customer_email || '').trim();
    if (!email) {
      return stopPayment('email_required', lang, 400, 'Email is required for card payment');
    }

    const normalizedCard = normalizeCard(card, order.customer_name);
    if (!normalizedCard.holder || normalizedCard.number.length < 12 || normalizedCard.cvv.length < 3 || !normalizedCard.expiry_month || !normalizedCard.expiry_year) {
      return stopPayment('card_details', lang, 400, 'Missing or invalid card details');
    }

    // Atomically claim the order so two concurrent requests can't both charge it.
    // The winner proceeds; a loser (another request already charging, or the order
    // already paid) is rejected here instead of hitting the gateway a second time.
    const claim = await claimOrderForPayment(supabase, order.order_number);
    if (!claim.claimed) {
      const state = await describeOrderPaymentState(supabase, order.order_number);
      if (state === 'settled') {
        return stopPayment('already_paid', lang, 409, 'Order is already settled');
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

    const outcome = classifyPaymentOutcome(orderStatus);
    const declineReason = outcome === 'paid' ? null : declineReasonFrom(transaction);

    if (outcome === 'paid') {
      const { error: cartCleanupError } = await markActiveAbandonedCartsConvertedForOrder(supabase, {
        ...order,
        status: orderStatus,
        customer_email: email,
      });
      if (cartCleanupError) {
        console.warn('[card-payment-link/pay] Paid cart cleanup failed:', cartCleanupError.message);
      }

      await supabase.from('admin_notifications').insert({
        type: 'payment_received',
        title: `Card payment approved: ${order.order_number}`,
        body: `Shield Hub Pay approved transaction ${transaction?.id || ''}. Verify the amount before fulfilling.`,
        link_tab: 'orders',
        link_ref: order.order_number,
      });
    }

    // One place builds this mail now, for both endings. This route only ever
    // sent a receipt on success, so a customer who followed a payment link and
    // had their card refused was told nothing at all.
    if (outcome !== 'pending') {
      const { data: orderRow } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order.id)
        .maybeSingle();

      if (orderRow) {
        await sendPaymentResultEmails(baseUrl, orderRow, order.order_number, {
          declineReason,
          logPrefix: '[card-payment-link/pay]',
        });
      }
    }

    if (outcome === 'paid') {
      return NextResponse.json({ ok: true, status: transaction.status, orderStatus, transactionId: transaction.id });
    }

    if (orderStatus === ORDER_STATUS.CARD_3DS && transaction.redirect_url && transaction.redirect_url !== 'No URL') {
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
      error: declineReason || `Payment ${transaction.status || 'failed'}`,
    }, { status: 402 });
  } catch (err) {
    console.error('[card-payment-link/pay]', err);
    // Never err.message. This is exactly where "Shield Hub Pay returned 500"
    // reached a customer part-way through a 918 dollar order, with no idea
    // whether they had been charged or what to do next.
    return stopPayment('unconfirmed', customerLang, 502, err.message);
  }
}
