// When the catalog access gate is allowed to appear.
//
// The gate is a lead ask: it covers the catalog until a visitor leaves a
// WhatsApp number or email. New visitors get to see a populated catalog first,
// and it never lands over an open cart — that visitor is a customer trying to
// pay, and the overlay sits above the drawer, hiding the total and the
// checkout button.
//
// Nor over a visitor who merely has a cart. Anyone who has added something is
// past being a lead, and checkout asks for their name, email and phone anyway
// — so the gate cannot win contact details there that the order would not have
// produced, and it can lose the sale.
//
// Kept out of the component so the conditions can be tested without mounting a
// 5,000-line page.

export const CATALOG_GATE_DELAY_MS = 15000;

/**
 * Whether to start the delay timer for the access gate.
 *
 * The open-drawer check defers the ask rather than cancelling it: the caller
 * re-runs this when the drawer closes, and the wait starts over from there.
 * The `cartItemCount` check is the stronger one — it holds whether or not the
 * drawer is open, so closing the drawer to carry on browsing no longer re-arms
 * a gate over someone who is part-way through buying.
 */
export function shouldScheduleAccessGate({
  hasAccess = false,
  catalogLoading = false,
  isCartOpen = false,
  cartItemCount = 0,
} = {}) {
  if (hasAccess) return false;
  // Nothing to look at yet — asking now would gate an empty page.
  if (catalogLoading) return false;
  // The customer is at the till. Ask later.
  if (isCartOpen) return false;
  // They have a cart. Not a lead to capture — a sale to not interrupt.
  if (Number(cartItemCount) > 0) return false;

  return true;
}
