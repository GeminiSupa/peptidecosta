import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countCartUnits,
  getMinUnits,
  checkMinUnits,
  minUnitsMessage,
  replacesVolumeDiscount,
  effectiveVolumeDiscountPct,
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
