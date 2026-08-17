import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReorderLines,
  isGiftLine,
  mergeReorderIntoCart,
  reorderNoticeMessage,
  stripGiftSuffix,
} from '../src/lib/reorderCart.mjs';

const PRODUCTS = [
  { product: 'Retatrutide 10mg', priceUsd: 135, status: 'In Stock' },
  { product: 'BPC-157 5mg', priceUsd: 60, status: 'In Stock' },
  { product: 'Tirzepatide 10mg', priceUsd: 120, status: 'Out of Stock' },
  { product: 'Bacteriostatic Water 3ml', priceUsd: 10, status: 'In Stock' },
];

test('a reorder carries quantities but never the old price', () => {
  // The order was placed when Retatrutide was $125. The rebuilt line must hand
  // back the live product row so today's $135 is what gets charged.
  const order = { items: [{ product: 'Retatrutide 10mg', qty: 2, price: 125 }] };

  const { lines } = buildReorderLines(order.items, PRODUCTS);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 2);
  assert.equal(lines[0].product.priceUsd, 135);
  assert.equal(Object.hasOwn(lines[0], 'price'), false);
});

test('granted BAC water is re-earned, not copied', () => {
  const items = [
    { product: 'BPC-157 5mg', qty: 1, price: 60 },
    { product: 'Bacteriostatic Water 3ml (Free Gift)', qty: 1, price: 0 },
    { product: 'Agua Bacteriostática 3ml (Regalo)', qty: 1, price: 0 },
  ];

  const { lines } = buildReorderLines(items, PRODUCTS);

  assert.deepEqual(lines.map((l) => l.product.product), ['BPC-157 5mg']);
});

test('older gift lines without the suffix are still recognised', () => {
  assert.equal(isGiftLine({ product: 'Bacteriostatic Water 3ml', qty: 1, price: 0 }), true);
  // A zero-priced peptide is a promotion, not a BAC grant — keep it.
  assert.equal(isGiftLine({ product: 'BPC-157 5mg', qty: 1, price: 0 }), false);
  assert.equal(stripGiftSuffix('Bacteriostatic Water 3ml (Free Gift)'), 'Bacteriostatic Water 3ml');
  assert.equal(stripGiftSuffix('Agua Bacteriostática 3ml (Regalo)'), 'Agua Bacteriostática 3ml');
});

test('paid BAC water is carried over', () => {
  const items = [{ product: 'Bacteriostatic Water 3ml', qty: 3, price: 10 }];

  const { lines } = buildReorderLines(items, PRODUCTS);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 3);
});

test('sold-out and discontinued lines are reported, not silently dropped', () => {
  const items = [
    { product: 'Retatrutide 10mg', qty: 1, price: 125 },
    { product: 'Tirzepatide 10mg', qty: 1, price: 120 },
    { product: 'Discontinued Peptide 2mg', qty: 1, price: 90 },
  ];

  const result = buildReorderLines(items, PRODUCTS);

  assert.deepEqual(result.lines.map((l) => l.product.product), ['Retatrutide 10mg']);
  assert.deepEqual(result.unavailable, ['Tirzepatide 10mg']);
  assert.deepEqual(result.missing, ['Discontinued Peptide 2mg']);

  assert.match(reorderNoticeMessage(result, 'en'), /no longer available/);
  assert.match(reorderNoticeMessage(result, 'es'), /ya no están disponibles/);
  assert.match(reorderNoticeMessage(result, 'en'), /Tirzepatide 10mg, Discontinued Peptide 2mg/);
  assert.equal(reorderNoticeMessage({ unavailable: [], missing: [] }, 'en'), '');
});

test('product names match despite casing and spacing drift', () => {
  const { lines } = buildReorderLines([{ product: '  retatrutide   10MG ', qty: 1, price: 1 }], PRODUCTS);
  assert.equal(lines[0].product.product, 'Retatrutide 10mg');
});

test('a product listed twice becomes one line', () => {
  const items = [
    { product: 'BPC-157 5mg', qty: 1, price: 60 },
    { product: 'BPC-157 5mg', qty: 2, price: 60 },
  ];

  const { lines } = buildReorderLines(items, PRODUCTS);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 3);
});

test('reordering mid-shop tops up the cart instead of resetting it', () => {
  const cart = [{ product: 'BPC-157 5mg', priceUsd: 60, qty: 1 }];
  const { lines } = buildReorderLines(
    [
      { product: 'BPC-157 5mg', qty: 2, price: 55 },
      { product: 'Retatrutide 10mg', qty: 1, price: 125 },
    ],
    PRODUCTS,
  );

  const merged = mergeReorderIntoCart(cart, lines);

  assert.equal(merged.length, 2);
  assert.equal(merged.find((i) => i.product === 'BPC-157 5mg').qty, 3);
  assert.equal(merged.find((i) => i.product === 'Retatrutide 10mg').qty, 1);
  // The original cart array is left untouched.
  assert.equal(cart[0].qty, 1);
});

test('a malformed quantity falls back to one rather than zero or NaN', () => {
  const { lines } = buildReorderLines(
    [{ product: 'BPC-157 5mg', qty: 'many', price: 60 }],
    PRODUCTS,
  );
  assert.equal(lines[0].qty, 1);
});

test('an empty order produces an empty cart', () => {
  assert.deepEqual(buildReorderLines([], PRODUCTS), { lines: [], unavailable: [], missing: [] });
  assert.deepEqual(buildReorderLines(null, PRODUCTS).lines, []);
});
