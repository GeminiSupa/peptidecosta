import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  acquisitionChannelRows,
  analyticsRangeStart,
  campaignPerformanceRows,
  isPendingAnalyticsOrder,
  isSuccessfulAnalyticsOrder,
  revenueTrendRows,
} from '../src/lib/analyticsDashboard.mjs';

test('analytics ranges produce stable ISO boundaries', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  assert.equal(analyticsRangeStart('24h', now), '2026-08-19T12:00:00.000Z');
  assert.equal(analyticsRangeStart('7d', now), '2026-08-13T12:00:00.000Z');
  assert.equal(analyticsRangeStart('all', now), null);
});

test('order KPIs separate paid orders from the active pipeline', () => {
  assert.equal(isSuccessfulAnalyticsOrder({ status: 'Order Complete' }), true);
  assert.equal(isSuccessfulAnalyticsOrder({ status: 'Payment Pending' }), false);
  assert.equal(isPendingAnalyticsOrder({ status: 'Pending - Card' }), true);
  assert.equal(isPendingAnalyticsOrder({ status: 'Processing' }), true);
  assert.equal(isPendingAnalyticsOrder({ status: 'Cancelled' }), false);
});

test('email chart uses unique recipient engagement and sent campaigns only', () => {
  const rows = campaignPerformanceRows([
    {
      id: 'sent',
      title: 'August newsletter',
      status: 'sent',
      sent_at: '2026-08-19T00:00:00.000Z',
      engagement: { sends: 100, unique_opens: 24, unique_clicks: 7, total_opens: 60, total_clicks: 9 },
    },
    { id: 'draft', title: 'Draft', status: 'draft', created_at: '2026-08-20T00:00:00.000Z' },
  ], '7d', new Date('2026-08-20T12:00:00.000Z'));

  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].sends, rows[0].uniqueOpens, rows[0].uniqueClicks, rows[0].openRate, rows[0].clickRate, rows[0].exact],
    [100, 24, 7, 24, 7, true],
  );
});

test('acquisition channels deduplicate visitors and exclude preview traffic', () => {
  const rows = acquisitionChannelRows([
    { id: '1', visitor_id: 'visitor-a', utm_source: 'facebook', hostname: 'peptidescostarica.net' },
    { id: '2', visitor_id: 'visitor-a', utm_source: 'ig', hostname: 'peptidescostarica.net' },
    { id: '3', session_id: 'session-b', utm_source: 'email', hostname: 'catalog.peptidescostarica.net' },
    { id: '4', visitor_id: 'preview', utm_source: 'facebook', hostname: 'branch.vercel.app' },
  ]);

  assert.deepEqual(rows, [
    { name: 'Meta', value: 1 },
    { name: 'Email', value: 1 },
  ]);
});

test('revenue trend keeps years separate and excludes unpaid orders', () => {
  const rows = revenueTrendRows([
    { created_at: '2025-12-31T10:00:00.000Z', status: 'paid', total_usd: 10, total_crc: 5000 },
    { created_at: '2026-01-01T10:00:00.000Z', status: 'Order Complete', total_usd: 20, total_crc: 10000 },
    { created_at: '2026-01-01T11:00:00.000Z', status: 'Cancelled', total_usd: 99, total_crc: 50000 },
  ]);

  assert.deepEqual(rows.map((row) => [row.key, row.revenueUsd]), [
    ['2025-12-31', 10],
    ['2026-01-01', 20],
  ]);
});

test('dashboard data is loaded through authenticated admin routes', async () => {
  const component = await readFile(new URL('../src/components/admin/AnalyticsDashboard.js', import.meta.url), 'utf8');
  const route = await readFile(new URL('../src/app/api/admin/analytics-dashboard/route.js', import.meta.url), 'utf8');

  assert.match(component, /adminFetch\(`\/api\/admin\/analytics-dashboard\?range=/);
  assert.doesNotMatch(component, /\/api\/admin\/campaigns/);
  assert.match(route, /verifyAdminSession\(request, \{ requirePermission: 'analytics' \}\)/);
  assert.match(route, /getSupabaseAdmin\(\)/);
  assert.match(route, /from\('email_campaigns'\)/);
  assert.match(route, /from\('campaign_engagement_stats'\)/);
});
