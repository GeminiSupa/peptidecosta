import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  acquisitionChannelRows,
  analyticsRangeStart,
  campaignPerformanceRows,
  campaignRevenueIndex,
  domainTrafficRows,
  isPendingAnalyticsOrder,
  isSuccessfulAnalyticsOrder,
  pageTrafficRows,
  revenueTrendRows,
  uniquePageVisitorCount,
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

test('domain and page analytics aggregate production page views without splitting UTM URLs', () => {
  const events = [
    { id: '1', event_type: 'page_view', visitor_id: 'visitor-a', hostname: 'catalog.peptidescostarica.net', path: '/lp?utm_source=google', gclid: 'click-1' },
    { id: '2', event_type: 'page_view', visitor_id: 'visitor-a', hostname: 'catalog.peptidescostarica.net', path: '/lp?utm_source=email' },
    { id: '3', event_type: 'page_view', visitor_id: 'visitor-b', hostname: 'peptidescostarica.net', path: '/catalog' },
    { id: '4', event_type: 'heartbeat', visitor_id: 'visitor-a', hostname: 'catalog.peptidescostarica.net', path: '/lp' },
    { id: '5', event_type: 'page_view', visitor_id: 'preview', hostname: 'branch.vercel.app', path: '/lp' },
  ];

  assert.deepEqual(domainTrafficRows(events), [
    { key: 'catalog.peptidescostarica.net', hostname: 'catalog.peptidescostarica.net', pageViews: 2, visitors: 1, paidVisitors: 1 },
    { key: 'peptidescostarica.net', hostname: 'peptidescostarica.net', pageViews: 1, visitors: 1, paidVisitors: 0 },
  ]);
  assert.deepEqual(pageTrafficRows(events), [
    { key: 'catalog.peptidescostarica.net/lp', hostname: 'catalog.peptidescostarica.net', path: '/lp', pageViews: 2, visitors: 1, paidVisitors: 1 },
    { key: 'peptidescostarica.net/catalog', hostname: 'peptidescostarica.net', path: '/catalog', pageViews: 1, visitors: 1, paidVisitors: 0 },
  ]);
  assert.equal(uniquePageVisitorCount(events, '/lp'), 1);
});

test('revenue trend keeps years separate and excludes unpaid orders', () => {
  const rows = revenueTrendRows([
    { created_at: '2025-12-31T10:00:00.000Z', status: 'completed', total_usd: 10, total_crc: 5000 },
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
  assert.match(route, /event_type, hostname, path, page_title/);
  assert.match(route, /utm_campaign, gclid, fbclid/);
  assert.match(component, /Domain & page analytics/);
});

test('campaign revenue is attributed from orders.campaign_id', () => {
  const index = campaignRevenueIndex([
    { campaign_id: 'c1', status: 'Order Complete', total_usd: 120 },
    { campaign_id: 'c1', status: 'Order Complete', total_usd: 80 },
    { campaign_id: 'c2', status: 'Order Complete', total_usd: 50 },
    // Not a sale, so it buys the campaign nothing.
    { campaign_id: 'c1', status: 'Cancelled', total_usd: 999 },
    // No tag: it belongs to no campaign rather than to the first one.
    { campaign_id: null, status: 'Order Complete', total_usd: 999 },
  ]);

  assert.equal(index.get('c1').revenueUsd, 200);
  assert.equal(index.get('c1').orders, 2);
  assert.equal(index.get('c2').revenueUsd, 50);
  assert.equal(index.has('c3'), false);
});

test('a refunded order reduces what its campaign earned', () => {
  // The figure sits beside Revenue elsewhere on the page, so it has to subtract
  // the same way that one does.
  const index = campaignRevenueIndex([
    { campaign_id: 'c1', status: 'Partly Refunded', total_usd: 100, refunded_amount_usd: 30 },
  ]);
  assert.equal(index.get('c1').revenueUsd, 70);
});

test('campaign rows carry revenue, orders, and revenue per recipient', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  const rows = campaignPerformanceRows(
    [{
      id: 'c1',
      title: 'August newsletter',
      status: 'sent',
      sent_at: '2026-08-19T00:00:00.000Z',
      engagement: { sends: 200, unique_opens: 80, unique_clicks: 20, total_opens: 90, total_clicks: 24 },
    }],
    'all',
    now,
    campaignRevenueIndex([
      { campaign_id: 'c1', status: 'Order Complete', total_usd: 300 },
      { campaign_id: 'c1', status: 'Order Complete', total_usd: 100 },
    ]),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].revenueUsd, 400);
  assert.equal(rows[0].orders, 2);
  assert.equal(rows[0].revenuePerRecipient, 2);
  // Engagement is untouched by the join.
  assert.equal(rows[0].openRate, 40);
});

test('a campaign nothing was bought from reads zero, not blank', () => {
  const rows = campaignPerformanceRows(
    [{ id: 'c9', title: 'Quiet one', status: 'sent', sent_at: '2026-08-19T00:00:00.000Z', engagement: { sends: 500 } }],
    'all',
    new Date('2026-08-20T12:00:00.000Z'),
    campaignRevenueIndex([]),
  );
  assert.equal(rows[0].revenueUsd, 0);
  assert.equal(rows[0].orders, 0);
  assert.equal(rows[0].revenuePerRecipient, 0);
});

test('rows still work when no revenue index is supplied', () => {
  // The signature grew a fourth argument; existing callers must not break.
  const rows = campaignPerformanceRows(
    [{ id: 'c1', title: 'Old caller', status: 'sent', sent_at: '2026-08-19T00:00:00.000Z', engagement: { sends: 10 } }],
    'all',
    new Date('2026-08-20T12:00:00.000Z'),
  );
  assert.equal(rows[0].revenueUsd, 0);
  assert.equal(rows[0].sends, 10);
});
