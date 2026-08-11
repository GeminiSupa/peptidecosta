/**
 * Bacteriostatic water pricing rules.
 *
 * BAC water used to be a pure gift: never in the cart, silently appended to the
 * order by the notification endpoint. It is now a sellable line item, which
 * means four rules have to hold identically everywhere a total is computed
 * (cart UI, WhatsApp checkout, card checkout):
 *
 *   1. One free vial per peptide purchased, given automatically. Syringes and
 *      other reconstitution supplies do NOT earn a free vial — only peptides do.
 *   2. The gift is separate from the cart. A vial the customer puts in the cart
 *      is an EXTRA, on top of their free ones. The paid 3ml is $10 and the paid
 *      10ml is $20. Buy one peptide and add one vial and you receive two: one
 *      free 3ml vial and the paid size the customer selected.
 *   3. BAC water never counts toward the volume discount, and the volume
 *      discount never applies to the BAC charge. It is a flat side charge.
 *   4. A cart containing only 10ml BAC water must hold at least three vials.
 *      The existing five-vial floor remains for 3ml-only water orders.
 *
 * Rule 2 is the one worth stating plainly, because the obvious alternative is
 * to let the free allowance absorb what is in the cart — so one peptide plus
 * one vial would ship a single free vial and charge nothing. That was the
 * original reading and it confused both sides of the counter: the shopper could
 * not tell whether the line they had added was going to be billed. The gift is
 * invisible and automatic; the cart is only ever extras.
 */

export const BAC_WATER_UNIT_PRICE_USD = 10;
export const BAC_WATER_ONLY_MIN_UNITS = 5;
export const BAC_WATER_10ML_UNIT_PRICE_USD = 20;
export const BAC_WATER_10ML_ONLY_MIN_UNITS = 3;

/** Matches the BAC water listing in either language. */
export function isBacWater(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return n.includes('bac water')
    || n.includes('bacteriostatic')
    || n.includes('agua bacteriostática')
    || n.includes('agua bacteriostatica');
}

/** BAC water sizes currently offered. The 2ml listing is legacy. */
export const BAC_WATER_SELLABLE_SIZES_ML = Object.freeze([3, 10]);

/** Size in ml parsed out of a BAC listing name, or null if it carries none. */
export function getBacWaterSizeMl(name) {
  if (!isBacWater(name)) return null;
  const match = String(name).match(/(\d+(?:\.\d+)?)\s*ml/i);
  return match ? Number(match[1]) : null;
}

/**
 * Whether a BAC listing may be shown and sold.
 *
 * Only the 3ml and 10ml are sold now, while the 2ml row still exists in the
 * products table. Hiding it is an admin action, which makes a manual step
 * load-bearing for correct pricing — so the rule is enforced here too and a
 * stray row cannot be sold even if it reappears in the database.
 *
 * A legacy listing with no size in its name is treated as the 3ml product.
 */
export function isSellableBacWater(name) {
  if (!isBacWater(name)) return false;
  const size = getBacWaterSizeMl(name);
  return size === null || BAC_WATER_SELLABLE_SIZES_ML.includes(size);
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
export function bacUnitPrice(currency, exchangeRate, priceUsdFromDb = 0, productName = '') {
  const fromDb = parseFloat(String(priceUsdFromDb ?? '').replace(/[^0-9.]/g, ''));
  const fallbackUsd = getBacWaterSizeMl(productName) === 10
    ? BAC_WATER_10ML_UNIT_PRICE_USD
    : BAC_WATER_UNIT_PRICE_USD;
  const usd = Number.isFinite(fromDb) && fromDb > 0 ? fromDb : fallbackUsd;
  return currency === 'USD' ? usd : Math.round(usd * exchangeRate);
}

/**
 * The full BAC picture for a cart.
 *
 * `paidLines` preserves each selected size and its own price. `unitPrice` is
 * retained for older callers when the cart contains a single paid BAC line;
 * it is null when several differently priced sizes are present.
 *
 * @returns {{bacUnits, peptideUnits, discountUnits, freeUnits, paidUnits, paidLines, unitPrice, charge, shippedUnits}}
 */
export function summarizeBacWater(cart = [], currency = 'USD', exchangeRate = 1) {
  const { bacUnits, peptideUnits, discountUnits } = splitCartUnits(cart);

  const paidLines = (cart || [])
    .filter((item) => isBacWater(item?.product ?? item?.name) && qtyOf(item) > 0)
    .map((item) => {
      const product = item?.product ?? item?.name;
      const qty = qtyOf(item);
      const suppliedUnitPrice = Number(item?.unitPrice);
      const unitPrice = Number.isFinite(suppliedUnitPrice) && suppliedUnitPrice > 0
        ? suppliedUnitPrice
        : bacUnitPrice(currency, exchangeRate, item?.priceUsd ?? item?.price_usd, product);
      return { product, qty, unitPrice, charge: qty * unitPrice };
    });
  const charge = paidLines.reduce((sum, line) => sum + line.charge, 0);
  const unitPrice = paidLines.length === 1 ? paidLines[0].unitPrice : null;

  // The gift is one per peptide regardless of the cart, and everything in the
  // cart is an extra that is paid for. A customer who never touches the BAC
  // listing still receives their free vials.
  const freeUnits = peptideUnits;
  const paidUnits = bacUnits;

  return {
    bacUnits,
    peptideUnits,
    discountUnits,
    freeUnits,
    paidUnits,
    paidLines,
    unitPrice,
    charge,
    shippedUnits: freeUnits + paidUnits,
  };
}

/**
 * The BAC-only floor. A cart with any non-BAC product in it is exempt — the
 * minimum exists so a lone water order is worth packing and shipping.
 *
 * @returns {{blocked: boolean, shortfall: number, minUnits: number, tenMlOnly: boolean}}
 */
export function checkBacOnlyMinimum(cart = []) {
  const { bacUnits, discountUnits } = splitCartUnits(cart);
  const bacOnly = bacUnits > 0 && discountUnits === 0;
  const bacLines = (cart || []).filter((item) => (
    isBacWater(item?.product ?? item?.name) && qtyOf(item) > 0
  ));
  const tenMlOnly = bacOnly && bacLines.every((item) => (
    getBacWaterSizeMl(item?.product ?? item?.name) === 10
  ));
  const minUnits = tenMlOnly
    ? BAC_WATER_10ML_ONLY_MIN_UNITS
    : BAC_WATER_ONLY_MIN_UNITS;
  const blocked = bacOnly && bacUnits < minUnits;

  return {
    blocked,
    shortfall: blocked ? minUnits - bacUnits : 0,
    minUnits,
    tenMlOnly,
  };
}

/** Customer-facing wording for the BAC-only floor. Null when the cart passes. */
export function bacOnlyMinimumMessage(cart = [], lang = 'es') {
  const { blocked, shortfall, minUnits, tenMlOnly } = checkBacOnlyMinimum(cart);
  if (!blocked) return null;

  if (String(lang).toLowerCase().startsWith('en')) {
    return tenMlOnly
      ? `Orders containing only 10ml BAC Water start at ${minUnits} vials — add ${shortfall} more, or add any other product.`
      : `Water-only orders start at ${minUnits} vials — add ${shortfall} more, or add any other product.`;
  }

  return tenMlOnly
    ? `Los pedidos que solo contienen Agua Bacteriostática de 10ml empiezan en ${minUnits} viales — agregá ${shortfall} más, o agregá otro producto.`
    : `Los pedidos de solo agua empiezan en ${minUnits} viales — agregá ${shortfall} más, o agregá otro producto.`;
}

/**
 * Order lines as the customer, the database and the packing list should see
 * them.
 *
 * Paid BAC lines keep their selected sizes and prices, while the automatic gift
 * is always a separate 3ml line. This makes the stored order, packing list and
 * customer-facing total agree even when 3ml and 10ml are bought together.
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
  const selectedThreeMlName = (cart || []).find((item) => (
    isBacWater(item?.product) && getBacWaterSizeMl(item.product) === 3
  ))?.product;
  for (const line of bac.paidLines) {
    items.push({ product: line.product, qty: line.qty, price: line.unitPrice });
  }
  // The gift ships whether or not the customer added any, and is listed
  // separately so the packing list and the order total agree.
  if (bac.freeUnits > 0) {
    items.push({
      product: selectedThreeMlName
        ? `${selectedThreeMlName} ${isEn ? '(Free Gift)' : '(Regalo)'}`
        : isEn
        ? 'Bacteriostatic Water 3ml (Free Gift)'
        : 'Agua Bacteriostática 3ml (Regalo)',
      qty: bac.freeUnits,
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
