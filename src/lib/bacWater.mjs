/**
 * Bacteriostatic water pricing rules.
 *
 * BAC water used to be a pure gift: never in the cart, silently appended to the
 * order by the notification endpoint. It is now a sellable line item, which
 * means four rules have to hold identically everywhere a total is computed
 * (cart UI, WhatsApp checkout, card checkout, PayPal create + approve):
 *
 *   1. One free vial per peptide purchased. Syringes and other reconstitution
 *      supplies do NOT earn a free vial — only peptides do.
 *   2. BAC vials beyond that free allowance cost BAC_WATER_UNIT_PRICE_USD each.
 *   3. BAC water never counts toward the volume discount, and the volume
 *      discount never applies to the BAC charge. It is a flat side charge.
 *   4. A cart containing only BAC water must hold at least
 *      BAC_WATER_ONLY_MIN_UNITS vials before it can check out.
 *
 * The vials actually shipped are `freeUnits + paidUnits`. Note that freeUnits
 * is the full allowance even when the customer added no BAC water at all, so
 * the "free vial with every peptide" promise survives a customer who never
 * touches the BAC listing — they simply get the gift without being charged.
 */

export const BAC_WATER_UNIT_PRICE_USD = 10;
export const BAC_WATER_ONLY_MIN_UNITS = 5;

/** Matches the BAC water listing in either language. */
export function isBacWater(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return n.includes('bac water')
    || n.includes('bacteriostatic')
    || n.includes('agua bacteriostática')
    || n.includes('agua bacteriostatica');
}

/** The only BAC water size sold. 2ml and 10ml listings are legacy. */
export const BAC_WATER_SELLABLE_SIZE_ML = 3;

/** Size in ml parsed out of a BAC listing name, or null if it carries none. */
export function getBacWaterSizeMl(name) {
  if (!isBacWater(name)) return null;
  const match = String(name).match(/(\d+(?:\.\d+)?)\s*ml/i);
  return match ? Number(match[1]) : null;
}

/**
 * Whether a BAC listing may be shown and sold.
 *
 * Only the 3ml is sold now, and the 2ml/10ml rows still exist in the products
 * table. Hiding them is an admin action, which makes a manual step load-bearing
 * for correct pricing — so the rule is enforced here too and a stray row cannot
 * be sold even if it reappears in the database.
 *
 * A listing with no size in its name is treated as sellable: 3ml is the only
 * size, so an unsized "Bacteriostatic Water" can only mean that one.
 */
export function isSellableBacWater(name) {
  if (!isBacWater(name)) return false;
  const size = getBacWaterSizeMl(name);
  return size === null || size === BAC_WATER_SELLABLE_SIZE_ML;
}

/**
 * Reconstitution supplies (syringes and the like). They are sold normally and
 * count toward the volume discount, but buying one does not earn a free vial —
 * the gift is tied to peptides.
 */
export function isSupplyItem(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return n.includes('syringe') || n.includes('jeringa') || n.includes('supply');
}

function qtyOf(item) {
  const qty = parseInt(item?.qty ?? item?.quantity ?? 0, 10);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/**
 * Unit counts a cart contributes to each rule.
 *
 * `discountUnits` is what the volume discount tiers read: everything except BAC
 * water. `peptideUnits` is what the free allowance reads: everything except BAC
 * water and supplies.
 */
export function splitCartUnits(cart = []) {
  let bacUnits = 0;
  let peptideUnits = 0;
  let discountUnits = 0;

  for (const item of cart || []) {
    const qty = qtyOf(item);
    if (qty === 0) continue;
    const name = item?.product ?? item?.name;

    if (isBacWater(name)) {
      bacUnits += qty;
      continue;
    }
    discountUnits += qty;
    if (!isSupplyItem(name)) peptideUnits += qty;
  }

  return { bacUnits, peptideUnits, discountUnits };
}

/**
 * Per-vial price in the requested currency.
 *
 * An admin-set price on the product row wins, so the figure can be changed from
 * the products screen without a deploy. The constant is the fallback because
 * the existing BAC row is priced at 0 from its giveaway days — reading that
 * blindly would hand out unlimited free vials.
 */
export function bacUnitPrice(currency, exchangeRate, priceUsdFromDb = 0) {
  const fromDb = Number(priceUsdFromDb);
  const usd = Number.isFinite(fromDb) && fromDb > 0 ? fromDb : BAC_WATER_UNIT_PRICE_USD;
  return currency === 'USD' ? usd : Math.round(usd * exchangeRate);
}

/**
 * The full BAC picture for a cart.
 *
 * @returns {{bacUnits, peptideUnits, discountUnits, freeUnits, paidUnits, unitPrice, charge, shippedUnits}}
 */
export function summarizeBacWater(cart = [], currency = 'USD', exchangeRate = 1) {
  const { bacUnits, peptideUnits, discountUnits } = splitCartUnits(cart);

  const bacLine = (cart || []).find((item) => isBacWater(item?.product ?? item?.name));
  const unitPrice = bacUnitPrice(currency, exchangeRate, bacLine?.priceUsd ?? bacLine?.price_usd);

  const freeUnits = Math.min(bacUnits, peptideUnits);
  const paidUnits = Math.max(0, bacUnits - peptideUnits);

  return {
    bacUnits,
    peptideUnits,
    discountUnits,
    freeUnits,
    paidUnits,
    unitPrice,
    charge: paidUnits * unitPrice,
    // Full allowance ships even when the customer added no BAC water at all.
    shippedUnits: peptideUnits + paidUnits,
  };
}

/**
 * The BAC-only floor. A cart with any peptide in it is exempt — the minimum
 * exists so a lone water order is worth packing and shipping.
 *
 * @returns {{blocked: boolean, shortfall: number, minUnits: number}}
 */
export function checkBacOnlyMinimum(cart = []) {
  const { bacUnits, discountUnits } = splitCartUnits(cart);
  const bacOnly = bacUnits > 0 && discountUnits === 0;
  const blocked = bacOnly && bacUnits < BAC_WATER_ONLY_MIN_UNITS;

  return {
    blocked,
    shortfall: blocked ? BAC_WATER_ONLY_MIN_UNITS - bacUnits : 0,
    minUnits: BAC_WATER_ONLY_MIN_UNITS,
  };
}

/** Customer-facing wording for the BAC-only floor. Null when the cart passes. */
export function bacOnlyMinimumMessage(cart = [], lang = 'es') {
  const { blocked, shortfall, minUnits } = checkBacOnlyMinimum(cart);
  if (!blocked) return null;

  return String(lang).toLowerCase().startsWith('en')
    ? `Water-only orders start at ${minUnits} vials — add ${shortfall} more, or add any peptide.`
    : `Los pedidos de solo agua empiezan en ${minUnits} viales — agregá ${shortfall} más, o agregá cualquier péptido.`;
}

/**
 * Order lines as the customer, the database and the packing list should see
 * them.
 *
 * A single "BAC Water x5" cart line is resolved into what is actually billed
 * and what is gifted, so the line prices add up to the order subtotal. Without
 * this the cart would show one number and the confirmation email another.
 *
 * @param {Array} cart
 * @param {{currency, exchangeRate, priceOf, lang}} opts
 *        `priceOf(item)` resolves the unit price of a non-BAC line.
 */
export function buildBacAwareOrderItems(cart = [], opts = {}) {
  const { currency = 'USD', exchangeRate = 1, priceOf = () => 0, lang = 'es' } = opts;
  const isEn = String(lang).toLowerCase().startsWith('en');

  const items = (cart || [])
    .filter((item) => !isBacWater(item?.product))
    .map((item) => ({ product: item.product, qty: item.qty, price: priceOf(item) }));

  const bac = summarizeBacWater(cart, currency, exchangeRate);
  const bacName = (cart || []).find((item) => isBacWater(item?.product))?.product
    || (isEn ? 'Bacteriostatic Water 3ml' : 'Agua Bacteriostática 3ml');

  if (bac.paidUnits > 0) {
    items.push({ product: bacName, qty: bac.paidUnits, price: bac.unitPrice });
  }
  // The full allowance ships free, whether or not the customer added it.
  if (bac.peptideUnits > 0) {
    items.push({
      product: `${bacName} ${isEn ? '(Free Gift)' : '(Regalo)'}`,
      qty: bac.peptideUnits,
      price: 0,
    });
  }

  return items;
}

/**
 * Apply the volume discount to a cart's money, keeping BAC water out of it.
 *
 * The discount hits only the non-BAC subtotal; the BAC charge is added after,
 * undiscounted. Callers pass the percentage they already resolved (which may be
 * 0 because a bulk promo code replaced it).
 *
 * @returns {{subtotal, discountableSubtotal, bacCharge, discountAmount, itemsTotal}}
 */
export function applyBacAwareDiscount(discountableSubtotal, bacCharge, discountPct) {
  const pct = Number(discountPct) || 0;
  const discounted = pct > 0
    ? Math.round(discountableSubtotal * (1 - pct / 100))
    : discountableSubtotal;

  return {
    subtotal: discountableSubtotal + bacCharge,
    discountableSubtotal,
    bacCharge,
    discountAmount: discountableSubtotal - discounted,
    itemsTotal: discounted + bacCharge,
  };
}
