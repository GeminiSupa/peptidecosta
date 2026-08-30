import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildAnalyticsDigest,
  describeDelta,
  renderAnalyticsDigestEmail,
} from '../src/lib/analyticsDigest.mjs';
import { periodDelta } from '../src/lib/analyticsDashboard.mjs';

const week = {
  current: { revenueUsd: 4210.5, orders: 14, aovUsd: 300.75, conversionRate: 1.82, visitors: 770, abandonedUsd: 980, abandonedCarts: 6 },
  previous: { revenueUsd: 3600, orders: 12, aovUsd: 300, conversionRate: 1.6, abandonedUsd: 1400 },
  listHealth: { added: 41, optedOut: 3, subscribed: 1515 },
  topCampaign: { name: 'August restock', revenueUsd: 1880, orders: 6 },
  topProducts: [{ name: 'BPC-157 5mg' }, { name: 'Tirzepatide 10mg' }],
};

test('a change reads the way it would be said aloud', () => {
  assert.equal(describeDelta(periodDelta(120, 100)).text, 'up 20%');
  assert.equal(describeDelta(periodDelta(80, 100)).text, 'down 20%');
  assert.equal(describeDelta(periodDelta(100, 100)).text, 'unchanged');
  assert.equal(describeDelta(periodDelta(5, 0)).text, 'new this week');
  assert.equal(describeDelta(null).text, 'no comparison');
});

test('the headline is the one line worth reading', () => {
  const digest = buildAnalyticsDigest(week);
  assert.equal(digest.headline, '$4,210.50, up 17% on the week before.');
});

test('a week with no orders says so rather than reporting a 100% collapse', () => {
  const digest = buildAnalyticsDigest({ current: { revenueUsd: 0, orders: 0 }, previous: { revenueUsd: 900, orders: 3 } });
  assert.equal(digest.headline, 'No orders were completed last week.');
});

test('a fall in abandoned cart value is the good direction', () => {
  const digest = buildAnalyticsDigest(week);
  const carts = digest.rows.find((row) => row.key === 'carts');
  assert.equal(carts.goodWhenDown, true);
  assert.equal(carts.delta.direction, 'down');

  // Good news is green even though the arrow points down.
  const { html } = renderAnalyticsDigestEmail(digest);
  const cartsCell = html.slice(html.indexOf('Left in abandoned carts'));
  assert.match(cartsCell.slice(0, 700), /#15803d/);
});

test('net list change is joins minus departures', () => {
  assert.equal(buildAnalyticsDigest(week).list.net, 38);
  assert.equal(buildAnalyticsDigest({ listHealth: { added: 2, optedOut: 9 } }).list.net, -7);
});

test('the email carries the direction as a word, not only as a colour', () => {
  const { html, text, subject } = renderAnalyticsDigestEmail(buildAnalyticsDigest(week));
  assert.match(html, /up 17%/);
  assert.match(text, /Revenue: \$4,210\.50 \(up 17%\)/);
  assert.match(subject, /Costa Peptides weekly/);
});

test('a campaign name from the database cannot inject markup into the email', () => {
  const digest = buildAnalyticsDigest({
    ...week,
    topCampaign: { name: '<script>steal()</script>', revenueUsd: 10, orders: 1 },
  });
  const { html } = renderAnalyticsDigestEmail(digest);
  assert.doesNotMatch(html, /<script>steal/);
  assert.match(html, /&lt;script&gt;steal/);
});

test('a week with nothing at all still renders an email', () => {
  const { html, text } = renderAnalyticsDigestEmail(buildAnalyticsDigest({}));
  assert.match(html, /No orders were completed last week/);
  assert.match(text, /No campaign earned an order last week/);
});

test('the digest cron is scheduled and guarded like the others', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const entry = config.crons.find((cron) => cron.path === '/api/cron/analytics-digest');
  assert.ok(entry, 'the digest has no cron entry');
  assert.equal(entry.schedule, '0 13 * * 1');

  const route = await readFile(new URL('../src/app/api/cron/analytics-digest/route.js', import.meta.url), 'utf8');
  assert.match(route, /verifyCronRequest\(request\)/);
  // Revenue must come from the shared rule, or the email and the tab disagree.
  assert.match(route, /orderNetRevenue/);
  assert.match(route, /isSuccessfulAnalyticsOrder/);
});

test('a missing SMTP config is reported, not answered with a silent 200', async () => {
  const route = await readFile(new URL('../src/app/api/cron/analytics-digest/route.js', import.meta.url), 'utf8');
  assert.match(route, /status: 503/);
  assert.match(route, /SMTP is not configured/);
});
