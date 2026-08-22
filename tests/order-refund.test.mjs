// Refund arithmetic.
//
// The rule Omer asked for first: a customer who paid $50 can never end up with
// $100 refunded, or $20 refunded twice adding to more than they paid. That
// cannot be a check on one refund — an order can be refunded more than once —
// so every test here pushes at the running total rather than a single event.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  ORDER_STATUS_PARTLY_REFUNDED,
  ORDER_STATUS_REFUNDED,
  applyCommissionAdjustments,
  commissionClawback,
  isRefundStatus,
  orderCanBeRefunded,
  planRefund,
  refundEmailMessage,
  refundableRemaining,
  summarizeRefundEmails,
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

// --- what can be refunded, and what the panel must not silently accept -------

test('an order being prepared can still be refunded', () => {
  // "Processing" is money in, parcel not yet gone: the likeliest moment for a
  // customer to change their mind. isPaidLike misses it because the word holds
  // neither "paid" nor "complete", so it is allowed explicitly.
  assert.equal(orderCanBeRefunded(paidOrder({ status: 'Processing' })), true);
  assert.equal(planRefund(paidOrder({ status: 'Processing' }), { amount: 10 }).ok, true);
});

test('every settled status the panel writes can be refunded', () => {
  for (const status of ['Paid', 'Processing', 'Order Complete', 'Completed']) {
    assert.equal(orderCanBeRefunded(paidOrder({ status })), true, `${status} should be refundable`);
  }
});

test('the status dropdown cannot write a refund status', () => {
  const route = fs.readFileSync('src/app/api/admin/orders/update/route.js', 'utf8');
  // Setting the label without the amount check would leave an order reading
  // "Refunded" with nothing refunded on it, which the agent's pay is based on.
  assert.match(route, /if \(patch\.status && isRefundStatus\(patch\.status\)\)/);
  assert.match(route, /Refund box/);
});

test('a rejected status change is put back on screen, not left showing', () => {
  const page = fs.readFileSync('src/app/admin/page.js', 'utf8');
  const handler = page.slice(
    page.indexOf('const handleOrderStatusUpdate'),
    page.indexOf('const handleOrderStatusUpdate') + 3000,
  );

  // The row is changed optimistically before the server is asked. Without a
  // rollback the panel showed "Refunded" on an order the server had refused,
  // with the only clue in the browser console.
  assert.match(handler, /prevOrder\?\.status/, 'the previous status must be restored');
  assert.match(handler, /alert\(data\.error/, 'the server reason must be shown');
});

test('picking Refunded opens the confirmation instead of saving a status', () => {
  const manager = fs.readFileSync('src/components/admin/OrdersManager.js', 'utf8');
  const page = fs.readFileSync('src/app/admin/page.js', 'utf8');

  // It IS offered — the dropdown is where a person looks for it.
  const options = manager.slice(
    manager.indexOf('const ORDER_STATUS_OPTIONS'),
    manager.indexOf('];', manager.indexOf('const ORDER_STATUS_OPTIONS')),
  );
  assert.ok(options.includes("'Refunded'"), 'Refunded should be offered in the list');

  // But choosing it must open the dialog and return, never fall through to the
  // PATCH — that would write the label with nothing refunded behind it.
  const handler = page.slice(
    page.indexOf('const handleOrderStatusUpdate'),
    page.indexOf('const handleOrderStatusUpdate') + 1200,
  );
  assert.match(handler, /if \(isRefundStatus\(newStatus\)\)/);
  assert.match(handler, /setRefundOrder\(prevOrder\)/);

  // "Partly Refunded" is an outcome of the dialog, not something to pick.
  assert.ok(!options.includes("'Partly Refunded'"));
});

test('both entry points open the same dialog', () => {
  const page = fs.readFileSync('src/app/admin/page.js', 'utf8');
  const panel = fs.readFileSync('src/components/admin/OrderDetailPanel.js', 'utf8');

  assert.match(page, /<RefundDialog/, 'the dialog is rendered once, at page level');
  assert.match(page, /onRequestRefund=\{setRefundOrder\}/, 'the panel feeds the same state');
  assert.match(panel, /onRequestRefund\?\.\(order\)/, 'the panel button opens it rather than its own form');
  assert.ok(!panel.includes('submitRefund'), 'the panel must not keep a second refund form');
});

// Reporting the emails
//
// The route reports each send as sent, failed, or skipped — and skipped covers
// two situations that must never be worded the same way. Omer hit this the
// other way round first: told "the customer email did not send" for an order
// that simply never had an email address on it, and reasonably read that as the
// refund emails being broken again.

test('an order with no customer email is not reported as a failure', () => {
  const message = refundEmailMessage({
    customer: { sent: false, skipped: 'no recipient' },
    team: { sent: true },
    accountant: { sent: true },
  });

  assert.ok(!/failed|did not send/i.test(message), 'nothing broke, so nothing may say it did');
  assert.match(message, /no customer email address/i, 'but it must still be said');
  assert.match(message, /NOT been told/, 'because someone has to tell them by hand');
  assert.match(message, /Emailed the team \(agent copied\) and the accountant\./);
});

test('a genuine send failure is still reported as one', () => {
  const message = refundEmailMessage({
    customer: { sent: false, error: 'connection refused' },
    team: { sent: true },
    accountant: { sent: true },
  });

  assert.match(message, /WARNING/, 'a real failure has to be loud');
  assert.match(message, /the email to the customer failed to send/);
});

test('SMTP being down is never reported as everyone having been emailed', () => {
  const down = { sent: false, skipped: 'no transport' };
  const message = refundEmailMessage({ customer: down, team: down, accountant: down });

  assert.match(message, /WARNING/);
  assert.match(message, /no refund emails went out at all/);
  assert.ok(!/^Emailed/m.test(message), 'claiming a send here would be a lie');
});

test('the ordinary case names everyone once, and the agent with the team', () => {
  const message = refundEmailMessage({
    customer: { sent: true },
    team: { sent: true },
    accountant: { sent: true },
  });

  assert.equal(message, 'Emailed the customer, the team (agent copied) and the accountant.');
});

test('the three groups are split by why, not lumped together', () => {
  const summary = summarizeRefundEmails({
    customer: { sent: false, skipped: 'no recipient' },
    team: { sent: true },
    accountant: { sent: false, error: 'boom' },
  });

  assert.deepEqual(summary.sent, ['team']);
  assert.deepEqual(summary.failed, ['accountant']);
  assert.deepEqual(summary.noAddress, ['customer']);
  assert.equal(summary.mailerDown, false);
});

test('the popup asks the shared lib rather than counting failures itself', () => {
  const dialog = fs.readFileSync('src/components/admin/RefundDialog.js', 'utf8');

  assert.match(dialog, /refundEmailMessage\(data\.emails\)/);
  // The bug was a hand-rolled filter here that had lost its skipped check.
  assert.ok(!dialog.includes('sent === false'), 'no second, weaker copy of the rule');
});
