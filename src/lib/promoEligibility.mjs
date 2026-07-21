/**
 * Cart-dependent promo conditions.
 *
 * Kept separate from the code's own validity (active, in date, under its usage
 * limit) because these depend on what is in the basket right now. A cart can
 * stop qualifying after the code was accepted — someone applies a 20-unit code
 * then removes items — so the same check has to run again on every cart change,
 * not only at the moment the code is entered.
 */

/** Total units across every line, matching how the volume discount counts. */
export function countCartUnits(cart = []) {
  return (cart || []).reduce((sum, item) => {
    const qty = parseInt(item?.qty ?? item?.quantity ?? 1, 10);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);
}

export function getMinUnits(promo) {
  const value = Number(promo?.min_units ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * @returns {{ok: boolean, minUnits: number, unitCount: number, shortfall: number}}
 */
export function checkMinUnits(promo, unitCount) {
  const minUnits = getMinUnits(promo);
  const units = Number.isFinite(Number(unitCount)) ? Number(unitCount) : 0;
  const ok = minUnits === 0 || units >= minUnits;
  return { ok, minUnits, unitCount: units, shortfall: ok ? 0 : minUnits - units };
}

/** Customer-facing wording. Returns null when the requirement is met. */
export function minUnitsMessage(promo, unitCount, lang = 'es') {
  const { ok, minUnits, shortfall } = checkMinUnits(promo, unitCount);
  if (ok) return null;

  const isEn = String(lang).toLowerCase().startsWith('en');
  return isEn
    ? `This code needs ${minUnits} units or more — add ${shortfall} more to use it.`
    : `Este código requiere ${minUnits} unidades o más — agregá ${shortfall} más para usarlo.`;
}
