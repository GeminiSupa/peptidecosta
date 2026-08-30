import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  acquisitionChannelRows,
  analyticsRangeStart,
  analyticsWindow,
  customWindowFromDates,
  campaignPerformanceRows,
  campaignRevenueIndex,
  domainTrafficRows,
  isPendingAnalyticsOrder,
  isSuccessfulAnalyticsOrder,
  overviewChannelRows,
  overviewCityRows,
  overviewDomainRows,
  overviewPageRows,
  overviewProductViewCounts,
  overviewSessionStats,
  pageTrafficRows,
  periodDelta,
  previousRangeWindow,
  revenueTrendRows,
  uniquePageVisitorCount,
  withinWindow,
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

  // The range now travels with a compare mode and optional custom bounds, so
  // the query is built rather than concatenated — the route is what matters.
  assert.match(component, /adminFetch\(`\/api\/admin\/analytics-dashboard\?\$\{query\}`\)/);
  assert.match(component, /new URLSearchParams\(\{ range: timeRange, compare: compareMode \}\)/);
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

test('the overview is used when Postgres has grouped it, and ignored when it has not', () => {
  const overview = {
    sessions: { total: 127199, mobile: 80000, withDuration: 900, avgCatalogSeconds: 74.5 },
    cities: [{ city: 'Heredia', sessions: 120 }, { city: 'San José', sessions: 400 }],
    productViews: [{ name: 'BPC-157 5mg', views: 900, viewers: 600 }],
    domains: [{ hostname: 'costapeptides.com', pageViews: 5, visitors: 3, paidVisitors: 1 }],
    pages: [{ hostname: 'costapeptides.com', path: '/lp', pageViews: 5, visitors: 3, paidVisitors: 1 }],
    channels: [{ utmSource: 'fb', visitors: 10 }, { utmSource: 'facebook', visitors: 5 }, { utmSource: '', visitors: 7 }],
    landingVisitors: 3,
  };

  assert.deepEqual(overviewProductViewCounts(overview), { 'BPC-157 5mg': 900 });
  assert.deepEqual(overviewCityRows(overview), [['San José', 400], ['Heredia', 120]]);
  assert.equal(overviewDomainRows(overview)[0].visitors, 3);
  assert.equal(overviewPageRows(overview)[0].path, '/lp');

  // Every caller falls back to the row path on null rather than rendering blank.
  for (const read of [overviewProductViewCounts, overviewCityRows, overviewDomainRows, overviewPageRows, overviewChannelRows, overviewSessionStats]) {
    assert.equal(read(null), null);
    assert.equal(read({}), null);
  }
});

test('channel names are folded in one place, not twice', () => {
  // SQL groups the raw utm_source; the "fb" / "facebook" / "ig" → Meta mapping
  // stays here, where the row path also applies it.
  const rows = overviewChannelRows({ channels: [
    { utmSource: 'fb', visitors: 10 },
    { utmSource: 'facebook', visitors: 5 },
    { utmSource: 'instagram', visitors: 2 },
    { utmSource: '', visitors: 7 },
  ] });
  assert.deepEqual(rows, [{ name: 'Meta', value: 17 }, { name: 'Direct / unknown', value: 7 }]);
});

test('the device split never reports more mobile sessions than sessions', () => {
  const stats = overviewSessionStats({ sessions: { total: 10, mobile: 99 } });
  assert.equal(stats.mobile, 10);
  assert.equal(stats.desktop, 0);
  assert.equal(stats.mobilePct, 100);
});

test('an empty range produces zero percentages rather than NaN', () => {
  const stats = overviewSessionStats({ sessions: { total: 0, mobile: 0 } });
  assert.equal(stats.mobilePct, 0);
  assert.equal(stats.desktopPct, 0);
});

test('a comparison window is the equal span immediately before this one', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  assert.deepEqual(previousRangeWindow('7d', now), {
    start: '2026-08-16T12:00:00.000Z',
    end: '2026-08-23T12:00:00.000Z',
  });
  assert.deepEqual(previousRangeWindow('24h', now), {
    start: '2026-08-28T12:00:00.000Z',
    end: '2026-08-29T12:00:00.000Z',
  });
});

test('all time has no previous period rather than an invented one', () => {
  assert.equal(previousRangeWindow('all', new Date()), null);
  assert.equal(previousRangeWindow(undefined, new Date()), null);
});

test('the comparison window ends exactly where the current one starts', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  assert.equal(previousRangeWindow('30d', now).end, analyticsRangeStart('30d', now));
});

test('a delta reads as a direction and a percentage', () => {
  assert.deepEqual(periodDelta(120, 100), { direction: 'up', percent: 20, absolute: 20, isNew: false });
  assert.deepEqual(periodDelta(80, 100), { direction: 'down', percent: -20, absolute: -20, isNew: false });
  assert.equal(periodDelta(100, 100).direction, 'flat');
});

test('growth from nothing is new, not infinite percent', () => {
  const delta = periodDelta(5, 0);
  assert.equal(delta.isNew, true);
  assert.equal(delta.percent, null);
  assert.equal(delta.direction, 'up');
});

test('two quiet periods are flat, not a total collapse', () => {
  const delta = periodDelta(0, 0);
  assert.equal(delta.direction, 'flat');
  assert.equal(delta.isNew, false);
});

test('a delta of nonsense is no delta rather than a rendered NaN', () => {
  assert.equal(periodDelta(Number.NaN, 10), null);
  assert.equal(periodDelta(10, Number.NaN), null);
});

test('two picked dates become a window that includes the whole end day', () => {
  const window = customWindowFromDates('2026-08-01', '2026-08-07');
  // Local midnight on the 1st through local midnight on the 8th, so an order
  // placed on the evening of the 7th is inside the range the reader picked.
  assert.equal(new Date(window.start).getTime() < new Date('2026-08-02T00:00:00Z').getTime(), true);
  assert.equal(withinWindow('2026-08-07T18:00:00', window), true);
  assert.equal(withinWindow('2026-08-08T12:00:00', window), false);
  assert.equal(withinWindow('2026-07-31T12:00:00', window), false);
});

test('dates picked in the wrong order are swapped, not rejected', () => {
  assert.deepEqual(
    customWindowFromDates('2026-08-07', '2026-08-01'),
    customWindowFromDates('2026-08-01', '2026-08-07'),
  );
});

test('a half-picked custom range is not a window', () => {
  assert.equal(customWindowFromDates('2026-08-01', ''), null);
  assert.equal(customWindowFromDates('', '2026-08-07'), null);
  assert.equal(customWindowFromDates('yesterday', 'today'), null);
});

test('a preset range resolves to the same window every filter uses', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  assert.deepEqual(analyticsWindow('7d', now), { start: '2026-08-23T12:00:00.000Z', end: null });
  assert.equal(analyticsWindow('all', now), null);
  assert.equal(withinWindow('2020-01-01T00:00:00.000Z', null), true);
});

test('a custom range gets the equal span before it as its comparison', () => {
  const custom = { start: '2026-08-08T00:00:00.000Z', end: '2026-08-15T00:00:00.000Z' };
  assert.deepEqual(previousRangeWindow('custom', new Date(), { custom }), {
    start: '2026-08-01T00:00:00.000Z',
    end: '2026-08-08T00:00:00.000Z',
  });
});

test('comparing to last year shifts the window rather than sliding it back', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  const window = previousRangeWindow('7d', now, { mode: 'year' });
  assert.equal(window.start, '2025-08-23T12:00:00.000Z');
  assert.equal(window.end, '2025-08-30T12:00:00.000Z');
});

test('comparison can be turned off entirely', () => {
  assert.equal(previousRangeWindow('7d', new Date(), { mode: 'off' }), null);
});

test('the campaign table narrows to a custom window too', () => {
  const campaigns = [
    { id: 'inside', title: 'Inside', status: 'sent', sent_at: '2026-08-10T00:00:00.000Z', engagement: { sends: 10, unique_opens: 5, unique_clicks: 1 } },
    { id: 'outside', title: 'Outside', status: 'sent', sent_at: '2026-07-01T00:00:00.000Z', engagement: { sends: 10, unique_opens: 5, unique_clicks: 1 } },
  ];
  const rows = campaignPerformanceRows(campaigns, { start: '2026-08-08T00:00:00.000Z', end: '2026-08-15T00:00:00.000Z' });
  assert.deepEqual(rows.map((row) => row.id), ['inside']);
});
