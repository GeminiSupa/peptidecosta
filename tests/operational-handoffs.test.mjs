import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryReservationPlan } from '../src/lib/orderInventoryServer.js';
import { planPayoutSettlement } from '../src/lib/payoutSettlement.mjs';

test('inventory edits reserve only the net change and include free gift stock', () => {
  const plan = inventoryReservationPlan(
    [{ product: 'BPC-157 5mg', qty: 1 }, { product: 'Bacteriostatic Water 3ml (FREE GIFT)', qty: 1 }],
    [{ product: 'BPC-157 5mg', qty: 2 }, { product: 'Bacteriostatic Water 3ml (FREE GIFT)', qty: 2 }],
    [
      { product: 'BPC-157 5mg', inventory_count: 9, low_stock_threshold: 3 },
      { product: 'Bacteriostatic Water 3ml', inventory_count: 19, low_stock_threshold: 5 },
    ],
  );
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.changes.map(({ product, before, after }) => ({ product, before, after })), [
    { product: 'BPC-157 5mg', before: 9, after: 8 },
    { product: 'Bacteriostatic Water 3ml', before: 19, after: 18 },
  ]);
  assert.deepEqual(plan.reservations, [
    { product: 'BPC-157 5mg', qty: 2 },
    { product: 'Bacteriostatic Water 3ml', qty: 2 },
  ]);
});

test('inventory edit refuses quantities above stock plus the order current reservation', () => {
  const plan = inventoryReservationPlan(
    [{ product: 'BPC-157 5mg', qty: 2 }],
    [{ product: 'BPC-157 5mg', qty: 5 }],
    [{ product: 'BPC-157 5mg', inventory_count: 2, low_stock_threshold: 3 }],
  );
  assert.equal(plan.ok, false);
  assert.match(plan.error, /only 4 available/);
});

test('a payout cannot be marked paid without method and reference', () => {
  assert.equal(planPayoutSettlement('Approved', { status: 'Paid' }).ok, false);
  assert.equal(planPayoutSettlement('Approved', {
    status: 'Paid', paymentMethod: 'SINPE', paymentReference: 'TX-123', recordedBy: 'owner@example.com',
  }, new Date('2026-08-24T12:00:00Z')).ok, true);
});

test('paid payouts are immutable and failed payouts require a reason', () => {
  assert.equal(planPayoutSettlement('Paid', { status: 'Failed', failureReason: 'reversed' }).status, 409);
  assert.equal(planPayoutSettlement('Approved', { status: 'Failed' }).status, 400);
});
