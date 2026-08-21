/**
 * The status a brand-new storefront order is allowed to start in.
 *
 * /api/orders/create took `status` out of the POST body and wrote it down. The
 * endpoint is public — it has to be, customers order without accounts — and it
 * runs on the service-role client, so nothing below it questioned the value
 * either. Posting `status: 'Paid'` produced a paid order that no money had ever
 * been attached to: it showed as settled in the panel, it satisfied the
 * "Paid" test the weekly commission scan runs, and it was indistinguishable
 * from a real sale.
 *
 * No checkout ever needed that. The storefront sends exactly two values — the
 * card flow opens at 'Pending - Card' so the charge can move it, everything
 * else opens at 'Pending' and is settled by hand. Both are derived from the
 * payment method, so the body never has to be consulted at all.
 *
 * A real payment moves the order on from here: /api/shieldhubpay/process-card,
 * the webhook, or a staff member in the admin panel. Those paths are
 * authenticated or answer to the gateway; this one is not, so it may only ever
 * open an order as unpaid.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

/** Card orders wait on the gateway; the charge or the webhook moves them on. */
export const CHECKOUT_CARD_STATUS = 'Pending - Card';

/** Everything else is settled by hand and starts plainly pending. */
export const CHECKOUT_DEFAULT_STATUS = 'Pending';

/**
 * The opening status for a storefront order, from its payment method alone.
 *
 * @param {string} paymentMethod the order's payment_method
 * @returns {'Pending - Card'|'Pending'}
 */
export function checkoutOrderStatus(paymentMethod) {
  return String(paymentMethod || '').trim().toLowerCase() === 'card'
    ? CHECKOUT_CARD_STATUS
    : CHECKOUT_DEFAULT_STATUS;
}
