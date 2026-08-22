// What an order is worth once refunds come off.
//
// Nine screens report money. Before this they each did their own arithmetic and
// disagreed: a $100 order with $30 refunded read as $100 on the Today tiles,
// vanished entirely from the analytics chart, and still counted as $100 spent
// against the customer — enough to tag them VIP. These tests pin the one rule
// they now all share, and the edge cases that rule has to survive.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  REVENUE_ORDER_STATUSES,
  orderCountsAsSale,
  orderNetRevenue,
  orderNetRevenueUsd,
  orderRefundEvents,
  refundedInRange,
  totalNetRevenue,
} from '../src/lib/orderRevenue.mjs';
import { isSuccessfulAnalyticsOrder, revenueTrendRows } from '../src/lib/analyticsDashboard.mjs';

const order = (over = {}) => ({
  status: 'Paid',
  total_usd: 100,
  total_crc: 50000,
  created_at: '2026-08-01T12:00:00Z',
  ...over,
});

// --------------------------------------------------------------- the core sum

test('an order with no refund is worth what was paid', () => {
  assert.deepEqual(orderNetRevenue(order()), { usd: 100, crc: 50000 });
});

test('a partly refunded order is worth what the customer kept', () => {
  const partly = order({
    status: 'Partly Refunded',
    refunded_amount_usd: 30,
    refunded_amount_crc: 15000,
  });

  assert.deepEqual(orderNetRevenue(partly), { usd: 70, crc: 35000 });
});

test('a fully refunded order is worth nothing', () => {
  const full = order({
    status: 'Refunded',
    refunded_amount_usd: 100,
    refunded_amount_crc: 50000,
  });

  assert.deepEqual(orderNetRevenue(full), { usd: 0, crc: 0 });
});

test('a refunded order is worth nothing even with no amount recorded', () => {
  // An order marked Refunded by hand, or before the refund columns existed,
  // carries no refunded_amount. Subtraction alone would report the whole sale
  // as money still in the business.
  const handEdited = order({ status: 'Refunded' });

  assert.deepEqual(orderNetRevenue(handEdited), { usd: 0, crc: 0 });
  assert.equal(orderCountsAsSale(handEdited), false);
});

test('an over-refund reads as nothing left, never as a negative sale', () => {
  const over = order({
    status: 'Partly Refunded',
    refunded_amount_usd: 150,
    refunded_amount_crc: 90000,
  });

  assert.deepEqual(orderNetRevenue(over), { usd: 0, crc: 0 });
});

test('orders that never became money are worth nothing', () => {
  for (const status of ['Pending', 'Payment Pending', 'Declined', 'Cancelled', 'Error', 'Processing']) {
    assert.deepEqual(orderNetRevenue(order({ status })), { usd: 0, crc: 0 }, status);
    assert.equal(orderCountsAsSale(order({ status })), false, status);
  }
});

test('an order from before refunds existed still counts in full', () => {
  const old = { status: 'Order Complete', total_usd: 250, total_crc: 125000 };

  assert.deepEqual(orderNetRevenue(old), { usd: 250, crc: 125000 });
});

test('status is matched however it was typed', () => {
  assert.equal(orderCountsAsSale({ status: 'order complete' }), true);
  assert.equal(orderCountsAsSale({ status: '  Paid  ' }), true);
  assert.equal(orderCountsAsSale({}), false);
  assert.equal(orderCountsAsSale(null), false);
});

test('totals add up across many orders', () => {
  const rows = [
    order(),
    order({ status: 'Partly Refunded', refunded_amount_usd: 30, refunded_amount_crc: 15000 }),
    order({ status: 'Refunded', refunded_amount_usd: 100, refunded_amount_crc: 50000 }),
    order({ status: 'Cancelled' }),
  ];

  assert.deepEqual(totalNetRevenue(rows), { usd: 170, crc: 85000 });
  assert.deepEqual(totalNetRevenue([]), { usd: 0, crc: 0 });
});

// ------------------------------------------------------- refunds, by the day

test('two refunds on different days each land on their own day', () => {
  // refunded_at holds only the latest and refunded_amount only the running
  // total, so pairing those two would drop both refunds onto the second day.
  const twice = order({
    status: 'Partly Refunded',
    refunded_amount_usd: 50,
    refunded_at: '2026-08-10T12:00:00Z',
    refund_events: [
      { amount_usd: 20, amount_crc: 10000, at: '2026-08-05T12:00:00Z' },
      { amount_usd: 30, amount_crc: 15000, at: '2026-08-10T12:00:00Z' },
    ],
  });

  const firstDay = refundedInRange([twice], '2026-08-05T00:00:00Z', '2026-08-06T00:00:00Z');
  const secondDay = refundedInRange([twice], '2026-08-10T00:00:00Z', '2026-08-11T00:00:00Z');

  assert.equal(firstDay.usd, 20);
  assert.equal(secondDay.usd, 30);
  assert.equal(refundedInRange([twice], '2026-08-01T00:00:00Z').usd, 50);
});

test('a refund with no event list still gets counted, dated by refunded_at', () => {
  const legacy = order({
    status: 'Refunded',
    refunded_amount_usd: 80,
    refunded_amount_crc: 40000,
    refunded_at: '2026-08-07T12:00:00Z',
  });

  const events = orderRefundEvents(legacy);
  assert.equal(events.length, 1);
  assert.equal(events[0].usd, 80);
  assert.equal(refundedInRange([legacy], '2026-08-07T00:00:00Z', '2026-08-08T00:00:00Z').usd, 80);
});

test('an order that was never refunded contributes nothing', () => {
  assert.deepEqual(orderRefundEvents(order()), []);
  assert.deepEqual(refundedInRange([order()], '2026-01-01T00:00:00Z'), { usd: 0, crc: 0, count: 0 });
});

test('refunds outside the range are left out', () => {
  const refunded = order({
    status: 'Refunded',
    refunded_amount_usd: 40,
    refunded_at: '2026-07-01T12:00:00Z',
  });

  assert.equal(refundedInRange([refunded], '2026-08-01T00:00:00Z').usd, 0);
});

// ------------------------------------------------------------- the alignment

test('the Today tiles and the analytics chart agree about one order', () => {
  // The bug this replaces: the same order read as $100 on one screen and $0 on
  // the other. Both now derive from orderNetRevenue, so they cannot diverge.
  const partly = order({
    status: 'Partly Refunded',
    refunded_amount_usd: 30,
    refunded_amount_crc: 15000,
  });

  const chart = revenueTrendRows([partly]);
  assert.equal(chart.length, 1, 'a partly refunded order must not vanish from the chart');
  assert.equal(chart[0].revenueUsd, 70);
  assert.equal(chart[0].revenueUsd, orderNetRevenueUsd(partly), 'the two screens must match');
});

test('a partly refunded order is a successful sale, a fully refunded one is not', () => {
  assert.equal(isSuccessfulAnalyticsOrder({ status: 'Partly Refunded' }), true);
  assert.equal(isSuccessfulAnalyticsOrder({ status: 'Refunded' }), false);
  assert.equal(isSuccessfulAnalyticsOrder({ status: 'Paid' }), true);
});

test('revenue statuses are the commission statuses, not a second list', () => {
  // Two lists drift, and a status worth a commission but not revenue would pay
  // an agent for money the business never counted.
  assert.ok(REVENUE_ORDER_STATUSES.has('partly refunded'));
  assert.ok(REVENUE_ORDER_STATUSES.has('paid'));
  assert.ok(!REVENUE_ORDER_STATUSES.has('refunded'));

  const lib = fs.readFileSync('src/lib/orderRevenue.mjs', 'utf8');
  assert.match(lib, /COMMISSION_ELIGIBLE_ORDER_STATUSES\.map\(lower\)/);
});

// -------------------------------------------- nobody does the sum themselves

test('every screen that reports money asks the shared rule', () => {
  const places = [
    ['src/components/admin/DashboardHome.js', /orderNetRevenueUsd\(o\)/],
    ['src/lib/analyticsDashboard.mjs', /orderNetRevenue\(order\)/],
    ['src/components/admin/AnalyticsDashboard.js', /orderNetRevenue\(o\)\.usd/],
    ['src/components/admin/CustomersCRM.js', /orderNetRevenueUsd\(o\)/],
    ['src/app/api/admin/customer-timeline/route.js', /orderNetRevenueUsd\(row\)/],
    ['src/app/api/admin/marketing-intelligence/route.js', /orderNetRevenueUsd\(order\)/],
    ['src/components/admin/WhatsAppInbox.js', /orderNetRevenueUsd\(order\)/],
    ['src/app/api/admin/campaigns/route.js', /orderNetRevenueUsd\(ord\)/],
    ['src/app/api/admin/campaigns/stats/route.js', /orderNetRevenueUsd\(order\)/],
  ];

  for (const [file, pattern] of places) {
    assert.match(fs.readFileSync(file, 'utf8'), pattern, file + ' must use the shared rule');
  }
});

test('the routes fetch the columns the rule needs', () => {
  // Selecting only total_usd would make the rule see no status and report every
  // campaign as zero — silently wiping the revenue figures rather than fixing
  // them.
  for (const file of [
    'src/app/api/admin/campaigns/route.js',
    'src/app/api/admin/campaigns/stats/route.js',
    'src/app/api/admin/marketing-intelligence/route.js',
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    const select = source.slice(source.indexOf(".select('"), source.indexOf(".select('") + 400);
    assert.ok(/refunded_amount_usd/.test(source), file + ' must select refunded_amount_usd');
    assert.ok(/status/.test(select) || /status/.test(source), file + ' must select status');
  }
});

test('the home dashboard shows what was refunded, not only what was earned', () => {
  const home = fs.readFileSync('src/components/admin/DashboardHome.js', 'utf8');

  assert.match(home, /refundedInRange\(orders, todayStart\)/);
  assert.match(home, /refundedInRange\(orders, weekStart\)/);
  assert.match(home, /Refunded Today/);
  assert.match(home, /Refunded This Week/);
});
