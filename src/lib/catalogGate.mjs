// When the catalog access gate is allowed to appear.
//
// The gate is a lead ask: it covers the catalog until a visitor leaves a
// WhatsApp number or email. New visitors get to see a populated catalog first,
// and it never lands over an open cart — that visitor is a customer trying to
// pay, and the overlay sits above the drawer, hiding the total and the
// checkout button.
//
// Kept out of the component so the conditions can be tested without mounting a
// 5,000-line page.

export const CATALOG_GATE_DELAY_MS = 15000;

/**
 * Whether to start the delay timer for the access gate.
 *
 * The cart check defers the ask rather than cancelling it: the caller re-runs
 * this when the drawer closes, and the wait starts over from there.
 */
export function shouldScheduleAccessGate({
  hasAccess = false,
  catalogLoading = false,
  isCartOpen = false,
} = {}) {
  if (hasAccess) return false;
  // Nothing to look at yet — asking now would gate an empty page.
  if (catalogLoading) return false;
  // The customer is at the till. Ask later.
  if (isCartOpen) return false;

  return true;
}
