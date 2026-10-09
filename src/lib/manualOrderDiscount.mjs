/**
 * Which discount a manual order gets, and what the form previews.
 *
 * Manual orders used to be priced with no knowledge of the running promotion:
 * the browser and the server both applied the volume tier and whatever the
 * agent typed, and a flash sale that halved GHK-Cu on the website charged full
 * price over the phone. The sales team had to remember every live offer and
 * type it in by hand, which is exactly the mistake this removes.
 *
 * Three modes, because an agent needs all three and the order must record which
 * one was chosen:
 *   auto   - the default. The best running offer or the volume tier, whichever
 *            saves more. Nobody types anything.
 *   custom - the agent's own negotiated figure instead. The automatic discount
 *            stands aside, the same way it already did when a figure was typed.
 *   none   - list price, no automatic discount and no typed one.
 *
 * The amounts here are a preview only. `authoritativeCheckout` re-prices every
 * manual order against the live deal before it is saved, so a stale offer in a
 * form left open cannot reach a customer's receipt.
 */
import { applyBacAwareDiscount, isBacWater } from './bacWater.mjs';
import {
  chooseDealOffer,
  dealOfferNextTierNudge,
  OFFERS_PRICING_MODE,
} from './dealOffers.mjs';
import { getAdminVolumeDiscountPct, normalizeManualDiscountType } from './adminOrderTotals.mjs';

export const DISCOUNT_MODE_AUTO = 'auto';
export const DISCOUNT_MODE_CUSTOM = 'custom';
export const DISCOUNT_MODE_NONE = 'none';

const MODES = new Set([DISCOUNT_MODE_AUTO, DISCOUNT_MODE_CUSTOM, DISCOUNT_MODE_NONE]);

export function normalizeDiscountMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return MODES.has(mode) ? mode : DISCOUNT_MODE_AUTO;
}

/**
 * The mode a posted order asked for.
 *
 * `discount_mode` is new, so an API caller that predates it (or the order panel
 * reposting an older order) is read the way it was read before: a typed
 * discount means custom, an explicit `apply_volume_discount: false` means none,
 * and anything else gets the automatic discount.
 */
export function resolveManualOrderDiscountMode(order) {
  const explicit = String(order?.discount_mode || '').trim().toLowerCase();
  if (MODES.has(explicit)) return explicit;

  const type = normalizeManualDiscountType(order?.manual_discount_type);
  const value = Number(order?.manual_discount_value || 0);
  if (type && Number.isFinite(value) && value > 0) return DISCOUNT_MODE_CUSTOM;
  if (order?.apply_volume_discount === false) return DISCOUNT_MODE_NONE;
  return DISCOUNT_MODE_AUTO;
}

/** The offers to price a cart with, or null when no running deal has any. */
export function dealOffersForPricing(deal) {
  if (!deal) return null;
  const mode = String(deal.pricing_mode || 'shelf').trim().toLowerCase();
  if (mode !== OFFERS_PRICING_MODE) return null;
  return deal.offers || null;
}

const pct = (fraction) => Math.round((Number(fraction) || 0) * 1000) / 10;

// Mirrors authoritativeCheckout's own rounding, which is not exported. Colones
// have no cents; dollars have two. A preview that rounds differently from the
// server is the half-dollar mismatch this file exists to prevent.
const roundCurrency = (value, currency) => (currency === 'USD'
  ? Math.round((Number(value) || 0) * 100) / 100
  : Math.round(Number(value) || 0));

function inventoryOf(products, name) {
  const match = (products || []).find((product) => (
    String(product?.product ?? product?.name ?? '').trim() === String(name || '').trim()
  ));
  if (!match) return null;
  const count = match.inventoryCount ?? match.inventory_count;
  return count === '' || count === undefined ? null : count;
}

/** Form rows -> the line shape `chooseDealOffer` and the volume tier read. */
function pricingLines(items = [], products = []) {
  return (items || [])
    .filter((item) => item?.product && Number(item.price) > 0 && Number(item.qty) > 0)
    .map((item) => ({
      product: item.product,
      qty: Number(item.qty) || 1,
      price: Number(item.price) || 0,
      unitPrice: Number(item.price) || 0,
      inventoryCount: inventoryOf(products, item.product),
    }));
}

/**
 * What the automatic discount is worth on this cart, right now.
 *
 * Mirrors `authoritativeCheckout`'s own arithmetic deliberately: a winning
 * offer switches the volume tier off, a `bundle` win is paid in free vials
 * rather than money, and everything else lands as one amount off the subtotal.
 * `tests/manual-order-auto-discount.test.mjs` prices the same carts through
 * both and fails if they drift apart.
 */
/**
 * What the automatic discount is worth on this cart, right now.
 *
 * One amount, whichever rule won: the best running offer or the volume tier.
 * Mirrors `authoritativeCheckout`'s arithmetic deliberately - a winning offer
 * switches the volume tier off, a `bundle` win is paid in free vials rather
 * than money, and the rounding is the server's.
 * `tests/manual-order-auto-discount.test.mjs` prices the same carts through
 * both and fails if they drift apart.
 */
export function previewAutomaticDiscount({
  items = [],
  deal = null,
  products = [],
  currency = 'CRC',
  // An order being edited keeps the tier it was priced at, so a deal-week
  // order does not drop to the standing rate just because it was reopened.
  // The offers are weighed against that same rate, exactly as the server
  // weighs them (authoritativeCheckout's volumeDiscountPctOverride).
  volumePctOverride = null,
} = {}) {
  const lines = pricingLines(items, products);
  const overridden = Number(volumePctOverride);
  const volumePct = Number.isFinite(overridden) && volumePctOverride !== null
    ? Math.max(0, overridden)
    : getAdminVolumeDiscountPct(lines);
  const offers = dealOffersForPricing(deal);
  const empty = { kind: 'none', label: '', nudge: '', volumePct: 0, offerDiscount: 0, freeLines: [], choice: null };

  if (!lines.length) return empty;

  // Paid bacteriostatic water is inside a Mix & Match's "whole order" and
  // inside the volume tier's base, so it is measured the way the server
  // measures it rather than left out.
  const discountableSubtotal = lines
    .filter((line) => !isBacWater(line.product))
    .reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const bacCharge = lines
    .filter((line) => isBacWater(line.product))
    .reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const volumeAmount = () => applyBacAwareDiscount(discountableSubtotal, bacCharge, volumePct).discountAmount;

  if (!offers) {
    if (volumePct <= 0) return empty;
    return {
      kind: 'volume',
      label: `Volume discount \u2014 ${volumePct}% off`,
      nudge: '',
      volumePct,
      offerDiscount: volumeAmount(),
      freeLines: [],
      choice: null,
    };
  }

  const choice = chooseDealOffer(offers, lines, { volumePct, bacCharge });
  const offer = choice.offer;

  let label = '';
  let freeLines = [];
  let offerDiscount = 0;
  if (choice.kind === 'mix') {
    // "% off your entire order" - the paid water included, as on the website.
    offerDiscount = roundCurrency((discountableSubtotal + bacCharge) * (Number(offer?.discount_pct) || 0), currency);
    label = `Mix & Match \u2014 ${pct(offer?.discount_pct)}% off the whole order`;
  } else if (choice.kind === 'flat') {
    offerDiscount = roundCurrency(choice.savings, currency);
    const what = (offer?.product_names || []).join(', ');
    label = `Flash sale \u2014 ${pct(offer?.discount_pct)}% off${what ? ` ${what}` : ''}`;
  } else if (choice.kind === 'pair') {
    offerDiscount = roundCurrency(choice.savings, currency);
    label = `2nd vial \u2014 ${pct(offer?.discount_pct)}% off the cheaper vial`;
  } else if (choice.kind === 'bundle') {
    // Paid in vials, not in money: the total does not move, the box gets fuller.
    freeLines = choice.bundle?.freeLines || [];
    const what = freeLines.map((line) => `${line.qty} \u00d7 ${line.product}`).join(', ');
    label = `Buy ${offer?.buy_qty} get ${offer?.free_qty} free \u2014 ${what} added free`;
  } else if (choice.kind === 'volume') {
    offerDiscount = volumeAmount();
    label = `Volume discount \u2014 ${volumePct}% off (beats this week's offers)`;
  }

  return {
    kind: choice.kind,
    label,
    // "Add 1 more vial for Mix & Match" - the mistake worth catching before the
    // order is saved, not after the customer has been quoted a price.
    nudge: choice.kind === 'none' || choice.kind === 'volume'
      ? (dealOfferNextTierNudge(choice, 'en') || '')
      : '',
    // Reported for the wording only. The amount above is the whole automatic
    // discount, so nothing downstream applies the tier a second time.
    volumePct: choice.kind === 'volume' ? volumePct : 0,
    offerDiscount,
    freeLines,
    choice,
  };
}
