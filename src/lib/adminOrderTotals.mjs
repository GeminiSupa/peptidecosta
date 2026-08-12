import { isBacWater, splitCartUnits } from './bacWater.mjs';

export function getAdminVolumeDiscountPct(items = []) {
  const { discountUnits } = splitCartUnits(items);
  if (discountUnits >= 10) return 20;
  if (discountUnits >= 5) return 15;
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

export function calculateAdminOrderTotals(items = [], shipping = 0, discounts = {}) {
  const itemsSubtotal = getAdminOrderSubtotal(items);
  const discountableSubtotal = (items || []).reduce((sum, item) => {
    const name = item?.product ?? item?.name;
    if (isBacWater(name)) return sum;
    return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
  }, 0);
  const excludedSubtotal = itemsSubtotal - discountableSubtotal;
  const discountPct = getAdminVolumeDiscountPct(items);
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
