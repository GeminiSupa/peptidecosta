import { NextResponse, after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isShieldHubPayConfigured, normalizeShieldHubPayName, processShieldHubPayTransaction } from '@/lib/shieldHubPay';
import { claimOrderForPayment, releaseOrderClaim, describeOrderPaymentState } from '@/lib/cardPaymentLock';
import { classifyPaymentOutcome, declineReasonFrom, gatewayStatusToOrderStatus, ORDER_STATUS } from '@/lib/paymentOutcome.mjs';
import { sendCardHandoffReceipt, sendPaymentResultEmails } from '@/lib/paymentResultEmail.mjs';
import { sendAdminOrderEmail } from '@/lib/adminOrderEmail.mjs';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { getPublicSiteUrl } from '@/lib/publicUrl';
import { sendCustomerOrderConfirmation } from '@/lib/orderWhatsAppAlerts';

export const runtime = 'nodejs';
// after() work is billed against the route's budget, and the charge round-trip
// has already spent some of it by the time the confirmation is queued.
export const maxDuration = 60;

const APP_URL = getPublicSiteUrl();

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

  // Format from catalog: line[0]=address, line[1]=district,canton,province, line[2]=zip
  const address = lines[0] || 'N/A';
  const postalCode = lines[2] || '10101';
  const locationLine = lines[1] || '';
  const areaParts = locationLine.split(',').map(part => part.trim()).filter(Boolean);

  // areaParts should be [district, canton, province]
  // Use canton (index 1) as city, district (index 0) as state
  const city = areaParts[1] || areaParts[0] || 'San Jose';
  const state = areaParts[0] || 'San Jose';

  return {
    address,
    postal_code: postalCode,
    city,
    state,
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
  return gatewayStatusToOrderStatus(status, {
    onUnknown: (raw) => console.warn(`[Shield Hub Pay] Unrecognised gateway status "${raw}"; order left pending for review.`),
  });
}

export async function POST(req) {
  // Read before the try so the catch can still name the order it was charging.
  let failedOrderNumber = null;

  try {
    if (!isShieldHubPayConfigured()) {
      return NextResponse.json({ error: 'Shield Hub Pay credentials are not configured' }, { status: 500 });
    }

    const body = await req.json();
    failedOrderNumber = body?.orderNumber || null;
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

    // Ask the shared classifier, not `transaction.status === 'Approved'`. The
    // gateway answers "Approved" here and "approved" when a transaction is
    // re-read for a webhook, and the exact-match version of this line sent a
    // settled payment down the declined branch.
    const outcome = classifyPaymentOutcome(orderStatus);
    const declineReason = outcome === 'paid' ? null : declineReasonFrom(transaction);

    // Tell the customer how it ended, from here.
    //
    // The checkout page used to send this from the browser after reading the
    // response. That leaves the one message the customer actually cares about
    // dependent on their tab surviving the round trip — and on a 3DS redirect
    // the tab is already gone. Sent on the request path rather than in
    // after(), for the same reason the order alerts were moved out of it: work
    // queued there on this deployment has gone missing before, and a receipt
    // nobody can prove was sent is the problem being fixed.
    if (outcome !== 'pending') {
      const { data: orderRow } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .maybeSingle();

      if (orderRow) {
        // /api/orders/create held the team's alert for this order, so this
        // one mail is both the new-order alert and the payment outcome.
        await sendPaymentResultEmails(baseUrl, orderRow, orderNumber, {
          declineReason,
          firstTeamAlert: true,
        });
      } else {
        console.warn(`[Shield Hub Pay] No order row for ${orderNumber}; payment result email not sent`);
      }
    }

    if (outcome === 'paid') {
      // orders/create holds the customer confirmation back for card orders so
      // nobody is told "confirmed" before the charge clears. This is where it
      // gets sent — after the response, so a slow Meta round-trip is not added
      // to the wait the customer sits through on the payment screen.
      after(async () => {
        try {
          const { data: orderData } = await supabase.from('orders').select('*').eq('order_number', orderNumber).maybeSingle();
          if (orderData) {
            await sendCustomerOrderConfirmation(supabase, orderData, orderNumber, orderData.id);
          } else {
            console.warn(`[Shield Hub Pay] No order row for ${orderNumber}; customer confirmation not sent`);
          }
        } catch (waErr) {
          console.error('[Shield Hub Pay] Delayed WhatsApp confirmation failed:', waErr);
        }
      });
      return NextResponse.json({ ok: true, status: transaction.status, orderStatus, transactionId: transaction.id });
    }

    if (orderStatus === ORDER_STATUS.CARD_3DS && transaction.redirect_url && transaction.redirect_url !== 'No URL') {
      // Queued rather than awaited: the customer is about to be sent to their
      // bank and must not sit through an SMTP round trip first. If it is lost,
      // the webhook still delivers the real answer once the bank replies.
      after(async () => {
        try {
          const { data: orderRow } = await supabase
            .from('orders')
            .select('*')
            .eq('order_number', orderNumber)
            .maybeSingle();
          if (orderRow) await sendCardHandoffReceipt(baseUrl, orderRow, orderNumber);
        } catch (mailErr) {
          console.error('[Shield Hub Pay] 3DS hand-off receipt failed:', mailErr);
        }
      });

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
  } catch (error) {
    console.error('[Shield Hub Pay] Card processing failed:', error);

    // The order row exists but the charge never produced an answer, so no
    // result mail is coming. /api/orders/create held its team alert for this
    // order expecting one — send it now, or a real order that failed on the
    // way to the gateway reaches the team by the dashboard bell alone.
    await sendDeferredTeamAlertOnFailure(failedOrderNumber);

    return NextResponse.json({ error: error.message || 'Card payment failed' }, { status: 502 });
  }
}

/** Never throws: this runs inside a catch that already has a response to send. */
async function sendDeferredTeamAlertOnFailure(orderNumber) {
  if (!orderNumber) return;
  try {
    const supabase = getSupabaseAdmin();
    const { data: orderRow } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', orderNumber)
      .maybeSingle();
    if (orderRow) {
      await sendAdminOrderEmail(APP_URL.replace(/\/$/, ''), orderRow, orderNumber);
    }
  } catch (mailErr) {
    console.error('[Shield Hub Pay] Deferred team alert failed:', mailErr.message);
  }
}
