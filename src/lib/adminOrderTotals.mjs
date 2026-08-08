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

export function calculateAdminOrderTotals(items = [], shipping = 0) {
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

  return {
    itemsSubtotal,
    discountableSubtotal,
    excludedSubtotal,
    discountPct,
    discountAmount,
    discountedSubtotal,
    total: discountedSubtotal + (Number(shipping) || 0),
  };
}
