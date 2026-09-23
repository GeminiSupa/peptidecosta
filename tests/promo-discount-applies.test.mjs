import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOrderTotals } from '../src/lib/pricing.js';
import { authoritativeCheckout } from '../src/lib/authoritativeCheckout.mjs';

const products = [
  { id: '1', product: 'GHK-CU 50mg', price_usd: '$70', price_crc: '31407', status: 'In Stock', inventory_count: 18 },
  { id: '2', product: 'BAC Water 3ml', price_usd: '$10', price_crc: '4487', status: 'In Stock', inventory_count: 99 },
];

const checkout = (items, promo, currency = 'USD') => authoritativeCheckout({
  postedOrder: { currency, items, lang: 'en' },
  products,
  exchangeRate: 448.67,
  dealOffers: null,
  promo,
});

const tenPct = { code: 'TEST10', discount_pct: 0.10, target_product: null };

test('computeOrderTotals reports the merchandise subtotal a promo discounts', () => {
  const totals = computeOrderTotals(
    [{ unitPrice: 70, qty: 2, product: 'GHK-CU 50mg' }, { unitPrice: 10, qty: 1, product: 'BAC Water 3ml' }],
    'USD',
    448.67,
    { volumeDiscountPct: 0 },
  );
  // Without this field promoDiscountAmount read `undefined`, which rounded to
  // zero and silently cancelled every promo code.
  assert.equal(totals.discountableSubtotal, 140);
});

test('a promo code actually comes off the total', () => {
  const result = checkout([{ product: 'GHK-CU 50mg', qty: 1 }], tenPct);
  assert.equal(result.promoDiscount, 7);
  assert.equal(result.total, 70 - 7 + result.shipping);
});

test('a promo code scales with quantity', () => {
  assert.equal(checkout([{ product: 'GHK-CU 50mg', qty: 3 }], tenPct).promoDiscount, 21);
});

test('a promo code does not discount BAC water', () => {
  const result = checkout([{ product: 'GHK-CU 50mg', qty: 1 }, { product: 'BAC Water 3ml', qty: 2 }], tenPct);
  assert.equal(result.promoDiscount, 7);
});

test('no promo code means no promo discount', () => {
  assert.equal(checkout([{ product: 'GHK-CU 50mg', qty: 1 }], null).promoDiscount, 0);
});

test('a promo code works in colones too', () => {
  const result = checkout([{ product: 'GHK-CU 50mg', qty: 1 }], tenPct, 'CRC');
  assert.equal(result.promoDiscount, Math.round(31407 * 0.10));
});
