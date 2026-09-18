import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEAL_PAGE_ATTRIBUTION_MS,
  DEAL_PAGE_EXPERIMENT,
  MIN_VISITORS_TO_CALL,
  compareRates,
  experimentOrderTag,
  pickVariant,
  summarizeDealPageExperiment,
} from '../src/lib/dealPageExperiment.mjs';

test('a visitor keeps the version they were given', () => {
  assert.equal(pickVariant({ stored: 'b', random: () => 0 }), 'b');
  assert.equal(pickVariant({ stored: 'A', random: () => 0.9 }), 'a');
});

test('a ?variant= link overrides, for checking each version by hand', () => {
  assert.equal(pickVariant({ requested: 'b', stored: 'a' }), 'b');
  assert.equal(pickVariant({ requested: 'zzz', stored: 'a' }), 'a');
});

test('a new visitor is split evenly by a coin flip', () => {
  assert.equal(pickVariant({ random: () => 0.1 }), 'a');
  assert.equal(pickVariant({ random: () => 0.7 }), 'b');
});

test('an order is credited only within 14 days of seeing the page', () => {
  const now = Date.parse('2026-09-15T12:00:00Z');
  assert.deepEqual(
    experimentOrderTag({ variant: 'b', seenAt: now - 60 * 1000, now }),
    { experiment: DEAL_PAGE_EXPERIMENT, variant: 'b' },
  );
  assert.equal(experimentOrderTag({ variant: 'b', seenAt: now - DEAL_PAGE_ATTRIBUTION_MS - 1, now }), null);
  assert.equal(experimentOrderTag({ variant: 'b', seenAt: null, now }), null);
  assert.equal(experimentOrderTag({ variant: 'x', seenAt: now, now }), null);
});

function visitors(variant, count, prefix = variant) {
  return Array.from({ length: count }, (_, index) => ({ variant, event: 'view', visitor_id: `${prefix}${index}` }));
}

function paidOrders(variant, count, total = 100) {
  const events = [];
  const orders = [];
  for (let index = 0; index < count; index += 1) {
    const id = `${variant}-order-${index}`;
    events.push({ variant, event: 'order', order_id: id });
    orders.push({ id, status: 'Order Complete', total_usd: total });
  }
  return { events, orders };
}

test('visitors are counted once, and an order retried twice counts once', () => {
  const summary = summarizeDealPageExperiment([
    { variant: 'a', event: 'view', visitor_id: 'v1' },
    { variant: 'a', event: 'view', visitor_id: 'v1' },
    { variant: 'a', event: 'cta_click', visitor_id: 'v1' },
    { variant: 'a', event: 'order', order_id: 'o1' },
    { variant: 'a', event: 'order', order_id: 'o1' },
  ], [{ id: 'o1', status: 'Paid', total_usd: 150 }]);
  const a = summary.variants[0];
  assert.equal(a.views, 2);
  assert.equal(a.visitors, 1);
  assert.equal(a.clickRate, 1);
  assert.equal(a.orders, 1);
  assert.equal(a.paidOrders, 1);
  assert.equal(a.revenueUsd, 150);
});

test('unpaid orders are shown but earn no revenue; refunds come off', () => {
  const summary = summarizeDealPageExperiment([
    { variant: 'b', event: 'view', visitor_id: 'v1' },
    { variant: 'b', event: 'order', order_id: 'pending' },
    { variant: 'b', event: 'order', order_id: 'refunded' },
  ], [
    { id: 'pending', status: 'Pending', total_usd: 500 },
    { id: 'refunded', status: 'Partly Refunded', total_usd: 300, refunded_amount_usd: 100 },
  ]);
  const b = summary.variants[1];
  assert.equal(b.orders, 2);
  assert.equal(b.paidOrders, 1);
  assert.equal(b.revenueUsd, 200);
});

test('no winner is called before each version has enough visitors', () => {
  const summary = summarizeDealPageExperiment(
    [...visitors('a', MIN_VISITORS_TO_CALL - 1), ...visitors('b', 500)],
    [],
  );
  assert.equal(summary.verdict.status, 'too_early');
});

test('a clear difference with enough visitors names the winner', () => {
  const a = paidOrders('a', 5);
  const b = paidOrders('b', 40);
  const summary = summarizeDealPageExperiment(
    [...visitors('a', 1000), ...visitors('b', 1000), ...a.events, ...b.events],
    [...a.orders, ...b.orders],
  );
  assert.equal(summary.verdict.status, 'winner');
  assert.equal(summary.verdict.winner, 'b');
  assert.ok(summary.verdict.confidence >= 0.95);
});

test('a small difference is not declared a win', () => {
  const a = paidOrders('a', 20);
  const b = paidOrders('b', 22);
  const summary = summarizeDealPageExperiment(
    [...visitors('a', 1000), ...visitors('b', 1000), ...a.events, ...b.events],
    [...a.orders, ...b.orders],
  );
  assert.equal(summary.verdict.status, 'no_difference_yet');
});

test('the rate comparison is symmetric and handles empty input', () => {
  assert.equal(compareRates(0, 0, 1, 10), null);
  const forward = compareRates(10, 1000, 30, 1000);
  const backward = compareRates(30, 1000, 10, 1000);
  assert.ok(Math.abs(forward.confidence - backward.confidence) < 1e-9);
  assert.ok(forward.z > 0 && backward.z < 0);
});
