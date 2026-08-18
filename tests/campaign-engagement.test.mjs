import test from 'node:test';
import assert from 'node:assert/strict';

import { campaignEngagement, totalEngagement } from '../src/lib/campaignEngagement.mjs';

const withView = {
  engagement: { sends: 1000, total_opens: 2400, unique_opens: 380, total_clicks: 150, unique_clicks: 90 },
};

test('rates are per person, not per event', () => {
  const stats = campaignEngagement(withView);
  assert.equal(stats.exact, true);
  // 380 people of 1000, not the 2400 pixel loads they generated between them.
  assert.equal(stats.openRate, 38);
  // Clicks are rated against recipients, which is what benchmarks mean by CTR.
  assert.equal(stats.clickRate, 9);
  // And separately: of the people who opened, how many clicked.
  assert.equal(stats.clickToOpenRate, 24);
});

test('a click rate can no longer exceed 100%', () => {
  // Image-blocking clients follow links without loading the pixel, so raw
  // clicks routinely beat raw opens. The old maths printed 500%.
  const stats = campaignEngagement({
    engagement: { sends: 100, total_opens: 2, unique_opens: 2, total_clicks: 10, unique_clicks: 10 },
  });
  assert.equal(stats.clickRate, 10);
  assert.ok(stats.clickToOpenRate <= 100);
});

test('without the view, raw counts are used but flagged inexact', () => {
  const stats = campaignEngagement({
    campaign_sends: [{ count: 500 }],
    campaign_opens: [{ count: 900 }],
    campaign_clicks: [{ count: 40 }],
  });
  assert.equal(stats.exact, false);
  assert.equal(stats.sends, 500);
  // 900 opens across 500 recipients cannot be 900 people, so it is capped
  // rather than reported as a 180% open rate.
  assert.equal(stats.uniqueOpens, 500);
  assert.equal(stats.openRate, 100);
});

test('empty campaigns divide by zero safely', () => {
  const stats = campaignEngagement({});
  assert.deepEqual(
    [stats.sends, stats.openRate, stats.clickRate, stats.clickToOpenRate],
    [0, 0, 0, 0],
  );
});

test('totals roll up people, not events', () => {
  const overall = totalEngagement([
    withView,
    { engagement: { sends: 1000, total_opens: 100, unique_opens: 100, total_clicks: 20, unique_clicks: 10 } },
  ]);
  assert.equal(overall.sends, 2000);
  assert.equal(overall.uniqueOpens, 480);
  assert.equal(overall.openRate, 24);
  assert.equal(overall.uniqueClicks, 100);
  assert.equal(overall.clickRate, 5);
});

test('one un-migrated campaign makes the rollup inexact', () => {
  const overall = totalEngagement([withView, { campaign_sends: [{ count: 10 }] }]);
  assert.equal(overall.exact, false);
});
