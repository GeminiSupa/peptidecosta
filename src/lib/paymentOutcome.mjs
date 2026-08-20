// One vocabulary for "how did this payment end".
//
// Two separate bugs came out of not having this file.
//
// The gateway routes each carried their own copy of the same four-line status
// map, and every copy ended in `return \`Payment ${status}\`` — so the day
// Shield Hub Pay answered "Blocked" ("Card brand not allowed"), five real
// orders were stamped "Payment Blocked". That string is in no admin filter
// group, so those orders showed under none of them.
//
// Worse, the customer email asked `order.status === 'Declined'` — an exact
// match. "Payment Blocked" is a refusal, but it failed that test, fell through
// to the card branch, and told the customer we were "waiting for the payment
// processor's confirmation". A card the gateway had refused outright was
// described to the buyer as still in progress.
//
// So: the gateway's wording is normalised here, once, into a status the admin
// panel already knows, and every human-facing message asks THIS file whether
// the money arrived — never a string comparison of its own.

import { isPaidLike } from './orderStatusEmails.mjs';

/** The statuses a card payment is allowed to leave behind. */
export const ORDER_STATUS = {
  PAID: 'Paid',
  DECLINED: 'Declined',
  ERROR: 'Error',
  CARD_PENDING: 'Pending - Card',
  CARD_3DS: 'Pending - Card 3DS',
};

const normalize = (value) => String(value ?? '').trim().toLowerCase();

// Substrings, not exact matches, precisely because the exact match is what
// failed. Every one of these means the customer has to do something — the card
// was refused, the attempt errored, or the sale was called off — and every one
// of them must read as "did not go through", never as "still processing".
const REFUSED_MARKERS = [
  'declin',      // Declined
  'rechaz',      // Rechazado (Spanish wording from manual edits)
  'block',       // Blocked  <- the one that started this
  'reject',      // Rejected
  'refus',       // Refused
  'fail',        // Failed / Payment Failed
  'error',       // Error
  'cancel',      // Cancelled / cancelled
  'void',        // Voided
  'expired',     // Expired authorization
  'chargeback',
];

/**
 * How this payment ended, for anything that has to describe it to a human.
 *
 * @returns {'paid'|'declined'|'pending'}
 */
export function classifyPaymentOutcome(status) {
  const value = normalize(status);
  // Settled wins outright: "Order Complete" must never be read as an error just
  // because some future status wording happens to contain one of the markers.
  if (isPaidLike(value)) return 'paid';
  if (REFUSED_MARKERS.some((marker) => value.includes(marker))) return 'declined';
  return 'pending';
}

export const isPaidOutcome = (status) => classifyPaymentOutcome(status) === 'paid';
export const isDeclinedOutcome = (status) => classifyPaymentOutcome(status) === 'declined';
export const isPendingOutcome = (status) => classifyPaymentOutcome(status) === 'pending';

/**
 * Turn Shield Hub Pay's transaction status into one of ours.
 *
 * Case-insensitive: the direct charge answers "Approved" while a transaction
 * re-fetched for a webhook has come back "approved", and the old exact-match
 * map turned the second one into "Payment approved" — a status that is not
 * paid-like, so a settled order sat in the panel looking unpaid.
 *
 * An unrecognised status stays PENDING on purpose. Guessing "declined" for a
 * word we have never seen would tell a paying customer their card failed; a
 * pending order gets looked at by a human instead.
 */
export function gatewayStatusToOrderStatus(gatewayStatus, { onUnknown } = {}) {
  const value = normalize(gatewayStatus);

  if (!value) return ORDER_STATUS.CARD_PENDING;
  if (value === 'approved' || value === 'completed' || value === 'success') return ORDER_STATUS.PAID;
  if (value === 'redirect') return ORDER_STATUS.CARD_3DS;
  if (value === 'pending' || value === 'processing' || value === 'inprocess') return ORDER_STATUS.CARD_PENDING;
  // "Failed" is the gateway erroring, not the bank refusing. Kept apart so
  // staff can tell the two apart in the panel; the customer is told the same
  // thing either way, because either way the money did not move.
  if (value === 'failed') return ORDER_STATUS.ERROR;
  if (classifyPaymentOutcome(value) === 'declined') return ORDER_STATUS.DECLINED;

  onUnknown?.(gatewayStatus);
  return ORDER_STATUS.CARD_PENDING;
}

/**
 * The gateway's own explanation, when it gave one worth repeating.
 *
 * "The card has insufficient funds" and "Card brand not allowed" are things a
 * customer can act on, so they are shown as-is. The success message and the
 * generic placeholders are not: repeating "Approved transaction" under a
 * decline heading, or "No URL", helps nobody.
 */
export function declineReasonFrom(transaction) {
  const message = String(
    transaction?.error?.message
    || transaction?.error?.messsage // gateway's own typo, seen in test-payment
    || transaction?.message
    || ''
  ).trim();

  if (!message) return null;
  // Only explicit success wording is suppressed. `isPaidLike` must not be used
  // here: it matches on "complet", which would silently swallow the very
  // useful "The transaction could not be completed".
  if (/^approved/i.test(message)) return null;
  if (/^(no url|n\/a|null|undefined|-)$/i.test(message)) return null;
  return message;
}
