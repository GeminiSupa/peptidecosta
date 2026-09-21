/**
 * Two-offer Deal of the Week: "Mix & Match" and "Buy X, Get Y Free".
 *
 *   Mix & Match — N or more vials from the chosen products takes a percentage
 *   off the WHOLE order, BAC water included. BAC water never counts toward N.
 *
 *   Buy X Get Y — every X vials of one chosen product earn Y more of that same
 *   product free. The customer adds X; the free vials are added for them as
 *   zero-priced "(Free Gift)" lines, so stock, packing list and emails all see
 *   them. BAC water never qualifies.
 *
 * The offers never stack with each other, with promo codes, or with the
 * automatic volume tiers: the order gets whichever ONE saves the most, the
 * volume tier included, so a deal week can never leave a customer paying more
 * than an ordinary week would have.
 *
 * Pure on purpose. The catalog cart and the server's authoritative checkout
 * both call chooseDealOffer with the same lines, so the total the customer
 * sees is the total the server charges.
 */

import { isBacWater } from './bacWater.mjs';

export const OFFERS_PRICING_MODE = 'offers';

const nameKey = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function toInt(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function names(list) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((name) => String(name ?? '').trim())
    .filter(Boolean))];
}

/** A stored or posted offers object, cleaned into one fixed shape. */
export function normalizeDealOffers(raw) {
  const mix = raw?.mix || {};
  const bundle = raw?.bundle || {};
  return {
    mix: {
      enabled: mix.enabled === true,
      product_names: names(mix.product_names),
      min_units: Math.max(1, toInt(mix.min_units, 2)),
      discount_pct: Number(mix.discount_pct) || 0,
    },
    bundle: {
      enabled: bundle.enabled === true,
      product_names: names(bundle.product_names),
      buy_qty: Math.max(1, toInt(bundle.buy_qty, 4)),
      free_qty: Math.max(1, toInt(bundle.free_qty, 1)),
    },
  };
}

/** Every product either offer covers, for matching, attribution and the page. */
export function dealOfferProductNames(offers) {
  const clean = normalizeDealOffers(offers);
  return names([
    ...(clean.mix.enabled ? clean.mix.product_names : []),
    ...(clean.bundle.enabled ? clean.bundle.product_names : []),
  ]);
}

/** '' when the offers can be launched, otherwise what the admin must fix. */
export function dealOffersError(offers) {
  const clean = normalizeDealOffers(offers);
  if (!clean.mix.enabled && !clean.bundle.enabled) return 'Turn on at least one offer.';
  if (clean.mix.enabled) {
    if (clean.mix.product_names.length === 0) return 'Mix & Match: pick at least one product.';
    if (!(clean.mix.discount_pct > 0 && clean.mix.discount_pct < 1)) return 'Mix & Match: the discount must be between 1% and 99%.';
    if (clean.mix.product_names.some(isBacWater)) return 'Mix & Match: BAC Water cannot be an offer product.';
  }
  if (clean.bundle.enabled) {
    if (clean.bundle.product_names.length === 0) return 'Buy & Get Free: pick at least one product.';
    if (clean.bundle.free_qty > clean.bundle.buy_qty) return 'Buy & Get Free: the free vials cannot outnumber the vials bought.';
    if (clean.bundle.product_names.some(isBacWater)) return 'Buy & Get Free: BAC Water cannot be an offer product.';
  }
  return '';
}

/**
 * Which offer this cart gets.
 *
 * @param offers  the deal's offers (any shape normalizeDealOffers accepts)
 * @param lines   paid cart lines: { product, qty, unitPrice, inventoryCount? }.
 *                Gift lines must already be left out. inventoryCount null or
 *                undefined means the product is not quantity-tracked.
 * @param opts.volumePct  the volume tier this cart would get with no deal
 * @param opts.bacCharge  the paid BAC water total, which Mix & Match discounts
 * @returns {{
 *   kind: 'mix'|'bundle'|'volume'|'none',
 *   savings: number,
 *   mix: { enabled: boolean, units: number, minUnits: number, qualifies: boolean, discountPct: number, savings: number },
 *   bundle: { enabled: boolean, qualifies: boolean, freeLines: Array<{product: string, qty: number, unitPrice: number}>, savings: number, shortByStock: string[] },
 *   volumeSavings: number,
 * }}
 */
export function chooseDealOffer(offers, lines = [], { volumePct = 0, bacCharge = 0 } = {}) {
  const clean = normalizeDealOffers(offers);
  const mixKeys = new Set(clean.mix.product_names.map(nameKey));
  const bundleKeys = new Set(clean.bundle.product_names.map(nameKey));

  let merchSubtotal = 0;
  let mixUnits = 0;
  const bundleQty = new Map();

  for (const line of lines || []) {
    const qty = Math.max(0, toInt(line?.qty, 0));
    if (!qty || isBacWater(line?.product)) continue;
    const unitPrice = Number(line?.unitPrice) || 0;
    merchSubtotal += unitPrice * qty;
    const key = nameKey(line.product);
    if (clean.mix.enabled && mixKeys.has(key)) mixUnits += qty;
    if (clean.bundle.enabled && bundleKeys.has(key)) {
      // One product can arrive on two lines; the vials still count together.
      const entry = bundleQty.get(key) || { product: line.product, qty: 0, unitPrice, inventoryCount: line.inventoryCount };
      entry.qty += qty;
      bundleQty.set(key, entry);
    }
  }

  const mixQualifies = clean.mix.enabled && mixUnits >= clean.mix.min_units;
  const mixSavings = mixQualifies ? clean.mix.discount_pct * (merchSubtotal + (Number(bacCharge) || 0)) : 0;

  const freeLines = [];
  const shortByStock = [];
  for (const entry of bundleQty.values()) {
    let free = Math.floor(entry.qty / clean.bundle.buy_qty) * clean.bundle.free_qty;
    if (free <= 0) continue;
    const tracked = entry.inventoryCount !== null && entry.inventoryCount !== undefined && entry.inventoryCount !== '';
    if (tracked) {
      // A free vial has to exist to be given; the paid ones take stock first.
      const spare = Math.max(0, toInt(entry.inventoryCount, 0) - entry.qty);
      if (spare < free) {
        shortByStock.push(entry.product);
        free = spare;
      }
    }
    if (free > 0) freeLines.push({ product: entry.product, qty: free, unitPrice: entry.unitPrice });
  }
  const bundleSavings = freeLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const bundleQualifies = clean.bundle.enabled && freeLines.length > 0;

  const volumeSavings = Math.max(0, Number(volumePct) || 0) / 100 * merchSubtotal;

  // Strictly greater wins, checked offer-first, so an exact tie goes to the
  // deal the customer came for rather than the everyday tier.
  let kind = 'none';
  let savings = 0;
  if (mixQualifies && mixSavings > savings) { kind = 'mix'; savings = mixSavings; }
  if (bundleQualifies && bundleSavings > savings) { kind = 'bundle'; savings = bundleSavings; }
  if (volumeSavings > savings) { kind = 'volume'; savings = volumeSavings; }

  return {
    kind,
    savings,
    mix: {
      enabled: clean.mix.enabled,
      units: mixUnits,
      minUnits: clean.mix.min_units,
      qualifies: mixQualifies,
      discountPct: clean.mix.discount_pct,
      savings: mixSavings,
    },
    bundle: {
      enabled: clean.bundle.enabled,
      qualifies: bundleQualifies,
      freeLines: kind === 'bundle' ? freeLines : [],
      possibleFreeLines: freeLines,
      savings: bundleSavings,
      shortByStock,
    },
    volumeSavings,
  };
}

/** The order line for free vials, tagged the way every gift line already is. */
export function freeVialLine(product, qty, lang = 'es') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  return { product: `${product} ${isEn ? '(Free Gift)' : '(Regalo)'}`, qty, price: 0 };
}

/** One line for the cart: which offer applied, or how to reach one. */
export function dealOfferCartMessage(choice, deal, lang = 'en') {
  if (!choice) return '';
  const isEn = String(lang).toLowerCase().startsWith('en');
  const clean = normalizeDealOffers(deal?.offers);
  const pct = Math.round(clean.mix.discount_pct * 100);

  if (choice.kind === 'mix') {
    return isEn
      ? `Deal of the Week: ${pct}% off your whole order is applied. Offers do not stack.`
      : `Oferta de la Semana: ${pct}% de descuento en todo tu pedido aplicado. Las ofertas no se acumulan.`;
  }
  if (choice.kind === 'bundle') {
    const free = choice.bundle.freeLines.map((line) => `${line.qty} × ${line.product}`).join(', ');
    const short = choice.bundle.shortByStock.length
      ? (isEn ? ' (limited by stock)' : ' (limitado por inventario)')
      : '';
    return isEn
      ? `Deal of the Week: ${free} FREE added to your order${short}. Offers do not stack.`
      : `Oferta de la Semana: ${free} GRATIS en tu pedido${short}. Las ofertas no se acumulan.`;
  }
  if (choice.kind === 'volume') {
    return isEn
      ? 'Your volume discount saves more than this week\'s offers, so it is applied instead.'
      : 'Tu descuento por volumen ahorra más que las ofertas de esta semana, así que se aplica ese.';
  }

  const hints = [];
  if (clean.mix.enabled) {
    const toGo = Math.max(0, clean.mix.min_units - choice.mix.units);
    hints.push(isEn
      ? `add ${toGo} more deal ${toGo === 1 ? 'vial' : 'vials'} for ${pct}% off your whole order`
      : `agrega ${toGo} ${toGo === 1 ? 'vial' : 'viales'} más de la oferta para ${pct}% de descuento en todo tu pedido`);
  }
  if (clean.bundle.enabled) {
    hints.push(isEn
      ? `buy ${clean.bundle.buy_qty} of the same deal vial to get ${clean.bundle.free_qty} free`
      : `compra ${clean.bundle.buy_qty} del mismo vial de la oferta y llévate ${clean.bundle.free_qty} gratis`);
  }
  const joined = hints.join(isEn ? ', or ' : ', o ');
  return isEn
    ? `Deal of the Week: ${joined}.`
    : `Oferta de la Semana: ${joined}.`;
}

/** Short offer summaries for banners, the bot and broadcasts. */
export function dealOfferSummaries(offers, lang = 'en') {
  const clean = normalizeDealOffers(offers);
  const isEn = String(lang).toLowerCase().startsWith('en');
  const out = [];
  if (clean.mix.enabled) {
    const pct = Math.round(clean.mix.discount_pct * 100);
    out.push(isEn
      ? `Buy ${clean.mix.min_units}+ vials, get ${pct}% off your whole order`
      : `Compra ${clean.mix.min_units}+ viales y obtén ${pct}% de descuento en todo tu pedido`);
  }
  if (clean.bundle.enabled) {
    const { buy_qty: buy, free_qty: free } = clean.bundle;
    out.push(isEn
      ? `Buy ${buy} of the same vial, get ${free} free`
      : `Compra ${buy} del mismo vial y llévate ${free} gratis`);
  }
  return out;
}
