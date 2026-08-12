import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAdminOrderTotals,
  calculateManualDiscountAmount,
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

test('manual percentage discount applies after volume and promo discounts, before shipping', () => {
  const totals = calculateAdminOrderTotals(
    [{ product: 'BPC-157', qty: 5, price: 100 }],
    25,
    {
      promoDiscountAmount: 25,
      manualDiscountType: 'percentage',
      manualDiscountValue: 10,
    }
  );

  assert.equal(totals.discountAmount, 75);
  assert.equal(totals.promoDiscountAmount, 25);
  assert.equal(totals.subtotalAfterPromo, 400);
  assert.equal(totals.manualDiscountAmount, 40);
  assert.equal(totals.total, 385);
});

test('fixed manual discount cannot make merchandise negative or discount shipping', () => {
  const totals = calculateAdminOrderTotals(
    [{ product: 'BPC-157', qty: 1, price: 100 }],
    20,
    { manualDiscountType: 'fixed', manualDiscountValue: 999 }
  );

  assert.equal(totals.manualDiscountAmount, 100);
  assert.equal(totals.total, 20);
});

test('manual discount helper rejects invalid and over-100 percentage input safely', () => {
  assert.equal(calculateManualDiscountAmount(100, 'percentage', 250), 100);
  assert.equal(calculateManualDiscountAmount(100, 'fixed', -5), 0);
  assert.equal(calculateManualDiscountAmount(100, 'unknown', 20), 0);
});
