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
  orderGrossUsd,
  orderNetRevenue,
  orderNetRevenueUsd,
  orderRefundEvents,
  refundedInRange,
  totalNetRevenue,
} from '../src/lib/orderRevenue.mjs';
import { isSuccessfulAnalyticsOrder, revenueTrendRows } from '../src/lib/analyticsDashboard.mjs';

const order = (over = {}) => ({
  status: 'Order Complete',
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
  assert.equal(orderCountsAsSale({ status: '  Order Complete  ' }), true);
  assert.equal(orderCountsAsSale({ status: '  Paid  ' }), false, 'trimmed, but still not a sale');
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
  assert.equal(isSuccessfulAnalyticsOrder({ status: 'Order Complete' }), true);
  // Paid means the charge cleared, not that the order was closed. See below.
  assert.equal(isSuccessfulAnalyticsOrder({ status: 'Paid' }), false);
});

test('revenue statuses are the commission statuses, not a second list', () => {
  // Two lists drift, and a status worth a commission but not revenue would pay
  // an agent for money the business never counted.
  assert.ok(REVENUE_ORDER_STATUSES.has('order complete'));
  assert.ok(REVENUE_ORDER_STATUSES.has('partly refunded'));
  assert.ok(!REVENUE_ORDER_STATUSES.has('refunded'));
  // Only a closed order is a sale. The card gateway sets 'Paid' by itself when
  // a charge clears, and orders sat in it for up to 70 days counting in full.
  assert.ok(!REVENUE_ORDER_STATUSES.has('paid'));

  const lib = fs.readFileSync('src/lib/orderRevenue.mjs', 'utf8');
  assert.match(lib, /COMMISSION_ELIGIBLE_ORDER_STATUSES\.map\(lower\)/);
});

// -------------------------------------------- nobody does the sum themselves

test('every screen that reports money asks the shared rule', () => {
  const places = [
    // The trailing [,)] lets a screen pass the live exchange rate as a second
    // argument without dropping out of this check — what matters is that it
    // asks the shared rule at all, not how many arguments it hands it.
    ['src/components/admin/DashboardHome.js', /orderNetRevenueUsd\(o[,)]/],
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

test('the home dashboard carries no refund tiles', () => {
  // Omer asked for them off the front page. refundedInRange itself stays — it
  // is tested above and is what any future refund report would be built from.
  const home = fs.readFileSync('src/components/admin/DashboardHome.js', 'utf8');

  assert.ok(!home.includes('Refunded Today'));
  assert.ok(!home.includes('Refunded This Week'));
  assert.ok(!home.includes('refundedInRange'), 'and nothing left computing them');
});

// ------------------------------------------- the colón-only order (WooCommerce)

// The main site at peptidescostarica.net is still WordPress, and its orders are
// synced into the same table from outside this repo. That sync writes total_crc
// and leaves total_usd empty, so four completed sales sat in the Orders list at
// their colón price while every money screen counted them as $0.00.

const wooOrder = (over = {}) => ({
  status: 'Order Complete',
  currency: 'CRC',
  total_crc: 67830,
  total_usd: null,
  source: 'woocommerce',
  created_at: '2026-08-22T20:24:51Z',
  ...over,
});

test('a colón-only order is worth its converted total, not zero', () => {
  const net = orderNetRevenue(wooOrder(), 452.2);

  assert.equal(net.crc, 67830);
  assert.equal(net.usd, 150.0);
  assert.notEqual(net.usd, 0, 'the whole bug: a real sale reading as no money');
});

test('the conversion uses the rate it is given', () => {
  const cheap = orderNetRevenueUsd(wooOrder({ total_crc: 100000 }), 500);
  const dear = orderNetRevenueUsd(wooOrder({ total_crc: 100000 }), 400);

  assert.equal(cheap, 200);
  assert.equal(dear, 250);
});

test('a missing or nonsense rate falls back rather than dividing by zero', () => {
  for (const bad of [undefined, null, 0, -1, NaN, 'abc']) {
    const usd = orderNetRevenueUsd(wooOrder({ total_crc: 45448 }), bad);
    assert.equal(usd, 100, `rate ${String(bad)} must use the shared fallback`);
    assert.ok(Number.isFinite(usd), 'and never produce Infinity');
  }
});

test('an order that already has dollars is never re-priced', () => {
  // The guard that keeps this from touching the other 595 orders: a USD figure
  // that is present wins, whatever the colón column happens to say.
  const usd = orderNetRevenueUsd(order({ total_usd: 100, total_crc: 999999 }), 452.2);

  assert.equal(usd, 100);
});

test('a colón-only order still obeys the status rules', () => {
  // Converting must not smuggle in money the status rules exclude — #30266 came
  // over from WooCommerce as a failed payment and is worth nothing.
  assert.equal(orderNetRevenueUsd(wooOrder({ status: 'Pending' }), 452.2), 0);
  assert.equal(orderNetRevenueUsd(wooOrder({ status: 'Cancelled' }), 452.2), 0);
  assert.equal(orderNetRevenueUsd(wooOrder({ stats_override: 'exclude' }), 452.2), 0);
});

test('a colón-only order refunded in colones nets out correctly', () => {
  // Converting only what was paid would leave the full total standing against a
  // refund of zero — a worse answer than the $0 this replaced.
  const usd = orderNetRevenueUsd(wooOrder({
    status: 'Partly Refunded',
    total_crc: 90440,
    refunded_amount_crc: 45220,
    refunded_amount_usd: null,
  }), 452.2);

  assert.equal(usd, 100);
});

test('an order with no totals at all is still worth nothing', () => {
  assert.equal(orderNetRevenueUsd(wooOrder({ total_crc: null }), 452.2), 0);
});

test('the drill-down can price an order the tiles refuse to count', () => {
  // A pending colón-only order shows $0 as revenue but must still show what it
  // is worth, or nobody can decide whether to force it into the figures.
  const pending = wooOrder({ status: 'Pending', total_crc: 45220 });

  assert.equal(orderNetRevenueUsd(pending, 452.2), 0, 'not revenue');
  assert.equal(orderGrossUsd(pending, 452.2), 100, 'but not worth nothing either');
});

test('totalNetRevenue passes the rate down to every order', () => {
  const total = totalNetRevenue([wooOrder({ total_crc: 45220 }), wooOrder({ total_crc: 45220 })], 452.2);

  assert.equal(total.usd, 200);
});

test('a colón-only order forced in by hand is worth its converted total', () => {
  // Where the override feature meets the conversion: #30266 came over from
  // WooCommerce as a failed payment, but if the money did in fact arrive, a
  // superadmin forcing it in must get the real figure, not $0.
  const forcedIn = wooOrder({ status: 'Pending', stats_override: 'include', total_crc: 45220 });

  assert.equal(orderCountsAsSale(forcedIn), true);
  assert.equal(orderNetRevenueUsd(forcedIn, 452.2), 100);
});

test('the conversion matches what the commission path already pays on', () => {
  // getOrderSalesAmounts has filled the missing currency symmetrically all
  // along — which is why agents were paid correctly on colón-only orders while
  // the revenue tiles showed $0 for the very same sale. Checked against the
  // source rather than by importing it: agentOrders.js imports through the
  // '@/lib' alias, which node --test cannot resolve.
  const agent = fs.readFileSync('src/lib/agentOrders.js', 'utf8');
  assert.match(agent, /usd = crc \/ exchangeRate/, 'the commission path converts colones');

  const lib = fs.readFileSync('src/lib/orderRevenue.mjs', 'utf8');
  assert.match(lib, /crc \/ safeRate\(rate\)/, 'and so does this one, the same way');

  // 45,220 colones at 452.2 is $100 on either path.
  assert.equal(orderNetRevenueUsd(wooOrder({ total_crc: 45220 }), 452.2), 100);
});
