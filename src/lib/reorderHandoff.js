// Handing a reorder from the account area to the catalog.
//
// The account pages deliberately do not price anything. They stash the past
// order's item list and send the customer to the catalog, which already holds
// the live product rows and owns every pricing rule — volume discounts, promo
// codes, shipping thresholds and BAC-water entitlement. Resolving the order
// there means a reorder is priced by exactly the same code path as a cart built
// by hand, so the two can never drift apart.

export const REORDER_STORAGE_KEY = 'pending_reorder';

/** Stash a past order's lines for the catalog to pick up. */
export function stashReorder(order) {
  if (typeof window === 'undefined') return false;

  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) return false;

  try {
    localStorage.setItem(REORDER_STORAGE_KEY, JSON.stringify({
      orderNumber: order?.order_number || null,
      // Names and quantities only. Prices are deliberately left behind so a
      // stale figure cannot survive the handoff even by accident.
      items: items.map((item) => ({ product: item?.product, qty: item?.qty, price: item?.price })),
      stashedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and clear a pending reorder.
 *
 * Cleared on read so a refresh of the catalog does not add the same order to
 * the cart twice. Anything older than an hour is dropped: a stash that survived
 * that long belongs to a session the customer has forgotten about, and silently
 * filling their cart later would be a surprise.
 */
export function takeReorder(maxAgeMs = 60 * 60 * 1000) {
  if (typeof window === 'undefined') return null;

  let raw;
  try {
    raw = localStorage.getItem(REORDER_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(REORDER_STORAGE_KEY);
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items) || parsed.items.length === 0) return null;
    if (parsed.stashedAt && Date.now() - parsed.stashedAt > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}
