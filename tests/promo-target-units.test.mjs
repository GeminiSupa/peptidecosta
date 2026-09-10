import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkUnitLimits,
  countCartUnits,
  countPromoEligibleUnits,
} from '../src/lib/promoEligibility.mjs';

// The 48-hour CELLULAR40 sale: 40% off MOTS-C, NAD+ and SS-31, on carts of five
// vials or more, mixable across those three.
const CELLULAR40 = {
  code: 'CELLULAR40',
  discount_pct: 0.4,
  min_units: 5,
  is_flash_sale: true,
  target_product: 'MOTS-C,NAD+,SS-31',
};

test('a cart padded with products the code does not cover stays locked', () => {
  // The exact basket that exposed this: three SS-31, one MOTS-C and one
  // GLP-1. Five vials, but only four the sale covers, and the fifth was
  // enough to hand over 40% on the other $1,500.
  const cart = [
    { product: 'SS-31 25mg', qty: 3 },
    { product: 'Mots-C 40mg', qty: 1 },
    { product: 'GLP-1 5mg', qty: 1 },
  ];

  assert.equal(countCartUnits(cart), 5, 'the basket really does hold five vials');
  assert.equal(countPromoEligibleUnits(CELLULAR40, cart), 4, 'only four of them are on sale');
  assert.equal(checkUnitLimits(CELLULAR40, countPromoEligibleUnits(CELLULAR40, cart)).ok, false);
});

test('five covered vials unlock it, mixed across the sale products', () => {
  const cart = [
    { product: 'SS-31 25mg', qty: 3 },
    { product: 'Mots-C 40mg', qty: 1 },
    { product: 'NAD+ 500mg', qty: 1 },
  ];
  assert.equal(countPromoEligibleUnits(CELLULAR40, cart), 5);
  assert.equal(checkUnitLimits(CELLULAR40, countPromoEligibleUnits(CELLULAR40, cart)).ok, true);
});

test('both NAD+ sizes count, because the target is matched as a substring', () => {
  const cart = [
    { product: 'NAD+ 500mg', qty: 3 },
    { product: 'NAD+ 1000mg', qty: 2 },
  ];
  assert.equal(countPromoEligibleUnits(CELLULAR40, cart), 5);
});

test('uncovered products alone never unlock a targeted code', () => {
  const cart = [{ product: 'GLP-1 5mg', qty: 40 }];
  assert.equal(countPromoEligibleUnits(CELLULAR40, cart), 0);
  assert.equal(checkUnitLimits(CELLULAR40, countPromoEligibleUnits(CELLULAR40, cart)).ok, false);
});

test('an untargeted code still counts the whole cart', () => {
  // Every ordinary code behaves exactly as it did before this change.
  const openCode = { code: 'WELCOME10', min_units: 5, discount_pct: 0.1, target_product: null };
  const cart = [
    { product: 'SS-31 25mg', qty: 2 },
    { product: 'GLP-1 5mg', qty: 3 },
  ];
  assert.equal(countPromoEligibleUnits(openCode, cart), 5);
  assert.equal(checkUnitLimits(openCode, countPromoEligibleUnits(openCode, cart)).ok, true);
});

test('order lines are counted whether they name the product or the item', () => {
  // The storefront cart uses `product`; admin order items arrive as `name`.
  assert.equal(countPromoEligibleUnits(CELLULAR40, [{ name: 'SS-31 25mg', qty: 5 }]), 5);
  assert.equal(countPromoEligibleUnits(CELLULAR40, [{ name: 'GLP-1 5mg', qty: 5 }]), 0);
});

test('quantity is read from either qty or quantity, and rubbish counts as none', () => {
  assert.equal(countPromoEligibleUnits(CELLULAR40, [{ product: 'NAD+ 500mg', quantity: 6 }]), 6);
  assert.equal(countPromoEligibleUnits(CELLULAR40, [{ product: 'NAD+ 500mg', qty: 'x' }]), 0);
});

test('a maximum is scoped to the covered products too', () => {
  // The mirror case: a capped intro code must not be pushed over its cap by
  // products it never discounted.
  const capped = { code: 'FIRST4', max_units: 4, discount_pct: 0.15, target_product: 'SS-31' };
  const cart = [
    { product: 'SS-31 25mg', qty: 4 },
    { product: 'GLP-1 5mg', qty: 9 },
  ];
  assert.equal(countPromoEligibleUnits(capped, cart), 4);
  assert.equal(checkUnitLimits(capped, countPromoEligibleUnits(capped, cart)).ok, true);
});

test('an empty or missing cart is zero, not a crash', () => {
  assert.equal(countPromoEligibleUnits(CELLULAR40, []), 0);
  assert.equal(countPromoEligibleUnits(CELLULAR40, undefined), 0);
  assert.equal(countPromoEligibleUnits(null, [{ product: 'SS-31 25mg', qty: 2 }]), 2);
});
