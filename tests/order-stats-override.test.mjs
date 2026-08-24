// Holding a test order out of the figures.
//
// A test order flipped to Paid landed in Revenue Today, the analytics chart,
// the customer's lifetime total and — if it carried a sales agent — a real
// commission payout, with no way back except deleting the row.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  orderCountsAsSale,
  orderNetRevenueUsd,
  orderRevenueBasis,
  orderStatsOverride,
  totalNetRevenue,
  withoutExcludedOrders,
  STATS_OVERRIDE_EXCLUDE,
  STATS_OVERRIDE_INCLUDE,
} from '../src/lib/orderRevenue.mjs';

const order = (over = {}) => ({ status: 'Paid', total_usd: 100, total_crc: 45000, ...over });

test('with no override the status rules are unchanged', () => {
  assert.equal(orderCountsAsSale(order({ status: 'Paid' })), true);
  assert.equal(orderCountsAsSale(order({ status: 'Completed' })), true);
  assert.equal(orderCountsAsSale(order({ status: 'Partly Refunded' })), true);
  assert.equal(orderCountsAsSale(order({ status: 'Pending' })), false);
  assert.equal(orderCountsAsSale(order({ status: 'Refunded' })), false);
  assert.equal(orderCountsAsSale(order({ status: 'Cancelled' })), false);
});

test('exclude beats a status that would otherwise count', () => {
  const test1 = order({ status: 'Paid', stats_override: 'exclude' });
  assert.equal(orderCountsAsSale(test1), false);
  assert.equal(orderNetRevenueUsd(test1), 0, 'an excluded order is worth nothing anywhere');
});

test('include beats a status that would otherwise not count', () => {
  const forced = order({ status: 'Pending', stats_override: 'include' });
  assert.equal(orderCountsAsSale(forced), true);
  assert.equal(orderNetRevenueUsd(forced), 100, 'a forced order carries its full total');
});

test('a refund still comes off an order that was forced in', () => {
  const forced = order({ status: 'Pending', stats_override: 'include', refunded_amount_usd: 30 });
  assert.equal(orderNetRevenueUsd(forced), 70);
});

test('an unknown or empty override is ignored rather than trusted', () => {
  assert.equal(orderStatsOverride(order({ stats_override: 'maybe' })), null);
  assert.equal(orderStatsOverride(order({ stats_override: '' })), null);
  assert.equal(orderStatsOverride(order({})), null);
  assert.equal(orderCountsAsSale(order({ status: 'Paid', stats_override: 'maybe' })), true);
});

test('the override is read case-insensitively', () => {
  assert.equal(orderCountsAsSale(order({ status: 'Paid', stats_override: 'EXCLUDE' })), false);
  assert.equal(orderCountsAsSale(order({ status: 'Pending', stats_override: ' Include ' })), true);
});

test('a row from a database without the column behaves exactly as before', () => {
  // Migrations here are pasted in by hand, so a deploy can land days earlier.
  const legacy = { status: 'Paid', total_usd: 100, total_crc: 45000 };
  assert.equal('stats_override' in legacy, false);
  assert.equal(orderCountsAsSale(legacy), true);
  assert.equal(orderNetRevenueUsd(legacy), 100);
  assert.deepEqual(withoutExcludedOrders([legacy]), [legacy]);
});

test('excluded orders drop out of a total, included ones are added', () => {
  const rows = [
    order({ status: 'Paid', total_usd: 100 }),
    order({ status: 'Paid', total_usd: 250, stats_override: STATS_OVERRIDE_EXCLUDE }),
    order({ status: 'Pending', total_usd: 40, stats_override: STATS_OVERRIDE_INCLUDE }),
    order({ status: 'Pending', total_usd: 999 }),
  ];
  assert.equal(totalNetRevenue(rows).usd, 140, '100 counted + 40 forced in; 250 excluded and 999 pending are not');
});

test('withoutExcludedOrders drops only the excluded ones', () => {
  const keep1 = order({ status: 'Paid' });
  const drop = order({ status: 'Paid', stats_override: 'exclude' });
  const keep2 = order({ status: 'Pending', stats_override: 'include' });
  assert.deepEqual(withoutExcludedOrders([keep1, drop, keep2]), [keep1, keep2]);
  assert.deepEqual(withoutExcludedOrders([]), []);
  assert.deepEqual(withoutExcludedOrders(null), []);
});

test('the drill-down can say why each order does or does not count', () => {
  assert.deepEqual(orderRevenueBasis(order({ status: 'Paid' })),
    { counts: true, override: null, reason: 'Counts because status is Paid' });
  assert.deepEqual(orderRevenueBasis(order({ status: 'Pending' })),
    { counts: false, override: null, reason: 'Status Pending is not a sale' });
  assert.deepEqual(orderRevenueBasis(order({ status: 'Paid', stats_override: 'exclude' })),
    { counts: false, override: 'exclude', reason: 'Excluded by hand (status is Paid)' });
  assert.deepEqual(orderRevenueBasis(order({ status: 'Pending', stats_override: 'include' })),
    { counts: true, override: 'include', reason: 'Included by hand (status is Pending)' });
});

test('an order with no status at all reads as Pending, not as blank', () => {
  const basis = orderRevenueBasis({ total_usd: 10 });
  assert.equal(basis.counts, false);
  assert.match(basis.reason, /Pending/);
});
