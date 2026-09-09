import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkUnitLimits,
  countCartUnits,
  countPromoEligibleUnits,
  effectiveVolumeDiscountPct,
  promoTargetLabel,
  replacesVolumeDiscount,
  unitLimitsMessage,
} from '../src/lib/promoEligibility.mjs';
import { promoTargetsProduct } from '../src/lib/promoBadge.mjs';

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
  // Retatrutide. Five vials, but only four the sale covers, and the fifth was
  // enough to hand over 40% on the other $1,500.
  const cart = [
    { product: 'SS-31 25mg', qty: 3 },
    { product: 'Mots-C 40mg', qty: 1 },
    { product: 'Retatrutide 5mg', qty: 1 },
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
  const cart = [{ product: 'Retatrutide 5mg', qty: 40 }];
  assert.equal(countPromoEligibleUnits(CELLULAR40, cart), 0);
  assert.equal(checkUnitLimits(CELLULAR40, countPromoEligibleUnits(CELLULAR40, cart)).ok, false);
});

test('an untargeted code still counts the whole cart', () => {
  // Every ordinary code behaves exactly as it did before this change.
  const openCode = { code: 'WELCOME10', min_units: 5, discount_pct: 0.1, target_product: null };
  const cart = [
    { product: 'SS-31 25mg', qty: 2 },
    { product: 'Retatrutide 5mg', qty: 3 },
  ];
  assert.equal(countPromoEligibleUnits(openCode, cart), 5);
  assert.equal(checkUnitLimits(openCode, countPromoEligibleUnits(openCode, cart)).ok, true);
});

test('order lines are counted whether they name the product or the item', () => {
  // The storefront cart uses `product`; admin order items arrive as `name`.
  assert.equal(countPromoEligibleUnits(CELLULAR40, [{ name: 'SS-31 25mg', qty: 5 }]), 5);
  assert.equal(countPromoEligibleUnits(CELLULAR40, [{ name: 'Retatrutide 5mg', qty: 5 }]), 0);
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
    { product: 'Retatrutide 5mg', qty: 9 },
  ];
  assert.equal(countPromoEligibleUnits(capped, cart), 4);
  assert.equal(checkUnitLimits(capped, countPromoEligibleUnits(capped, cart)).ok, true);
});

test('an empty or missing cart is zero, not a crash', () => {
  assert.equal(countPromoEligibleUnits(CELLULAR40, []), 0);
  assert.equal(countPromoEligibleUnits(CELLULAR40, undefined), 0);
  assert.equal(countPromoEligibleUnits(null, [{ product: 'SS-31 25mg', qty: 2 }]), 2);
});

// --- What the customer is told, and what they are charged -----------------
// One order earns one kind of discount. A basket mixing sale and non-sale
// products takes the sale rate on the sale products and nothing on the rest,
// and the wording has to say so or the cart looks like it shortchanged them.

test('a mixed basket discounts the sale products and leaves the rest alone', () => {
  // Five covered vials plus two the code does not touch: the code unlocks, and
  // the two are still full price.
  const cart = [
    { product: 'SS-31 25mg', qty: 3, price: 450 },
    { product: 'NAD+ 500mg', qty: 2, price: 90 },
    { product: 'Retatrutide 5mg', qty: 2, price: 100 },
  ];

  assert.equal(countPromoEligibleUnits(CELLULAR40, cart), 5, 'only the covered vials count');
  assert.equal(checkUnitLimits(CELLULAR40, countPromoEligibleUnits(CELLULAR40, cart)).ok, true);

  // The discount base is the covered lines only.
  const covered = cart.filter((item) => promoTargetsProduct(CELLULAR40, item.product));
  const base = covered.reduce((sum, item) => sum + item.price * item.qty, 0);
  assert.equal(base, 1530, '3x450 + 2x90, with the Retatrutide left out');
  assert.equal(Number((base * CELLULAR40.discount_pct).toFixed(2)), 612);
});

test('the shortfall message names the products instead of just a number', () => {
  // Five vials of something else used to be told "you need 5 units", which
  // reads as a broken cart to someone holding exactly five.
  const cart = [{ product: 'Retatrutide 5mg', qty: 5 }];
  const units = countPromoEligibleUnits(CELLULAR40, cart);

  const es = unitLimitsMessage(CELLULAR40, units, 'es');
  assert.match(es, /MOTS-C/);
  assert.match(es, /NAD\+/);
  assert.match(es, /SS-31/);
  assert.match(es, /solo/, 'says the code is limited to them');

  const en = unitLimitsMessage(CELLULAR40, units, 'en');
  assert.match(en, /only/);
  assert.match(en, /MOTS-C, NAD\+ and SS-31/);
});

test('an untargeted code keeps its plain wording', () => {
  const openCode = { code: 'WELCOME10', min_units: 5, discount_pct: 0.1, target_product: null };
  const message = unitLimitsMessage(openCode, 2, 'en');
  assert.match(message, /5 units or more/);
  assert.equal(promoTargetLabel(openCode, 'en'), null);
});

test('the target list is worded, not dumped', () => {
  assert.equal(promoTargetLabel(CELLULAR40, 'en'), 'MOTS-C, NAD+ and SS-31');
  assert.equal(promoTargetLabel(CELLULAR40, 'es'), 'MOTS-C, NAD+ y SS-31');
  assert.equal(promoTargetLabel({ target_product: 'SS-31' }, 'en'), 'SS-31');
});

test('one order earns one kind of discount, never both', () => {
  // A code with a unit minimum is a negotiated bulk deal, so it REPLACES the
  // automatic volume tier rather than compounding with it. Two 40%s on one
  // basket is the giveaway this guards against.
  assert.equal(replacesVolumeDiscount(CELLULAR40), true);
  assert.equal(effectiveVolumeDiscountPct(CELLULAR40, 20), 0, 'the volume tier steps aside');
  assert.equal(effectiveVolumeDiscountPct(CELLULAR40, 35), 0);

  // An ordinary code has no minimum, so the volume tier still applies.
  const openCode = { code: 'WELCOME10', discount_pct: 0.1 };
  assert.equal(replacesVolumeDiscount(openCode), false);
  assert.equal(effectiveVolumeDiscountPct(openCode, 20), 20);
});
