import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countCartUnits,
  getMinUnits,
  checkMinUnits,
  minUnitsMessage,
  replacesVolumeDiscount,
  effectiveVolumeDiscountPct,
  getMaxUnits,
  checkMaxUnits,
  maxUnitsMessage,
  checkUnitLimits,
  unitLimitsMessage,
  parseUnitLimit,
  validateUnitRange,
} from '../src/lib/promoEligibility.mjs';

test('counts units across every line, not lines', () => {
  assert.equal(countCartUnits([{ qty: 12 }, { qty: 8 }]), 20);
  assert.equal(countCartUnits([{ quantity: 5 }, { qty: 5 }]), 10);
  assert.equal(countCartUnits([]), 0);
  assert.equal(countCartUnits(null), 0);
});

test('a line with no quantity counts as one', () => {
  assert.equal(countCartUnits([{ product: 'X' }]), 1);
});

test('ignores nonsense quantities rather than producing NaN', () => {
  assert.equal(countCartUnits([{ qty: 'abc' }, { qty: 5 }]), 5);
  assert.equal(countCartUnits([{ qty: -3 }, { qty: 4 }]), 4);
});

test('no minimum set means every cart qualifies', () => {
  assert.equal(getMinUnits({ min_units: null }), 0);
  assert.equal(getMinUnits({ min_units: 0 }), 0);
  assert.equal(getMinUnits({}), 0);
  assert.equal(checkMinUnits({ min_units: null }, 1).ok, true);
});

test('enforces the minimum at the boundary', () => {
  const promo = { min_units: 20 };
  assert.equal(checkMinUnits(promo, 19).ok, false);
  assert.equal(checkMinUnits(promo, 20).ok, true, '20 units must satisfy "20 or more"');
  assert.equal(checkMinUnits(promo, 21).ok, true);
});

test('reports how many more units are needed', () => {
  const result = checkMinUnits({ min_units: 20 }, 14);
  assert.equal(result.shortfall, 6);
  assert.equal(result.minUnits, 20);
  assert.equal(result.unitCount, 14);
});

test('an empty cart fails a minimum', () => {
  assert.equal(checkMinUnits({ min_units: 20 }, 0).ok, false);
});

test('message names the requirement and the gap', () => {
  assert.equal(
    minUnitsMessage({ min_units: 20 }, 14, 'en'),
    'This code needs 20 units or more — add 6 more to use it.',
  );
  assert.match(minUnitsMessage({ min_units: 20 }, 14, 'es'), /20 unidades o más/);
});

test('no message once the requirement is met', () => {
  assert.equal(minUnitsMessage({ min_units: 20 }, 20, 'en'), null);
  assert.equal(minUnitsMessage({ min_units: null }, 1, 'en'), null);
});

test('a cart that drops below the minimum stops qualifying', () => {
  const promo = { min_units: 20 };
  const before = countCartUnits([{ qty: 20 }]);
  assert.equal(checkMinUnits(promo, before).ok, true);

  const after = countCartUnits([{ qty: 5 }]);
  assert.equal(checkMinUnits(promo, after).ok, false, 'removing items must revoke the discount');
});

test('a bulk promo replaces the automatic volume discount', () => {
  assert.equal(replacesVolumeDiscount({ min_units: 20 }), true);
  assert.equal(effectiveVolumeDiscountPct({ min_units: 20 }, 20), 0);
});

test('an ordinary promo leaves the volume discount alone', () => {
  assert.equal(replacesVolumeDiscount({ min_units: null }), false);
  assert.equal(effectiveVolumeDiscountPct({ min_units: null }, 20), 20);
  assert.equal(effectiveVolumeDiscountPct(null, 20), 20);
});

test('the typed percentage is what the customer actually receives', () => {
  // 20 units, $1000 subtotal, 20% automatic volume discount, 25% bulk code.
  const subtotal = 1000;
  const volumePct = effectiveVolumeDiscountPct({ min_units: 20 }, 20);
  const afterVolume = subtotal * (1 - volumePct / 100);
  const final = afterVolume - afterVolume * 0.25;

  assert.equal(final, 750, 'typing 25% must charge $750, not $600');
  assert.equal(Math.round((1 - final / subtotal) * 100), 25);
});

test('without the minimum, the old compounding still applies', () => {
  const subtotal = 1000;
  const volumePct = effectiveVolumeDiscountPct({ min_units: null }, 20);
  const afterVolume = subtotal * (1 - volumePct / 100);
  const final = afterVolume - afterVolume * 0.25;

  assert.equal(final, 600, 'ordinary codes are unchanged by this feature');
});

test('no maximum set means every cart qualifies', () => {
  assert.equal(getMaxUnits({ max_units: null }), 0);
  assert.equal(getMaxUnits({ max_units: 0 }), 0);
  assert.equal(getMaxUnits({}), 0);
  assert.equal(checkMaxUnits({ max_units: null }, 999).ok, true);
});

test('enforces the maximum at the boundary', () => {
  const promo = { max_units: 4 };
  assert.equal(checkMaxUnits(promo, 3).ok, true);
  assert.equal(checkMaxUnits(promo, 4).ok, true, '4 units must satisfy "up to 4"');
  assert.equal(checkMaxUnits(promo, 5).ok, false);
});

test('reports how many units are over the cap', () => {
  const result = checkMaxUnits({ max_units: 4 }, 10);
  assert.equal(result.excess, 6);
  assert.equal(result.maxUnits, 4);
  assert.equal(result.unitCount, 10);
});

test('an empty cart never breaches a maximum', () => {
  assert.equal(checkMaxUnits({ max_units: 4 }, 0).ok, true);
});

test('max message names the cap and the excess', () => {
  assert.equal(
    maxUnitsMessage({ max_units: 4 }, 6, 'en'),
    'This code covers up to 4 units — remove 2 to use it.',
  );
  assert.match(maxUnitsMessage({ max_units: 4 }, 6, 'es'), /hasta 4 unidades/);
  assert.equal(maxUnitsMessage({ max_units: 4 }, 4, 'en'), null);
});

test('a cart that grows past the cap stops qualifying', () => {
  const promo = { max_units: 4 };
  const before = countCartUnits([{ qty: 3 }]);
  assert.equal(checkMaxUnits(promo, before).ok, true);

  const after = countCartUnits([{ qty: 3 }, { qty: 5 }]);
  assert.equal(checkMaxUnits(promo, after).ok, false, 'adding items must revoke the discount');
});

test('a capped code leaves the automatic volume discount alone', () => {
  // Only a minimum marks a negotiated bulk deal. A cap is an intro offer and
  // must not silently switch the volume discount off.
  assert.equal(replacesVolumeDiscount({ max_units: 4 }), false);
  assert.equal(effectiveVolumeDiscountPct({ max_units: 4 }, 20), 20);
});

test('both limits are checked together, minimum reported first', () => {
  const promo = { min_units: 2, max_units: 4 };
  assert.equal(checkUnitLimits(promo, 1).reason, 'min');
  assert.equal(checkUnitLimits(promo, 3).ok, true);
  assert.equal(checkUnitLimits(promo, 3).reason, null);
  assert.equal(checkUnitLimits(promo, 9).reason, 'max');
});

test('the combined message matches whichever limit failed', () => {
  const promo = { min_units: 2, max_units: 4 };
  assert.match(unitLimitsMessage(promo, 1, 'en'), /needs 2 units or more/);
  assert.match(unitLimitsMessage(promo, 9, 'en'), /up to 4 units/);
  assert.equal(unitLimitsMessage(promo, 3, 'en'), null);
});

test('a code with only a cap ignores the minimum entirely', () => {
  const promo = { min_units: null, max_units: 4 };
  assert.equal(checkUnitLimits(promo, 1).ok, true, 'one unit is a valid first order');
  assert.equal(checkUnitLimits(promo, 5).reason, 'max');
});

test('admin form values become a column value or null', () => {
  assert.equal(parseUnitLimit('4'), 4);
  assert.equal(parseUnitLimit(4), 4);
  assert.equal(parseUnitLimit('4.7'), 4, 'fractions of a vial cannot be ordered');
  assert.equal(parseUnitLimit(''), null);
  assert.equal(parseUnitLimit('0'), null);
  assert.equal(parseUnitLimit(null), null);
  assert.equal(parseUnitLimit(undefined), null);
  assert.equal(parseUnitLimit('abc'), null);
  assert.equal(parseUnitLimit(-3), null);
});

test('an impossible range is rejected before it can be saved', () => {
  assert.match(validateUnitRange(10, 4), /cannot be lower/);
  assert.equal(validateUnitRange(4, 10), null);
  assert.equal(validateUnitRange(4, 4), null, 'exactly four is a usable range');
  assert.equal(validateUnitRange(null, 4), null);
  assert.equal(validateUnitRange(10, null), null);
  assert.equal(validateUnitRange(null, null), null);
});
