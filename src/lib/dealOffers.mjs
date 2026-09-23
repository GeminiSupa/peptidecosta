/**
 * Flexible deal offers. Admins can add any number of three proven pricing
 * mechanics: "Mix & Match", "Buy X, Get Y Free" and a straight "% off".
 *
 *   Mix & Match — N or more vials from the chosen products takes a percentage
 *   off the WHOLE order, BAC water included. BAC water never counts toward N.
 *
 *   Buy X Get Y — every X vials of one chosen product earn Y more of that same
 *   product free. The customer adds X; the free vials are added for them as
 *   zero-priced "(Free Gift)" lines, so stock, packing list and emails all see
 *   them. BAC water never qualifies.
 *
 *   Flat % off — a percentage off the chosen products themselves, with no
 *   minimum and no code. This is what a flash sale is made of: one vial of one
 *   product at half price qualifies on its own. It discounts only its own
 *   products, never the rest of the cart, so it cannot quietly mark down an
 *   order that happens to contain one sale item.
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
export const MIX_OFFER_TYPE = 'mix';
export const FLAT_OFFER_TYPE = 'flat';
export const BUNDLE_OFFER_TYPE = 'bundle';

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

function offerId(value, index, type) {
  const clean = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return clean || `${type}-${index + 1}`;
}

function rawOfferItems(raw) {
  if (Array.isArray(raw?.items)) return raw.items;
  const items = [];
  if (raw?.mix) items.push({ ...raw.mix, type: MIX_OFFER_TYPE, id: raw.mix.id || 'mix-1' });
  if (raw?.bundle) items.push({ ...raw.bundle, type: BUNDLE_OFFER_TYPE, id: raw.bundle.id || 'bundle-1' });
  return items;
}

function offerType(raw) {
  if (raw?.type === BUNDLE_OFFER_TYPE) return BUNDLE_OFFER_TYPE;
  if (raw?.type === FLAT_OFFER_TYPE) return FLAT_OFFER_TYPE;
  return MIX_OFFER_TYPE;
}

function normalizeOffer(raw, index) {
  const type = offerType(raw);
  const base = {
    id: offerId(raw?.id, index, type),
    type,
    enabled: raw?.enabled === true,
    product_names: names(raw?.product_names),
    name_en: String(raw?.name_en || '').trim().slice(0, 100),
    name_es: String(raw?.name_es || '').trim().slice(0, 100),
    // Which deal contributed this offer. Set when two live deals are merged
    // into one storefront view, so the winning offer can be credited to the
    // deal that owns it rather than to whichever deal was read first.
    deal_id: String(raw?.deal_id || '').trim() || null,
  };
  if (type === BUNDLE_OFFER_TYPE) {
    return { ...base, buy_qty: Math.max(1, toInt(raw?.buy_qty, 4)), free_qty: Math.max(1, toInt(raw?.free_qty, 1)) };
  }
  if (type === FLAT_OFFER_TYPE) {
    return { ...base, discount_pct: Number(raw?.discount_pct) || 0 };
  }
  return { ...base, min_units: Math.max(1, toInt(raw?.min_units, 2)), discount_pct: Number(raw?.discount_pct) || 0 };
}

const disabledMix = () => ({ id: 'mix-1', type: MIX_OFFER_TYPE, enabled: false, product_names: [], name_en: '', name_es: '', min_units: 2, discount_pct: 0 });
const disabledBundle = () => ({ id: 'bundle-1', type: BUNDLE_OFFER_TYPE, enabled: false, product_names: [], name_en: '', name_es: '', buy_qty: 4, free_qty: 1 });

/** A stored or posted offers object, cleaned into one extensible shape. */
export function normalizeDealOffers(raw) {
  const items = rawOfferItems(raw).map(normalizeOffer);
  return {
    items,
    // Compatibility fields keep old deals and older callers working while the
    // flexible builder stores any number of offers in `items`.
    mix: items.find((item) => item.type === MIX_OFFER_TYPE) || disabledMix(),
    bundle: items.find((item) => item.type === BUNDLE_OFFER_TYPE) || disabledBundle(),
  };
}

/** Every product either offer covers, for matching, attribution and the page. */
export function dealOfferProductNames(offers) {
  const clean = normalizeDealOffers(offers);
  return names(clean.items.filter((item) => item.enabled).flatMap((item) => item.product_names));
}

/** '' when the offers can be launched, otherwise what the admin must fix. */
export function dealOffersError(offers) {
  const items = rawOfferItems(offers);
  if (!items.some((item) => item?.enabled === true)) return 'Turn on at least one offer.';
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    if (item.enabled !== true) continue;
    const label = `Offer #${index + 1}`;
    if (![MIX_OFFER_TYPE, BUNDLE_OFFER_TYPE, FLAT_OFFER_TYPE].includes(item.type)) return `${label}: choose a supported offer type.`;
    if (names(item.product_names).length === 0) return `${label}: choose which products qualify.`;
    if (names(item.product_names).some(isBacWater)) return `${label}: BAC Water cannot be an offer product.`;
    if (item.type === FLAT_OFFER_TYPE) {
      if (!(Number(item.discount_pct) > 0 && Number(item.discount_pct) < 1)) return `${label}: the discount must be between 1% and 99%.`;
    } else if (item.type === MIX_OFFER_TYPE) {
      if (!Number.isInteger(Number(item.min_units)) || Number(item.min_units) < 1) return `${label}: the vial minimum must be a whole number of 1 or more.`;
      if (!(Number(item.discount_pct) > 0 && Number(item.discount_pct) < 1)) return `${label}: the discount must be between 1% and 99%.`;
    } else {
      if (!Number.isInteger(Number(item.buy_qty)) || Number(item.buy_qty) < 1) return `${label}: the buy quantity must be a whole number of 1 or more.`;
      if (!Number.isInteger(Number(item.free_qty)) || Number(item.free_qty) < 1) return `${label}: the free quantity must be a whole number of 1 or more.`;
      if (Number(item.free_qty) > Number(item.buy_qty)) return `${label}: the free vials cannot outnumber the vials bought.`;
    }
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
  let merchSubtotal = 0;
  const paidLines = [];
  for (const line of lines || []) {
    const qty = Math.max(0, toInt(line?.qty, 0));
    if (!qty || isBacWater(line?.product)) continue;
    const unitPrice = Number(line?.unitPrice) || 0;
    merchSubtotal += unitPrice * qty;
    paidLines.push({ ...line, qty, unitPrice, key: nameKey(line.product) });
  }

  const offerResults = clean.items.filter((item) => item.enabled).map((item) => {
    const eligibleKeys = new Set(item.product_names.map(nameKey));
    if (item.type === FLAT_OFFER_TYPE) {
      // Only the sale products are discounted, so the saving is measured on
      // their own lines. One vial is enough: there is no minimum to reach.
      let eligibleSubtotal = 0;
      let units = 0;
      for (const line of paidLines) {
        if (!eligibleKeys.has(line.key)) continue;
        eligibleSubtotal += line.unitPrice * line.qty;
        units += line.qty;
      }
      const savings = item.discount_pct * eligibleSubtotal;
      return { id: item.id, dealId: item.deal_id, type: item.type, config: item, qualifies: units > 0 && savings > 0, savings, units, minUnits: 0 };
    }
    if (item.type === MIX_OFFER_TYPE) {
      const units = paidLines.reduce((sum, line) => sum + (eligibleKeys.has(line.key) ? line.qty : 0), 0);
      const qualifies = units >= item.min_units;
      const savings = qualifies ? item.discount_pct * (merchSubtotal + (Number(bacCharge) || 0)) : 0;
      return { id: item.id, dealId: item.deal_id, type: item.type, config: item, qualifies, savings, units, minUnits: item.min_units };
    }

    const quantities = new Map();
    for (const line of paidLines) {
      if (!eligibleKeys.has(line.key)) continue;
      // One product can arrive on two lines; the vials still count together.
      const entry = quantities.get(line.key) || { product: line.product, qty: 0, unitPrice: line.unitPrice, inventoryCount: line.inventoryCount };
      entry.qty += line.qty;
      quantities.set(line.key, entry);
    }
    const freeLines = [];
    const shortByStock = [];
    for (const entry of quantities.values()) {
      let free = Math.floor(entry.qty / item.buy_qty) * item.free_qty;
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
    const savings = freeLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
    return { id: item.id, dealId: item.deal_id, type: item.type, config: item, qualifies: freeLines.length > 0, savings, freeLines, shortByStock };
  });

  const volumeSavings = Math.max(0, Number(volumePct) || 0) / 100 * merchSubtotal;

  // Strictly greater wins, in the admin's displayed order. An exact tie stays
  // with the first weekly offer rather than silently switching to another one.
  let winner = null;
  for (const result of offerResults) {
    if (result.qualifies && result.savings > (winner?.savings || 0)) winner = result;
  }
  let kind = winner?.type || 'none';
  let savings = winner?.savings || 0;
  if (volumeSavings > savings) { kind = 'volume'; savings = volumeSavings; winner = null; }

  const firstMix = offerResults.find((item) => item.type === MIX_OFFER_TYPE);
  const firstBundle = offerResults.find((item) => item.type === BUNDLE_OFFER_TYPE);

  return {
    kind,
    savings,
    offerId: winner?.id || null,
    // The deal the winning offer came from, so an order is credited to the
    // flash sale or to the weekly deal — whichever actually discounted it.
    dealId: winner?.dealId || null,
    offer: winner?.config || null,
    offers: offerResults,
    mix: {
      enabled: Boolean(firstMix),
      units: firstMix?.units || 0,
      minUnits: firstMix?.config.min_units || 0,
      qualifies: firstMix?.qualifies || false,
      discountPct: firstMix?.config.discount_pct || 0,
      savings: firstMix?.savings || 0,
    },
    bundle: {
      enabled: Boolean(firstBundle),
      qualifies: firstBundle?.qualifies || false,
      freeLines: kind === BUNDLE_OFFER_TYPE ? (winner?.freeLines || []) : [],
      possibleFreeLines: firstBundle?.freeLines || [],
      savings: firstBundle?.savings || 0,
      shortByStock: firstBundle?.shortByStock || [],
    },
    volumeSavings,
  };
}

/** The order line for free vials, tagged the way every gift line already is. */
export function freeVialLine(product, qty, lang = 'es') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  return { product: `${product} ${isEn ? '(Free Gift)' : '(Regalo)'}`, qty, price: 0 };
}

function offerDisplayName(item, lang) {
  const isEn = String(lang).toLowerCase().startsWith('en');
  return String(isEn ? item?.name_en : item?.name_es).trim();
}

function offerSummary(item, lang = 'en') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const customName = offerDisplayName(item, lang);
  const terms = item.type === FLAT_OFFER_TYPE
    ? (isEn
      ? `${Math.round(item.discount_pct * 100)}% off ${item.product_names.join(', ')}`
      : `${Math.round(item.discount_pct * 100)}% de descuento en ${item.product_names.join(', ')}`)
    : item.type === BUNDLE_OFFER_TYPE
    ? (isEn
      ? `Buy ${item.buy_qty} of the same vial, get ${item.free_qty} free`
      : `Compra ${item.buy_qty} del mismo vial y llévate ${item.free_qty} gratis`)
    : (isEn
      ? `Buy ${item.min_units}+ vials, get ${Math.round(item.discount_pct * 100)}% off your whole order`
      : `Compra ${item.min_units}+ viales y obtén ${Math.round(item.discount_pct * 100)}% de descuento en todo tu pedido`);
  return customName ? `${customName}: ${terms}` : terms;
}

/** One line for the cart: which offer applied, or how to reach one. */
export function dealOfferCartMessage(choice, deal, lang = 'en') {
  if (!choice) return '';
  const isEn = String(lang).toLowerCase().startsWith('en');
  const clean = normalizeDealOffers(deal?.offers);
  const winning = choice.offer || clean.items.find((item) => item.id === choice.offerId);
  const winningResult = choice.offers?.find((item) => item.id === choice.offerId);

  if (choice.kind === MIX_OFFER_TYPE && winning) {
    const pct = Math.round(winning.discount_pct * 100);
    return isEn
      ? `Deal of the Week — ${offerDisplayName(winning, lang) || 'Mix & Match'}: ${pct}% off your whole order is applied. Offers do not stack.`
      : `Oferta de la Semana — ${offerDisplayName(winning, lang) || 'Combina'}: ${pct}% de descuento en todo tu pedido aplicado. Las ofertas no se acumulan.`;
  }
  if (choice.kind === BUNDLE_OFFER_TYPE && winning) {
    const free = (winningResult?.freeLines || []).map((line) => `${line.qty} × ${line.product}`).join(', ');
    const short = winningResult?.shortByStock?.length
      ? (isEn ? ' (limited by stock)' : ' (limitado por inventario)')
      : '';
    return isEn
      ? `Deal of the Week — ${offerDisplayName(winning, lang) || 'Buy & Get Free'}: ${free} FREE added to your order${short}. Offers do not stack.`
      : `Oferta de la Semana — ${offerDisplayName(winning, lang) || 'Compra y recibe gratis'}: ${free} GRATIS en tu pedido${short}. Las ofertas no se acumulan.`;
  }
  if (choice.kind === FLAT_OFFER_TYPE && winning) {
    const pct = Math.round(winning.discount_pct * 100);
    const what = winning.product_names.join(', ');
    return isEn
      ? `Flash sale — ${pct}% off ${what} is applied. Offers do not stack, so you always get the biggest saving.`
      : `Oferta relámpago — ${pct}% de descuento en ${what} aplicado. Las ofertas no se acumulan; siempre recibes el mayor ahorro.`;
  }
  if (choice.kind === 'volume') {
    return isEn
      ? 'Your volume discount saves more than this week\'s offers, so it is applied instead.'
      : 'Tu descuento por volumen ahorra más que las ofertas de esta semana, así que se aplica ese.';
  }

  const hints = clean.items.filter((item) => item.enabled).map((item) => {
    const result = choice.offers?.find((candidate) => candidate.id === item.id);
    if (item.type === MIX_OFFER_TYPE) {
      const toGo = Math.max(0, item.min_units - (result?.units || 0));
      const pct = Math.round(item.discount_pct * 100);
      return isEn
        ? `add ${toGo} more qualifying ${toGo === 1 ? 'vial' : 'vials'} for ${pct}% off your whole order`
        : `agrega ${toGo} ${toGo === 1 ? 'vial participante' : 'viales participantes'} para ${pct}% de descuento en todo tu pedido`;
    }
    if (item.type === FLAT_OFFER_TYPE) {
      const pct = Math.round(item.discount_pct * 100);
      return isEn
        ? `add ${item.product_names.join(' or ')} for ${pct}% off`
        : `agrega ${item.product_names.join(' o ')} para ${pct}% de descuento`;
    }
    return isEn
      ? `buy ${item.buy_qty} of the same qualifying vial to get ${item.free_qty} free`
      : `compra ${item.buy_qty} del mismo vial participante y llévate ${item.free_qty} gratis`;
  });
  const joined = hints.join(isEn ? ', or ' : ', o ');
  return isEn
    ? `Deal of the Week: ${joined}.`
    : `Oferta de la Semana: ${joined}.`;
}

/** Short offer summaries for banners, the bot and broadcasts. */
export function dealOfferSummaries(offers, lang = 'en') {
  const clean = normalizeDealOffers(offers);
  return clean.items.filter((item) => item.enabled).map((item) => offerSummary(item, lang));
}

/**
 * The complete customer-facing rules for the configured offers.
 *
 * Kept beside the pricing engine so the storefront page and the admin review
 * cannot drift into describing different rules. Every number comes from the
 * saved deal; changing a threshold in admin changes this copy automatically.
 */
export function dealOfferRuleSummaries(offers, lang = 'en') {
  const clean = normalizeDealOffers(offers);
  const isEn = String(lang).toLowerCase().startsWith('en');
  const rules = [];

  for (const item of clean.items.filter((offer) => offer.enabled)) {
    const customName = offerDisplayName(item, lang);
    const prefix = customName || (item.type === MIX_OFFER_TYPE
      ? (isEn ? 'Mix & Match' : 'Combina')
      : (isEn ? 'Buy & Get Free' : 'Compra y recibe gratis'));
    if (item.type === MIX_OFFER_TYPE) {
      const pct = Math.round(item.discount_pct * 100);
      rules.push(isEn
        ? `${prefix}: buy ${item.min_units} or more qualifying peptide vials in any combination and get ${pct}% off your entire order.`
        : `${prefix}: compra ${item.min_units} o más viales de péptidos participantes en cualquier combinación y obtén ${pct}% de descuento en todo tu pedido.`);
    } else {
      const { buy_qty: buy, free_qty: free } = item;
      rules.push(isEn
        ? `${prefix}: every ${buy} paid vials of the exact same product and size add ${free} more of that same item free (${buy * 2} → ${free * 2} free, ${buy * 3} → ${free * 3} free).`
        : `${prefix}: cada ${buy} viales pagados del mismo producto y tamaño agregan ${free} más del mismo artículo gratis (${buy * 2} → ${free * 2} gratis, ${buy * 3} → ${free * 3} gratis).`);
    }
  }

  rules.push(isEn
    ? 'If more than one deal or the normal volume discount qualifies, checkout automatically applies only the option that saves the customer the most. Promo codes and promotions never stack.'
    : 'Si califica más de una oferta o el descuento normal por volumen, el pago aplica automáticamente solo la opción que más ahorra al cliente. Los códigos y promociones nunca se acumulan.');
  const hasMix = clean.items.some((item) => item.enabled && item.type === MIX_OFFER_TYPE);
  const hasBundle = clean.items.some((item) => item.enabled && item.type === BUNDLE_OFFER_TYPE);
  if (hasMix && hasBundle) {
    rules.push(isEn
      ? 'BAC Water does not count toward the Mix & Match minimum and cannot earn a free vial. Once Mix & Match is unlocked, its whole-order discount still includes BAC Water.'
      : 'El agua bacteriostática no cuenta para el mínimo de Combina y no puede generar un vial gratis. Cuando se activa Combina, su descuento para todo el pedido sí incluye el agua bacteriostática.');
  } else if (hasMix) {
    rules.push(isEn
      ? 'BAC Water does not count toward the Mix & Match minimum. Once the offer is unlocked, its whole-order discount still includes BAC Water.'
      : 'El agua bacteriostática no cuenta para el mínimo de Combina. Cuando se activa la oferta, su descuento para todo el pedido sí incluye el agua bacteriostática.');
  } else {
    rules.push(isEn
      ? 'BAC Water does not qualify and cannot earn a free vial.'
      : 'El agua bacteriostática no califica y no puede generar un vial gratis.');
  }
  rules.push(isEn
    ? 'The winning offer is applied automatically at checkout. No code is needed.'
    : 'La oferta ganadora se aplica automáticamente al pagar. No se necesita código.');

  return rules;
}
