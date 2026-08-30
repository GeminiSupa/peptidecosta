import test from 'node:test';
import assert from 'node:assert/strict';

import {
  campaignLinkRows,
  linkLabel,
  listHealthSummary,
  listHealthTrend,
} from '../src/lib/analyticsDashboard.mjs';

const links = [
  { campaign_id: 'a', target_url: 'https://costapeptides.com/catalog?utm_source=email', clicks: 8, unique_clicks: 6 },
  { campaign_id: 'a', target_url: 'https://wa.me/50688881234', clicks: 2, unique_clicks: 2 },
  { campaign_id: 'b', target_url: 'https://example.com/other', clicks: 99, unique_clicks: 40 },
];

test('link rows belong to their own campaign only', () => {
  const rows = campaignLinkRows(links, 'a');
  assert.deepEqual(rows.map((row) => row.label), ['costapeptides.com/catalog', 'wa.me/50688881234']);
});

test('share is of the campaign, not of every campaign on screen', () => {
  const [top, second] = campaignLinkRows(links, 'a');
  assert.equal(top.share, 80);
  assert.equal(second.share, 20);
});

test('a campaign with no recorded clicks returns nothing rather than dividing by zero', () => {
  assert.deepEqual(campaignLinkRows(links, 'never-sent'), []);
  assert.deepEqual(campaignLinkRows([{ campaign_id: 'z', target_url: 'https://x.dev', clicks: 0 }], 'z'), [
    { url: 'https://x.dev', label: 'x.dev', clicks: 0, uniqueClicks: 0, lastClickedAt: null, share: 0 },
  ]);
});

test('only the top links are shown, most clicked first', () => {
  const many = Array.from({ length: 9 }, (_, index) => ({
    campaign_id: 'a', target_url: `https://costapeptides.com/p${index}`, clicks: index, unique_clicks: index,
  }));
  const rows = campaignLinkRows(many, 'a', 3);
  assert.deepEqual(rows.map((row) => row.clicks), [8, 7, 6]);
});

test('a link label keeps its host and drops the tracking query', () => {
  assert.equal(linkLabel('https://costapeptides.com/catalog?utm_source=email&x=1'), 'costapeptides.com/catalog');
  assert.equal(linkLabel('https://costapeptides.com/'), 'costapeptides.com');
  assert.equal(linkLabel(''), '—');
  assert.equal(linkLabel('not a url at all'), 'not a url at all');
  assert.equal(linkLabel(`https://costapeptides.com/${'x'.repeat(80)}`).length, 46);
});

test('the trend fills the days nobody joined or left', () => {
  const rows = listHealthTrend(
    ['2026-08-01T10:00:00.000Z', '2026-08-04T10:00:00.000Z'],
    ['2026-08-02T10:00:00.000Z'],
  );
  assert.deepEqual(rows.map((row) => row.key), ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
  assert.deepEqual(rows.map((row) => row.added), [1, 0, 0, 1]);
  assert.deepEqual(rows.map((row) => row.optedOut), [0, 1, 0, 0]);
});

test('an empty list produces no trend rather than a fabricated day', () => {
  assert.deepEqual(listHealthTrend([], []), []);
  assert.deepEqual(listHealthTrend(undefined, undefined), []);
});

test('a span longer than half a year stops filling instead of returning thousands of empty days', () => {
  const rows = listHealthTrend(['2024-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'], []);
  assert.equal(rows.length, 2);
});

test('net growth is what the list gained, not what it added', () => {
  const summary = listHealthSummary({ subscribed: 900, unsubscribed: 100, added: 200, optedOut: 190, bounced: 4 });
  assert.equal(summary.net, 10);
  assert.equal(summary.added, 200);
});

test('a shrinking list reports a negative net', () => {
  assert.equal(listHealthSummary({ added: 5, optedOut: 12 }).net, -7);
});

test('opt-out rate is against everyone who has ever been on the list', () => {
  // 190 of 1,090 people who were ever subscribed have left.
  assert.equal(listHealthSummary({ subscribed: 900, optedOut: 190 }).churnRate, 17.43);
});

test('an empty list has no opt-out rate rather than NaN', () => {
  assert.equal(listHealthSummary(null).churnRate, 0);
  assert.equal(listHealthSummary(undefined).subscribed, 0);
});
