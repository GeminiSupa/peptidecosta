// When the second-chance WhatsApp opt-in card is allowed to appear.
//
// The card asks a visitor who unlocked the catalog but never opted in. It is a
// marketing ask, so every rule here exists to stop it becoming a nuisance:
// once per three days, never after two dismissals, never for someone who
// already opted in — and never over an open cart, which is a customer trying
// to pay rather than a visitor browsing.
//
// Kept out of the component so the conditions can be tested without mounting a
// 4,000-line page.

export const WA_REPROMPT_DELAY_MS = 15000;
export const WA_REPROMPT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
export const WA_REPROMPT_MAX_DISMISSES = 2;

/**
 * Whether to start the delay timer for the opt-in card.
 *
 * `state` is the stored {lastShown, dismisses} record. A visitor who has never
 * seen the card has no record, which reads as lastShown 0.
 *
 * The cart check is deliberately a reason to *defer*, not to spend the ask:
 * callers re-run this when the drawer closes, and the cooldown is only stamped
 * when the card actually appears. A prompt that was never shown must not burn
 * its three-day slot.
 */
export function shouldScheduleWaReprompt({
  hasAccess = false,
  optedIn = false,
  isCartOpen = false,
  state = {},
  now = Date.now(),
} = {}) {
  if (!hasAccess) return false;
  if (optedIn) return false;
  // The customer is at the till. Ask later.
  if (isCartOpen) return false;

  // localStorage can hold anything, including the string "null", so the record
  // is coerced rather than trusted. A record that cannot be read must not
  // silence the prompt forever.
  const record = state || {};

  const dismisses = Number(record.dismisses) || 0;
  if (dismisses >= WA_REPROMPT_MAX_DISMISSES) return false;

  const lastShown = Number(record.lastShown) || 0;
  if (lastShown && now - lastShown < WA_REPROMPT_COOLDOWN_MS) return false;

  return true;
}
