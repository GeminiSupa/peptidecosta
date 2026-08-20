/**
 * The "New Order Received" email that goes to the team.
 *
 * This lives outside the route so it can be exercised without a live SMTP
 * connection: `sendAdminOrderEmail` takes the fetch implementation as an
 * argument precisely so a test can watch what would have been sent.
 */

/**
 * How long we wait for /api/order-notification to finish sending.
 *
 * This is time the customer spends on the checkout spinner, so it is far
 * tighter than the old value — but it is still a real wait, not a hand-off.
 * The email used to be dispatched from `after()`, which never ran on this
 * deployment; the alert simply vanished, exactly as the WhatsApp alerts did
 * before they were moved onto the request path. Waiting is what makes the
 * send observable, and an observable failure is worth a couple of seconds.
 */
// This must outlive the mail route's own SMTP connection/greeting budget.
// Otherwise the caller can abort a healthy cold SMTP connection before the
// mail route has reached its own timeout and no provider response is recorded.
export const ADMIN_EMAIL_TIMEOUT_MS = 30000;

/**
 * The /api/order-notification body for one order row.
 *
 * Defaults to the team's new-order alert, which is all this ever built. The
 * options exist so the payment-result mail can reuse the same arithmetic
 * instead of a fourth hand-rolled copy of it — the totals, the discounts and
 * the shipping line are worked out here and nowhere else.
 */
export function buildOrderNotificationPayload(order, orderNumber, {
  adminNotificationOnly = true,
  customerReceiptOnly = false,
  forceCustomerReceipt = false,
  notificationKind = 'new-order',
  declineReason = null,
  // True when /api/orders/create held its alert back for this order, so the
  // result mail is the team's first and only sight of it.
  firstTeamAlert = false,
  status = undefined,
} = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const currency = order.currency || 'USD';
  const itemsAmount = items.reduce((sum, item) => {
    return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
  }, 0);
  const shipping = currency === 'CRC'
    ? Number(order.shipping_cost_crc || 0)
    : Number(order.shipping_cost_usd || 0);
  const promoDiscount = currency === 'CRC'
    ? Number(order.discount_amount_crc || 0)
    : Number(order.discount_amount_usd || 0);
  const manualDiscount = currency === 'CRC'
    ? Number(order.manual_discount_amount_crc || 0)
    : Number(order.manual_discount_amount_usd || 0);
  const total = currency === 'CRC'
    ? Number(order.total_crc || 0)
    : Number(order.total_usd || 0);
  const volumeDiscount = Math.max(0, itemsAmount - promoDiscount - manualDiscount + shipping - total);

  return {
    orderNumber,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerEmail: order.customer_email || '',
    shippingAddress: order.shipping_address,
    customerIdType: order.customer_id_type,
    customerIdNumber: order.customer_id_number,
    items,
    total,
    totalUsd: order.total_usd,
    totalCrc: order.total_crc,
    subtotal: itemsAmount,
    volumeDiscount,
    promoDiscount,
    manualDiscount,
    manualDiscountReason: String(order.manual_discount_reason || '').trim() || null,
    shipping,
    currency,
    paymentMethod: order.payment_method,
    status: status || order.status || 'Pending',
    customerIdType: order.customer_id_type,
    customerIdNumber: order.customer_id_number,
    // What the gateway said when it refused, so the customer is told why
    // rather than just "declined". Null on anything that went through.
    declineReason,
    // 'new-order' is the alert raised the moment an order is saved;
    // 'payment-result' is the follow-up that says how the card ended.
    notificationKind,
    firstTeamAlert,
    // Which of the two mails this call is allowed to send. The team alert is
    // admin-only: dropping that flag double-mails every customer.
    adminNotificationOnly,
    customerReceiptOnly,
    forceCustomerReceipt,
    lang: currency === 'CRC' ? 'es' : 'en',
  };
}

export async function sendAdminOrderEmail(baseUrl, order, orderNumber, {
  fetchImpl = fetch,
  timeoutMs = ADMIN_EMAIL_TIMEOUT_MS,
} = {}) {
  const response = await fetchImpl(`${baseUrl}/api/order-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOrderNotificationPayload(order, orderNumber)),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const result = await response.json().catch(() => ({}));
  const adminResult = result?.results?.adminNotification;

  // The notification route historically caught sendMail errors and returned
  // HTTP 200. Treat its structured failure as a failure too, so order creation
  // never logs "completed" for an email the SMTP provider did not accept.
  if (!response.ok || adminResult?.sent === false || result?.success === false) {
    throw new Error(
      adminResult?.error || result?.error || result?.details || `Order notification returned ${response.status}`
    );
  }

  return result;
}
