// Which customer email a status change is allowed to trigger.
//
// Two routes mail the customer when an order moves forward:
// /api/order-notification sends the confirmation receipt on the first
// unpaid -> paid transition, and /api/order-shipped-notification sends the
// completed-and-shipped mail. An order dragged straight from unpaid to
// "Order Complete" satisfies both, so on 16 Aug 2026 one test order produced
// three mails in the customer's inbox — two of them the identical
// confirmation, a second apart — and two copies for the accountant, since
// both carry the tax CC.
//
// Completion wins: its mail carries the tracking number and is the reliable
// seat for the accounting copy.

const normalize = (status) => String(status ?? '').trim().toLowerCase();

/** Paid or completed — the states that mean the customer has settled up. */
export function isPaidLike(status) {
  const value = normalize(status);
  return value.includes('paid') || value.includes('complet');
}

/** Completed, whatever wording the admin panel used ("completed", "Order Complete"). */
export function isCompleteLike(status) {
  return normalize(status).includes('complet');
}

/** True when the order has just settled and is not yet complete. */
export function isFirstPaidTransition(previousStatus, nextStatus) {
  if (!normalize(nextStatus)) return false;
  return !isPaidLike(previousStatus) && isPaidLike(nextStatus);
}

/**
 * Whether this transition should fire the confirmation receipt.
 *
 * Never for a jump into completion — /api/order-shipped-notification covers
 * that, tracking number and accounting CC included.
 */
export function shouldSendPaidConfirmation(previousStatus, nextStatus) {
  return isFirstPaidTransition(previousStatus, nextStatus) && !isCompleteLike(nextStatus);
}
