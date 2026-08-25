import { NextResponse, after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isShieldHubPayConfigured, normalizeShieldHubPayName, processShieldHubPayTransaction } from '@/lib/shieldHubPay';
import { claimOrderForPayment, releaseOrderClaim, describeOrderPaymentState } from '@/lib/cardPaymentLock';
import { classifyPaymentOutcome, declineReasonFrom, gatewayStatusToOrderStatus, ORDER_STATUS } from '@/lib/paymentOutcome.mjs';
import { sendCardHandoffReceipt, sendPaymentResultEmails } from '@/lib/paymentResultEmail.mjs';
import { sendAdminOrderEmail } from '@/lib/adminOrderEmail.mjs';
import { cardCheckoutMessage } from '@/lib/cardCheckoutMessages.mjs';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { getPublicSiteUrl } from '@/lib/publicUrl';
import { sendCustomerOrderConfirmation } from '@/lib/orderWhatsAppAlerts';
import { parseBillingAddress } from '@/lib/billingAddress.mjs';
import { withPaymentStatusActivity } from '@/lib/paymentStatusActivity.mjs';

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

async function updateOrderStatus(orderNumber, status, transaction, orderContact = {}, existingOrder = {}) {
  if (!orderNumber) return;

  try {
    const supabase = getSupabaseAdmin();
    const patch = withPaymentStatusActivity(
      existingOrder,
      buildPaymentPatch(status, transaction),
    );
    const { error } = await supabase
      .from('orders')
      .update(patch)
      .eq('order_number', orderNumber);

    if (error) {
      const fallback = await supabase
        .from('orders')
        .update({ status, activity_log: patch.activity_log })
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

/**
 * Stop the checkout with something the customer can read.
 *
 * The internal reason is logged, never returned: a buyer has no use for
 * "credentials are not configured" and no business being told it.
 */
function stopCheckout(key, lang, httpStatus, internalReason) {
  const { message, retryable, code } = cardCheckoutMessage(key, lang);
  if (internalReason) console.error(`[Shield Hub Pay] ${code}: ${internalReason}`);
  return NextResponse.json({ error: message, errorCode: code, retryable }, { status: httpStatus });
}

export async function POST(req) {
  // Read before the try so the catch can still name the order it was charging.
  let failedOrderNumber = null;
  let customerLang = 'es';

  try {
    const body = await req.json();
    failedOrderNumber = body?.orderNumber || null;
    customerLang = body?.lang === 'en' ? 'en' : 'es';

    // Checked after the body is read so the customer is answered in their own
    // language rather than a default one.
    if (!isShieldHubPayConfigured()) {
      return stopCheckout('unavailable', customerLang, 500,
        'Shield Hub Pay credentials are not configured');
    }

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
      return stopCheckout('missing_details', lang, 400,
        `Missing required billing fields for ${orderNumber || 'unknown order'}`);
    }

    if (currency !== 'USD') {
      return stopCheckout('unavailable', lang, 400,
        `Card payment attempted in ${currency}; only USD is configured`);
    }

    const normalizedCard = normalizeCard(card, customerName);
    if (!normalizedCard.holder || normalizedCard.number.length < 12 || normalizedCard.cvv.length < 3 || !normalizedCard.expiry_month || !normalizedCard.expiry_year) {
      return stopCheckout('card_details', lang, 400, `Invalid card details for ${orderNumber}`);
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
        return stopCheckout('unavailable', lang, 404, `Order ${orderNumber} not found`);
      }
      if (state === 'settled') {
        return stopCheckout('already_paid', lang, 409, `Order ${orderNumber} is already settled`);
      }
      return stopCheckout('in_progress', lang, 409, `Order ${orderNumber} is already being charged`);
    }

    const name = splitName(customerName);

    // Price the charge from the order row, never from the request body.
    //
    // `amount` is POSTed by the browser, and until this existed it was handed
    // straight to the gateway. A $900 order could be charged $1 by anyone
    // willing to edit the request, and the order still came back marked Paid.
    // The claim above already returned the stored row, so the authoritative
    // figure is in hand without a second read.
    const storedAmount = Number(claim.order?.total_usd || 0);
    if (!Number.isFinite(storedAmount) || storedAmount <= 0) {
      // Nothing trustworthy to charge. Release the claim first, or the order is
      // stranded in PROCESSING_STATUS with no way for the customer to retry.
      await releaseOrderClaim(supabase, orderNumber);
      return stopCheckout('unavailable', lang, 400,
        `Order ${orderNumber} has no usable stored USD total; refusing to charge a request-supplied amount`);
    }

    // Logged, not refused. The two figures are expected to differ by a few
    // cents on a colón order: the row stores total_usd rounded to whole dollars
    // while the checkout sends the same conversion to two decimals. Refusing on
    // that difference would reject every CRC card payment. What matters is that
    // the number below comes from the database — a disagreement worth chasing
    // shows up here without standing between a real customer and their order.
    const requestedAmount = Number(amount);
    if (Number.isFinite(requestedAmount) && Math.abs(requestedAmount - storedAmount) > 0.01) {
      console.warn(
        `[Shield Hub Pay] Amount mismatch for ${orderNumber}: request said ${requestedAmount}, charging stored ${storedAmount}`
      );
    }

    const formattedAmount = normalizeAmount(storedAmount, currency);
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
    await updateOrderStatus(
      orderNumber,
      orderStatus,
      transaction,
      { customerEmail, customerPhone },
      claim.order,
    );

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
      // Labelled so the checkout knows this one carries the bank's own
      // wording and still deserves our "try another card" sentence.
      errorCode: 'declined',
      retryable: true,
      error: declineReason || `Payment ${transaction.status || 'failed'}`,
    }, { status: 402 });
  } catch (error) {
    console.error('[Shield Hub Pay] Card processing failed:', error);

    // The order row exists but the charge never produced an answer, so no
    // result mail is coming. /api/orders/create held its team alert for this
    // order expecting one — send it now, or a real order that failed on the
    // way to the gateway reaches the team by the dashboard bell alone.
    await sendDeferredTeamAlertOnFailure(failedOrderNumber);

    // Never `error.message` here. It is raw exception text, and worse, it was
    // shown to the customer beside an invitation to try again — while we have
    // no idea whether the card was charged.
    return stopCheckout('unconfirmed', customerLang, 502,
      `Charge for ${failedOrderNumber || 'unknown order'} threw: ${error.message}`);
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
