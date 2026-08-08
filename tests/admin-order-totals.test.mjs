import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAdminOrderTotals,
  getAdminVolumeDiscountPct,
} from '../src/lib/adminOrderTotals.mjs';

test('admin totals exclude gifted BAC water from volume discount tiers', () => {
  const items = [
    { product: 'BPC-157 + TB-500 20mg (Wolverine Stack)', qty: 2, price: 68161 },
    { product: 'Ipamorelin 10mg', qty: 3, price: 45441 },
    { product: 'Agua Bacteriostática 3ml (Regalo)', qty: 5, price: 0 },
  ];

  const totals = calculateAdminOrderTotals(items, 0);

  assert.equal(totals.itemsSubtotal, 272645);
  assert.equal(getAdminVolumeDiscountPct(items), 15);
  assert.equal(totals.discountPct, 15);
  assert.equal(Math.round(totals.discountAmount), 40897);
  assert.equal(Math.round(totals.total), 231748);
});

test('paid BAC water is billed but not discounted', () => {
  const items = [
    { product: 'Semaglutide 5mg', qty: 5, price: 100 },
    { product: 'BAC Water 3ml', qty: 2, price: 10 },
  ];

  const totals = calculateAdminOrderTotals(items, 0);

  assert.equal(totals.discountPct, 15);
  assert.equal(totals.discountAmount, 75);
  assert.equal(totals.total, 445);
});
