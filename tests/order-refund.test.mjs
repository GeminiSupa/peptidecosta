// Refund arithmetic.
//
// The rule Omer asked for first: a customer who paid $50 can never end up with
// $100 refunded, or $20 refunded twice adding to more than they paid. That
// cannot be a check on one refund — an order can be refunded more than once —
// so every test here pushes at the running total rather than a single event.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ORDER_STATUS_PARTLY_REFUNDED,
  ORDER_STATUS_REFUNDED,
  applyCommissionAdjustments,
  commissionClawback,
  isRefundStatus,
  orderCanBeRefunded,
  planRefund,
  refundableRemaining,
} from '../src/lib/orderRefund.mjs';

const paidOrder = (over = {}) => ({
  order_number: 'WPCR-1',
  status: 'Paid',
  currency: 'USD',
  total_usd: 100,
  total_crc: 45000,
  refunded_amount_usd: 0,
  refunded_amount_crc: 0,
  ...over,
});

// --- the guard Omer asked for ------------------------------------------------

test('a full refund settles the order as Refunded', () => {
  const plan = planRefund(paidOrder(), { amount: 100 });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, ORDER_STATUS_REFUNDED);
  assert.equal(plan.refundUsd, 100);
  assert.equal(plan.keptUsd, 0);
});

test('a smaller refund leaves the order Partly Refunded', () => {
  const plan = planRefund(paidOrder(), { amount: 30 });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, ORDER_STATUS_PARTLY_REFUNDED);
  assert.equal(plan.refundUsd, 30);
  assert.equal(plan.keptUsd, 70, 'the customer keeps 70');
});

test('refunding more than was paid is refused', () => {
  const plan = planRefund(paidOrder(), { amount: 150 });
  assert.equal(plan.ok, false);
  assert.equal(plan.status, 400);
  assert.match(plan.error, /most you can refund is \$100\.00/);
});

test('two refunds cannot add up to more than was paid', () => {
  // $60 already given back on a $100 order; asking for $50 more.
  const order = paidOrder({ refunded_amount_usd: 60, refunded_amount_crc: 27000, status: ORDER_STATUS_PARTLY_REFUNDED });
  const plan = planRefund(order, { amount: 50 });

  assert.equal(plan.ok, false);
  assert.match(plan.error, /Only \$40\.00 is left/);
  assert.match(plan.error, /\$60\.00 of the \$100\.00 paid/);
});

test('a second refund that exactly finishes the order is allowed', () => {
  const order = paidOrder({ refunded_amount_usd: 60, refunded_amount_crc: 27000, status: ORDER_STATUS_PARTLY_REFUNDED });
  const plan = planRefund(order, { amount: 40 });

  assert.equal(plan.ok, true);
  assert.equal(plan.totalRefundedUsd, 100);
  assert.equal(plan.status, ORDER_STATUS_REFUNDED);
  assert.equal(plan.keptUsd, 0);
});

test('a fully refunded order cannot be refunded again', () => {
  const order = paidOrder({ status: ORDER_STATUS_REFUNDED, refunded_amount_usd: 100, refunded_amount_crc: 45000 });
  assert.equal(orderCanBeRefunded(order), false);
  assert.equal(planRefund(order, { amount: 1 }).ok, false);
});

test('zero and nonsense amounts are refused', () => {
  for (const amount of [0, -5, 'abc', null, undefined, NaN]) {
    assert.equal(planRefund(paidOrder(), { amount }).ok, false, `${amount} must be refused`);
  }
});

// --- only real money can be given back ---------------------------------------

test('an unpaid or declined order has nothing to refund', () => {
  for (const status of ['Pending', 'Pending - Card', 'Declined', 'Error', 'Cancelled']) {
    const plan = planRefund(paidOrder({ status }), { amount: 10 });
    assert.equal(plan.ok, false, `${status} must not be refundable`);
    assert.equal(plan.status, 409);
  }
});

test('a completed order can still be refunded', () => {
  assert.equal(orderCanBeRefunded(paidOrder({ status: 'Order Complete' })), true);
  assert.equal(planRefund(paidOrder({ status: 'Order Complete' }), { amount: 10 }).ok, true);
});

// --- both currencies move together -------------------------------------------

test('refunding a colon order moves both currencies in step', () => {
  const order = paidOrder({ currency: 'CRC', total_usd: 100, total_crc: 45000 });
  const plan = planRefund(order, { amount: 22500 }); // half

  assert.equal(plan.ok, true);
  assert.equal(plan.refundCrc, 22500);
  assert.equal(plan.refundUsd, 50, 'the USD figure follows the same share');
  assert.equal(plan.status, ORDER_STATUS_PARTLY_REFUNDED);
});

test('a full colon refund is not filed as partial by a rounding cent', () => {
  // total_usd on a colon order is a conversion, so it rarely divides evenly.
  const order = paidOrder({ currency: 'CRC', total_usd: 130.38, total_crc: 59253 });
  const plan = planRefund(order, { amount: 59253 });

  assert.equal(plan.status, ORDER_STATUS_REFUNDED);
  assert.equal(plan.keptCrc, 0);
});

test('what is left to refund is never negative', () => {
  const over = paidOrder({ refunded_amount_usd: 150, refunded_amount_crc: 70000 });
  const remaining = refundableRemaining(over);
  assert.equal(remaining.usd, 0);
  assert.equal(remaining.crc, 0);
});

test('both refund statuses are recognised whatever the casing', () => {
  assert.equal(isRefundStatus('Refunded'), true);
  assert.equal(isRefundStatus('partly refunded'), true);
  assert.equal(isRefundStatus('Paid'), false);
});

// --- commission -------------------------------------------------------------

test('an agent not yet paid owes nothing back', () => {
  const plan = planRefund(paidOrder(), { amount: 100 });
  const owed = commissionClawback(plan, { rate: 10, alreadyPaid: false });
  assert.deepEqual(owed, { owedUsd: 0, owedCrc: 0 });
});

test('an agent already paid owes commission on the refunded part only', () => {
  const plan = planRefund(paidOrder(), { amount: 30 });
  const owed = commissionClawback(plan, { rate: 10, alreadyPaid: true });

  // 10% of the $30 given back — not of the $100 order.
  assert.equal(owed.owedUsd, 3);
});

test('a full refund claws back the whole commission', () => {
  const plan = planRefund(paidOrder(), { amount: 100 });
  const owed = commissionClawback(plan, { rate: 10, alreadyPaid: true });
  assert.equal(owed.owedUsd, 10);
});

// --- the payslip never goes negative -----------------------------------------

const debt = (over = {}) => ({
  id: 'd1', order_number: 'WPCR-1', amount_usd: 0, amount_crc: 0,
  applied_usd: 0, applied_crc: 0, created_at: '2026-08-01', ...over,
});

test('a debt smaller than the week is taken in full', () => {
  const out = applyCommissionAdjustments(200, 90000, [debt({ amount_usd: 50, amount_crc: 22500 })]);

  assert.equal(out.deductedUsd, 50);
  assert.equal(out.payableUsd, 150);
  assert.equal(out.carriedUsd, 0);
  assert.equal(out.applied[0].settles, true);
});

test('a debt bigger than the week pays zero and carries the rest', () => {
  // Omer's rule: earn 40, owe 100 -> paid 0 this week, 60 waits.
  const out = applyCommissionAdjustments(40, 18000, [debt({ amount_usd: 100, amount_crc: 45000 })]);

  assert.equal(out.deductedUsd, 40);
  assert.equal(out.payableUsd, 0, 'never a negative payslip');
  assert.equal(out.carriedUsd, 60);
  assert.equal(out.applied[0].settles, false);
});

test('a week with no earnings still cannot go negative', () => {
  const out = applyCommissionAdjustments(0, 0, [debt({ amount_usd: 100, amount_crc: 45000 })]);

  assert.equal(out.payableUsd, 0);
  assert.equal(out.deductedUsd, 0);
  assert.equal(out.carriedUsd, 100, 'the whole debt waits for a week that can pay it');
});

test('the oldest debt is recovered first', () => {
  const out = applyCommissionAdjustments(50, 22500, [
    debt({ id: 'new', order_number: 'B', amount_usd: 40, amount_crc: 18000, created_at: '2026-08-10' }),
    debt({ id: 'old', order_number: 'A', amount_usd: 40, amount_crc: 18000, created_at: '2026-08-01' }),
  ]);

  assert.equal(out.applied[0].order_number, 'A', 'the older debt is settled first');
  assert.equal(out.applied[0].settles, true);
  assert.equal(out.applied[1].order_number, 'B');
  assert.equal(out.applied[1].settles, false);
  assert.equal(out.payableUsd, 0);
  assert.equal(out.carriedUsd, 30);
});

test('a partly recovered debt only carries what is left', () => {
  const out = applyCommissionAdjustments(30, 13500, [
    debt({ amount_usd: 100, amount_crc: 45000, applied_usd: 60, applied_crc: 27000 }),
  ]);

  // 40 still owed, 30 recovered, 10 carried.
  assert.equal(out.deductedUsd, 30);
  assert.equal(out.carriedUsd, 10);
  assert.equal(out.payableUsd, 0);
});

test('settled debts are skipped', () => {
  const out = applyCommissionAdjustments(100, 45000, [
    debt({ amount_usd: 50, amount_crc: 22500, applied_usd: 50, applied_crc: 22500 }),
  ]);

  assert.equal(out.deductedUsd, 0);
  assert.equal(out.payableUsd, 100);
  assert.equal(out.applied.length, 0);
});

test('no debts leaves the pay untouched', () => {
  const out = applyCommissionAdjustments(123.45, 56000, []);
  assert.equal(out.payableUsd, 123.45);
  assert.equal(out.payableCrc, 56000);
  assert.equal(out.applied.length, 0);
});
