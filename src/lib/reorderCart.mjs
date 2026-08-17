// Rebuild a cart from a past order.
//
// The one rule that matters: a reorder copies *what* was bought, never what it
// cost. Old order rows carry the prices, discounts and free-gift lines that
// applied on the day they were placed, and replaying those would undercharge
// (or overcharge) against today's catalog. So this resolves every line back to
// the live product row and hands the catalog a plain {product, qty} list. Every
// price, volume discount, shipping fee and BAC-water entitlement is then
// recomputed by the existing cart math, exactly as if the items had been added
// by hand.
//
// Two line types are dropped rather than carried:
//   - Free gifts. buildBacAwareOrderItems() writes the granted BAC water as a
//     zero-priced line tagged "(Free Gift)" / "(Regalo)". Entitlement depends
//     on the new cart's peptide count, so it is re-granted, not copied.
//   - Products that no longer exist or are out of stock. These are reported
//     back so the customer is told what was left behind instead of quietly
//     receiving a smaller order.

import { isBacWater } from './bacWater.mjs';

const GIFT_SUFFIX = /\s*\((?:free gift|regalo)\)\s*$/i;

/** Drop the gift tag so the line still resolves to its underlying product. */
export function stripGiftSuffix(name) {
  return String(name ?? '').replace(GIFT_SUFFIX, '').trim();
}

export function isGiftLine(item) {
  const name = String(item?.product ?? '');
  if (GIFT_SUFFIX.test(name)) return true;
  // A zero-priced BAC line is a granted vial even when the tag is missing —
  // older orders predate the suffix. Zero-priced peptides are not assumed to be
  // gifts, because that would silently drop a genuine promotional line.
  return Number(item?.price) === 0 && isBacWater(stripGiftSuffix(name));
}

/** Comparison form for product names: case and inner spacing are not identity. */
function nameKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isAvailable(product) {
  return !/out of stock/i.test(String(product?.status ?? ''));
}

function positiveQty(value) {
  const qty = Math.floor(Number(value));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

/**
 * Resolve a past order's items against the live catalog.
 *
 * @param {Array} orderItems  order.items as stored: [{ product, qty, price }]
 * @param {Array} products    live rows from mapDbProduct()
 * @returns {{ lines: Array<{product: object, qty: number}>,
 *             unavailable: string[], missing: string[] }}
 *          `lines` carry the live product row, so the caller never sees an old
 *          price. `unavailable` sold out since; `missing` are gone entirely.
 */
export function buildReorderLines(orderItems = [], products = []) {
  const byName = new Map();
  for (const product of products || []) {
    const key = nameKey(product?.product);
    if (key && !byName.has(key)) byName.set(key, product);
  }

  const lines = [];
  const seen = new Map();
  const unavailable = [];
  const missing = [];

  for (const item of orderItems || []) {
    if (isGiftLine(item)) continue;

    const name = stripGiftSuffix(item?.product);
    if (!name) continue;

    const product = byName.get(nameKey(name));
    if (!product) {
      if (!missing.includes(name)) missing.push(name);
      continue;
    }
    if (!isAvailable(product)) {
      if (!unavailable.includes(product.product)) unavailable.push(product.product);
      continue;
    }

    const qty = positiveQty(item?.qty);
    // An order can list the same product twice — a manual edit, or a paid BAC
    // line alongside a granted one. Merge rather than pushing a duplicate the
    // cart would then render as two rows.
    const existing = seen.get(nameKey(name));
    if (existing) {
      existing.qty += qty;
      continue;
    }
    const line = { product, qty };
    seen.set(nameKey(name), line);
    lines.push(line);
  }

  return { lines, unavailable, missing };
}

/**
 * Merge reorder lines into whatever is already in the cart.
 *
 * Adding to a non-empty cart tops up the existing quantity instead of resetting
 * it, so a customer who reorders while mid-shop does not lose what they picked.
 */
export function mergeReorderIntoCart(cart = [], lines = []) {
  const next = (cart || []).map((item) => ({ ...item }));

  for (const line of lines || []) {
    const key = nameKey(line?.product?.product);
    const existing = next.find((item) => nameKey(item?.product) === key);
    if (existing) {
      existing.qty = positiveQty(existing.qty) + positiveQty(line.qty);
    } else {
      next.push({ ...line.product, qty: positiveQty(line.qty) });
    }
  }

  return next;
}

/** Bilingual summary of what could not be carried over. */
export function reorderNoticeMessage({ unavailable = [], missing = [] } = {}, lang = 'es') {
  const dropped = [...unavailable, ...missing];
  if (dropped.length === 0) return '';

  const isEn = String(lang).toLowerCase().startsWith('en');
  const names = dropped.join(', ');
  return isEn
    ? `These items are no longer available and were not added: ${names}`
    : `Estos productos ya no están disponibles y no se agregaron: ${names}`;
}
