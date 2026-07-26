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

/**
 * Turn an admin form value into what the column stores: a positive whole
 * number, or null for "no limit". Empty string, 0, and rubbish all mean no
 * limit. Shared by the create and edit endpoints so a value saved through one
 * screen behaves identically when saved through the other.
 */
export function parseUnitLimit(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
}

/**
 * Guards against a code nobody can ever use ("at least 10" AND "at most 4").
 * @returns {string|null} an error message, or null when the pair is usable.
 */
export function validateUnitRange(minUnits, maxUnits) {
  if (minUnits && maxUnits && maxUnits < minUnits) {
    return `max_units (${maxUnits}) cannot be lower than min_units (${minUnits}) — no cart could satisfy both.`;
  }
  return null;
}

export function getMaxUnits(promo) {
  const value = Number(promo?.max_units ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * The mirror of checkMinUnits, for capped introductory offers - "15% off your
 * first order of up to 4 products". The cap is the point of the offer: without
 * it the code meant to buy a small first purchase gets spent on a thirty-vial
 * order at full discount.
 *
 * @returns {{ok: boolean, maxUnits: number, unitCount: number, excess: number}}
 */
export function checkMaxUnits(promo, unitCount) {
  const maxUnits = getMaxUnits(promo);
  const units = Number.isFinite(Number(unitCount)) ? Number(unitCount) : 0;
  const ok = maxUnits === 0 || units <= maxUnits;
  return { ok, maxUnits, unitCount: units, excess: ok ? 0 : units - maxUnits };
}

/** Customer-facing wording. Returns null when the cart is within the cap. */
export function maxUnitsMessage(promo, unitCount, lang = 'es') {
  const { ok, maxUnits, excess } = checkMaxUnits(promo, unitCount);
  if (ok) return null;

  const isEn = String(lang).toLowerCase().startsWith('en');
  return isEn
    ? `This code covers up to ${maxUnits} units — remove ${excess} to use it.`
    : `Este código cubre hasta ${maxUnits} unidades — quitá ${excess} para usarlo.`;
}

/**
 * Both unit conditions in one call.
 *
 * Every caller has to check the minimum AND the maximum, and there are four of
 * them (validate endpoint, cart re-check, order creation, admin preview).
 * Checking them one at a time is how a condition ends up enforced in three
 * places out of four, so callers get a single function instead.
 *
 * @returns {{ok: boolean, reason: null|'min'|'max', minUnits: number, maxUnits: number, unitCount: number}}
 */
export function checkUnitLimits(promo, unitCount) {
  const min = checkMinUnits(promo, unitCount);
  const max = checkMaxUnits(promo, unitCount);
  return {
    ok: min.ok && max.ok,
    reason: !min.ok ? 'min' : (!max.ok ? 'max' : null),
    minUnits: min.minUnits,
    maxUnits: max.maxUnits,
    unitCount: min.unitCount,
  };
}

/** Customer-facing wording for whichever limit failed. Null when both pass. */
export function unitLimitsMessage(promo, unitCount, lang = 'es') {
  const { reason, unitCount: units } = checkUnitLimits(promo, unitCount);
  if (reason === 'min') return minUnitsMessage(promo, units, lang);
  if (reason === 'max') return maxUnitsMessage(promo, units, lang);
  return null;
}

/**
 * A promo with a unit minimum is a negotiated bulk deal, so it REPLACES the
 * automatic volume discount rather than stacking on top of it.
 *
 * Without this the two compound: a 25% code on a cart already getting the
 * automatic 20% leaves the customer paying 60% of list, not 75%. The person
 * setting up the deal types the figure they agreed and quietly gives away far
 * more. Replacing rather than stacking makes the number typed the number the
 * customer receives.
 */
export function replacesVolumeDiscount(promo) {
  return getMinUnits(promo) > 0;
}

/** Volume discount percent to apply, given any promo currently in the cart. */
export function effectiveVolumeDiscountPct(promo, volumeDiscountPct) {
  if (promo && replacesVolumeDiscount(promo)) return 0;
  return Number(volumeDiscountPct) || 0;
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
