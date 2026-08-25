import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AGENT_ANALYTICS_MAX_WEEK_OFFSET,
  agentAnalyticsRange,
  formatAgentDate,
  normalizeAgentWeekOffset,
  orderCompletedAtMs,
  orderCompletedInRange,
  preferredAgentMoney,
} from '../src/lib/agentDashboard.mjs';

test('agent analytics boundaries use Costa Rica calendar dates', () => {
  const range = agentAnalyticsRange('2026-08-21T05:30:00.000Z', 0);

  assert.equal(range.nowUtc, '2026-08-21T05:30:00.000Z');
  assert.equal(range.todayStartUtc, '2026-08-20T06:00:00.000Z');
  assert.equal(range.monthStartUtc, '2026-08-01T06:00:00.000Z');
  assert.equal(range.weekStartUtc, '2026-08-17T06:00:00.000Z');
  assert.equal(range.weekEndUtc, range.nowUtc);
  assert.equal(range.weekStartDate, '2026-08-17');
  assert.equal(range.weekEndDate, '2026-08-23');
});

test('past agent weeks are complete Monday-to-Monday half-open ranges', () => {
  const range = agentAnalyticsRange('2026-08-21T18:00:00.000Z', 1);

  assert.equal(range.weekStartUtc, '2026-08-10T06:00:00.000Z');
  assert.equal(range.weekEndUtc, '2026-08-17T06:00:00.000Z');
  assert.equal(range.weekStartDate, '2026-08-10');
  assert.equal(range.weekEndDate, '2026-08-16');
});

test('week navigation is normalized and capped', () => {
  assert.equal(normalizeAgentWeekOffset(-4), 0);
  assert.equal(normalizeAgentWeekOffset('not-a-number'), 0);
  assert.equal(normalizeAgentWeekOffset(4), 4);
  assert.equal(normalizeAgentWeekOffset(999), AGENT_ANALYTICS_MAX_WEEK_OFFSET);
});

test('completion time ignores payment and uses the first completed transition', () => {
  const order = {
    created_at: '2026-08-01T10:00:00.000Z',
    activity_log: [
      { type: 'status_change', message: 'Status changed to Completed', at: '2026-08-15T10:00:00.000Z' },
      { type: 'note', message: 'Paid by transfer', at: '2026-08-03T10:00:00.000Z' },
      { type: 'status_change', message: 'Status changed to Paid', at: '2026-08-10T10:00:00.000Z' },
    ],
  };

  assert.equal(orderCompletedAtMs(order), Date.parse('2026-08-15T10:00:00.000Z'));
  assert.equal(orderCompletedInRange(order, '2026-08-15T10:00:00.000Z', '2026-08-16T00:00:00.000Z'), true);
  assert.equal(orderCompletedInRange(order, '2026-08-01T00:00:00.000Z', '2026-08-15T10:00:00.000Z'), false);
});

test('a paid-only activity log is not treated as completion', () => {
  const order = {
    created_at: '2026-08-01T10:00:00.000Z',
    activity_log: [
      { type: 'status_change', message: 'Status changed to Paid', at: '2026-08-10T10:00:00.000Z' },
    ],
  };

  assert.equal(orderCompletedAtMs(order), Date.parse(order.created_at));
});

test('completion falls back to creation and excludes the upper boundary', () => {
  const order = { created_at: '2026-08-10T06:00:00.000Z', activity_log: [] };
  assert.equal(orderCompletedInRange(order, '2026-08-10T06:00:00.000Z', '2026-08-17T06:00:00.000Z'), true);
  assert.equal(orderCompletedInRange(order, '2026-08-01T06:00:00.000Z', '2026-08-10T06:00:00.000Z'), false);
});

test('date-only labels do not pass through a timezone-shifting ISO parse', () => {
  assert.equal(formatAgentDate('2026-08-10', 'en-US'), 'Aug 10');
});

test('dashboard money follows the agent configured currency', () => {
  assert.deepEqual(preferredAgentMoney(10, 5000, 'USD'), { currency: 'USD', value: 10 });
  assert.deepEqual(preferredAgentMoney(10, 5000, 'CRC'), { currency: 'CRC', value: 5000 });
  assert.deepEqual(preferredAgentMoney(undefined, Number.NaN, 'CRC'), { currency: 'CRC', value: 0 });
});

test('Today tab opts into isolated layout and reliable analytics behavior', async () => {
  const [page, component, route] = await Promise.all([
    readFile(new URL('../src/app/admin/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/AgentDashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/agent/analytics/route.js', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /variant="today"/);
  assert.match(component, /analyticsAbortRef\.current\?\.abort\(\)/);
  assert.match(component, /setAvatarError\(/);
  assert.doesNotMatch(component, /handleAvatarUpload[\s\S]*?setError\(/);
  assert.match(route, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
  assert.match(route, /currentWeekOverrideUSD/);
  assert.match(route, /\.eq\('start_date', weekStartUtc\)/);
  assert.doesNotMatch(route, /error\.message \|\|/);
});
