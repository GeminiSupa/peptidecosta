import { isBacWater, splitCartUnits } from './bacWater.mjs';
import { tenPlusDiscountPct, STANDARD_FIVE_PLUS_PCT } from './bulkDeal.mjs';

export const ADMIN_FALLBACK_EXCHANGE_RATE = 454.48;

export function normalizeAdminOrderCurrency(currency) {
  return String(currency || '').trim().toUpperCase() === 'USD' ? 'USD' : 'CRC';
}

// Must track getVolumeDiscountPct in src/lib/pricing.js, which is what the
// create/update routes actually charge. When this read a fixed 20% through a
// 35% deal week the form quoted the agent a total the server then contradicted
// on the saved order.
//
// Known limit: the orders list recomputes this from the items, so an order
// placed during a deal shows the standing tier once the deal lapses. Fixing
// that properly means storing the percentage on the order.
export function getAdminVolumeDiscountPct(items = []) {
  const { discountUnits } = splitCartUnits(items);
  if (discountUnits >= 10) return tenPlusDiscountPct();
  if (discountUnits >= 5) return STANDARD_FIVE_PLUS_PCT;
  return 0;
}

export function getAdminOrderSubtotal(items = []) {
  return (items || []).reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
    0
  );
}

const finiteNonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export function getAdminShippingCosts(amount, currency, exchangeRate = ADMIN_FALLBACK_EXCHANGE_RATE) {
  const primaryAmount = finiteNonNegative(amount);
  const rate = Number(exchangeRate);
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : ADMIN_FALLBACK_EXCHANGE_RATE;
  const normalizedCurrency = normalizeAdminOrderCurrency(currency);

  if (normalizedCurrency === 'USD') {
    return {
      usd: Number(primaryAmount.toFixed(2)),
      crc: Math.round(primaryAmount * safeRate),
    };
  }

  return {
    crc: Math.round(primaryAmount),
    usd: Number((primaryAmount / safeRate).toFixed(2)),
  };
}

/**
 * Express one amount in both currencies using the rate that priced the order.
 *
 * Manual orders previously repeated this conversion in the browser with the
 * hard-coded fallback rate. Keeping the conversion here lets the form preview
 * and the authenticated create route use the same rounding rules with the
 * same database-backed live rate.
 */
export function getAdminCurrencyPair(amount, currency, exchangeRate = ADMIN_FALLBACK_EXCHANGE_RATE) {
  return getAdminShippingCosts(amount, currency, exchangeRate);
}

export function normalizeManualDiscountType(type) {
  return type === 'percentage' || type === 'fixed' ? type : null;
}

export function calculateManualDiscountAmount(baseAmount, type, value) {
  const base = finiteNonNegative(baseAmount);
  const normalizedType = normalizeManualDiscountType(type);
  const normalizedValue = finiteNonNegative(value);

  if (!normalizedType || normalizedValue === 0 || base === 0) return 0;
  if (normalizedType === 'percentage') {
    return Math.min(base, base * (Math.min(100, normalizedValue) / 100));
  }
  return Math.min(base, normalizedValue);
}

/**
 * Whether a negotiated discount takes the place of the automatic volume tier.
 *
 * On a manual order it does. When an agent tells a bulk buyer "25% off", the
 * buyer expects 25% off the list price — not 25% off a price the 20% volume
 * tier has already reduced, which is what stacking them produced: a typed 25%
 * came out as roughly 40% and the negotiated figure appeared nowhere on the
 * receipt. Website orders are untouched: nobody negotiated those, and their
 * volume discount is the offer the customer accepted at checkout.
 *
 * The order's own `source` decides it, so an admin-created order keeps the
 * same arithmetic when it is reopened and edited later.
 */
export function isManualOrderSource(source) {
  return String(source || '').trim().toLowerCase() === 'admin_manual';
}

export function manualDiscountReplacesVolume(source, type, value) {
  return isManualOrderSource(source)
    && normalizeManualDiscountType(type) !== null
    && finiteNonNegative(value) > 0;
}

/**
 * The volume rate recorded on an order when it was priced, or null.
 *
 * Reading it back beats recomputing: the tier rules move during a deal week,
 * so re-running them over an old order reprices it against today's offer --
 * on the badge, and on the total if anyone reopens and saves it.
 *
 * NULL/absent means the order predates add-order-volume-discount-pct.sql (or
 * the migration has not been run), and the caller falls back to the item count
 * exactly as it did before.
 */
export function storedOrderVolumePct(order) {
  const raw = order?.volume_discount_pct;
  if (raw === null || raw === undefined || raw === '') return null;
  const pct = Number(raw);
  return Number.isFinite(pct) && pct >= 0 ? pct : null;
}

export function calculateAdminOrderTotals(items = [], shipping = 0, discounts = {}) {
  const itemsSubtotal = getAdminOrderSubtotal(items);
  const discountableSubtotal = (items || []).reduce((sum, item) => {
    const name = item?.product ?? item?.name;
    if (isBacWater(name)) return sum;
    return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
  }, 0);
  const excludedSubtotal = itemsSubtotal - discountableSubtotal;
  // A negotiated discount stands alone: see manualDiscountReplacesVolume.
  // Otherwise prefer the rate recorded when the order was priced; only fall
  // back to the item count when there is none (a brand new order, or a row
  // older than the column).
  const recordedPct = Number.isFinite(Number(discounts.volumeDiscountPct))
    && discounts.volumeDiscountPct !== null
    && discounts.volumeDiscountPct !== undefined
    && discounts.volumeDiscountPct !== ''
    ? Number(discounts.volumeDiscountPct)
    : null;
  const discountPct = discounts.replaceVolumeDiscount === true
    ? 0
    : (recordedPct ?? getAdminVolumeDiscountPct(items));
  const discountAmount = discountPct > 0
    ? discountableSubtotal * (discountPct / 100)
    : 0;
  const discountedSubtotal = discountableSubtotal - discountAmount + excludedSubtotal;
  const promoDiscountAmount = Math.min(
    discountedSubtotal,
    finiteNonNegative(discounts.promoDiscountAmount)
  );
  const subtotalAfterPromo = discountedSubtotal - promoDiscountAmount;
  const manualDiscountAmount = calculateManualDiscountAmount(
    subtotalAfterPromo,
    discounts.manualDiscountType,
    discounts.manualDiscountValue
  );
  const subtotalAfterDiscounts = subtotalAfterPromo - manualDiscountAmount;

  return {
    itemsSubtotal,
    discountableSubtotal,
    excludedSubtotal,
    discountPct,
    discountAmount,
    discountedSubtotal,
    promoDiscountAmount,
    subtotalAfterPromo,
    manualDiscountType: normalizeManualDiscountType(discounts.manualDiscountType),
    manualDiscountValue: finiteNonNegative(discounts.manualDiscountValue),
    manualDiscountAmount,
    subtotalAfterDiscounts,
    total: subtotalAfterDiscounts + finiteNonNegative(shipping),
  };
}
