/**
 * The mail that says how a card payment actually ended.
 *
 * Until this existed, nothing on the server told anyone the outcome:
 *
 *   - The team's "New Order Received!" alert is raised by /api/orders/create
 *     the moment the row is saved, which for a card order is BEFORE the charge
 *     is attempted. It therefore always read "PENDING - CARD" — on the orders
 *     that were approved seconds later just as loudly as on the ones the bank
 *     refused. Nothing ever sent a correction.
 *
 *   - The customer's receipt was sent by the checkout page in the browser,
 *     from the tab, after the charge returned. That works right up until the
 *     tab does not come back: a 3DS redirect leaves the page mid-payment, and
 *     a closed laptop or a dropped connection ends the send outright. In both
 *     cases the last thing the customer had been told was "pending", and the
 *     webhook that later learns the real answer sent no mail at all.
 *
 * So the result mail is sent from the server, on the request path, by whichever
 * route learns the outcome first — the direct charge or the webhook.
 */

import { buildOrderNotificationPayload } from './adminOrderEmail.mjs';
import { internalJsonHeaders } from './internalRequestAuth.mjs';
import { classifyPaymentOutcome } from './paymentOutcome.mjs';

// Same budget as the team's new-order alert: it must outlive the mail route's
// own SMTP connection budget, or a healthy cold connection gets aborted here
// before the route has recorded any provider response.
export const PAYMENT_RESULT_EMAIL_TIMEOUT_MS = 30000;

/** Only a settled outcome is worth mailing. A 3DS hand-off is not news. */
export function shouldSendPaymentResultEmail(status) {
  return classifyPaymentOutcome(status) !== 'pending';
}

/**
 * Mail the customer their result, and the team the correction to their alert.
 *
 * One request sends both, so the two can never disagree about the status.
 * Never throws: a payment that went through must not be reported as failed
 * because the mail server was slow. The caller gets the outcome to log.
 *
 * @returns {Promise<{sent: boolean, skipped?: string, error?: string, results?: object}>}
 */
export async function sendPaymentResultEmails(baseUrl, order, orderNumber, {
  declineReason = null,
  // True for a card checkout, where /api/orders/create deliberately held its
  // team alert back so this is the only one the team gets. False when the
  // order was already alerted on and this is genuinely a later payment — an
  // order paid days afterwards through a payment link, say.
  firstTeamAlert = false,
  fetchImpl = fetch,
  timeoutMs = PAYMENT_RESULT_EMAIL_TIMEOUT_MS,
  logPrefix = '[Payment result email]',
  internalSecret = undefined,
} = {}) {
  const status = order?.status;

  if (!shouldSendPaymentResultEmail(status)) {
    return { sent: false, skipped: 'not-settled' };
  }

  const payload = buildOrderNotificationPayload(order, orderNumber, {
    // Both mails, one call, one status.
    adminNotificationOnly: false,
    customerReceiptOnly: false,
    // The customer is owed this one even though the alert rides along.
    forceCustomerReceipt: true,
    notificationKind: 'payment-result',
    declineReason,
    firstTeamAlert,
  });

  try {
    const body = JSON.stringify(payload);
    const response = await fetchImpl(`${baseUrl}/api/order-notification`, {
      method: 'POST',
      headers: internalJsonHeaders(body, '/api/order-notification', { secret: internalSecret }),
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const result = await response.json().catch(() => ({}));
    const customer = result?.results?.customerReceipt;
    const admin = result?.results?.adminNotification;

    if (!response.ok) {
      console.error(`${logPrefix} ${orderNumber}: notification route returned ${response.status}`);
      return { sent: false, error: result?.error || `HTTP ${response.status}`, results: result?.results };
    }

    // Logged apart, because they fail apart: a customer address that bounces
    // must still leave the team with a corrected alert, and vice versa.
    if (customer?.sent === false && !customer?.skipped) {
      console.error(`${logPrefix} ${orderNumber}: customer receipt failed — ${customer.error || 'unknown error'}`);
    }
    if (admin?.sent === false) {
      console.error(`${logPrefix} ${orderNumber}: team alert failed — ${admin.error || 'unknown error'}`);
    }
    if (customer?.sent || admin?.sent) {
      console.log(`${logPrefix} ${orderNumber}: sent for status "${status}" (customer=${!!customer?.sent}, team=${!!admin?.sent})`);
    }

    return { sent: Boolean(customer?.sent || admin?.sent), results: result?.results };
  } catch (error) {
    console.error(`${logPrefix} ${orderNumber}: send failed —`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * The note that goes out when a card is handed to the bank for 3D-Secure.
 *
 * Customer only, and only for that hand-off. The checkout page used to send
 * this before redirecting; removing it outright would leave a customer who is
 * bounced to their bank with no record of the order at all until the webhook
 * lands — and if the webhook never lands, with nothing ever. So it is kept,
 * saying honestly that the payment is still being confirmed, and the real
 * answer follows from /api/shieldhubpay/webhook.
 *
 * The team is not copied: /api/orders/create has already raised its alert for
 * this order, and a hand-off is not news.
 */
export async function sendCardHandoffReceipt(baseUrl, order, orderNumber, {
  fetchImpl = fetch,
  timeoutMs = PAYMENT_RESULT_EMAIL_TIMEOUT_MS,
  logPrefix = '[Card 3DS receipt]',
  internalSecret = undefined,
} = {}) {
  const payload = buildOrderNotificationPayload(order, orderNumber, {
    adminNotificationOnly: false,
    customerReceiptOnly: true,
    forceCustomerReceipt: true,
  });

  try {
    const body = JSON.stringify(payload);
    const response = await fetchImpl(`${baseUrl}/api/order-notification`, {
      method: 'POST',
      headers: internalJsonHeaders(body, '/api/order-notification', { secret: internalSecret }),
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const result = await response.json().catch(() => ({}));
    const sent = Boolean(result?.results?.customerReceipt?.sent);
    if (!sent) {
      console.warn(`${logPrefix} ${orderNumber}: not sent — ${result?.results?.customerReceipt?.error || `HTTP ${response.status}`}`);
    }
    return { sent };
  } catch (error) {
    console.error(`${logPrefix} ${orderNumber}: send failed —`, error.message);
    return { sent: false, error: error.message };
  }
}
