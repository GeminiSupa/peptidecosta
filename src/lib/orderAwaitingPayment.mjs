/**
 * The statuses that mean an order is still waiting for the customer's money.
 *
 * The orders table has grouped these four under "Needs payment" for a long
 * time, but the dashboard counted only the literal 'Pending'. So the Home tile
 * said 86 while the queue behind it held 116, and the 30 orders in the other
 * three states were in no count anybody looked at. The oldest had been sitting
 * untouched for a month.
 *
 * One list, imported by both, so the number and the list it opens cannot drift
 * apart again.
 *
 * 'Payment Blocked' is deliberately absent. It reads like a pending state and
 * is not one: see paymentOutcome.mjs, where it is normalised as a refusal. A
 * refused card is not waiting for anything.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

/** Waiting on money. The order of these matches the admin filter dropdown. */
export const AWAITING_PAYMENT_STATUSES = [
  'Pending',
  'Payment Pending',
  'Pending - Card',
  'Pending - Card 3DS',
];

const AWAITING = new Set(AWAITING_PAYMENT_STATUSES.map((status) => status.toLowerCase()));

/**
 * Is this order still waiting to be paid?
 *
 * A blank status counts as 'Pending', matching how the rest of the panel reads
 * an order that was written before the column had a default.
 */
export function isAwaitingPayment(status) {
  return AWAITING.has(String(status || 'Pending').trim().toLowerCase());
}
