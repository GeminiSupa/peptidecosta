import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { eventTimeColumn, eventTimeSelect } from '../src/lib/campaignEventColumns.mjs';

const routeSource = () => readFile(
  new URL('../src/app/api/admin/marketing-intelligence/route.js', import.meta.url),
  'utf8',
);

test('campaign events are read newest first', async () => {
  const source = await routeSource();
  // Unordered, the cap took an arbitrary slice. Measured against the live
  // table that dropped 300 of the 1,294 opens from the last 30 days — and the
  // dropped rows were the newest, which is exactly what the 30-day engagement
  // score is built on.
  assert.match(source, /\.order\(eventTimeColumn\('campaign_opens'\), \{ ascending: false \}\)/);
  assert.match(source, /\.order\(eventTimeColumn\('campaign_clicks'\), \{ ascending: false \}\)/);
});

test('the timestamp column is never guessed as created_at', async () => {
  const source = await routeSource();
  assert.match(source, /eventTimeSelect\('campaign_opens'/);
  assert.match(source, /eventTimeSelect\('campaign_clicks'/);
  assert.doesNotMatch(source, /from\('campaign_(opens|clicks)'\)\s*\n?\s*\.select\('\*'\)/);
  assert.equal(eventTimeColumn('campaign_opens'), 'opened_at');
  assert.equal(eventTimeColumn('campaign_clicks'), 'clicked_at');
});

test('the aliased timestamp is what engagement reads first', async () => {
  const source = await routeSource();
  assert.match(source, /return row\?\.at \|\|/);
  assert.equal(eventTimeSelect('campaign_opens', ['subscriber_id']), 'subscriber_id, at:opened_at');
});

test('a truncated read is reported rather than silently scoring on a subset', async () => {
  const source = await routeSource();
  assert.match(source, /truncated: \[clicks, opens\]\.some\(rows => rows\.length >= EVENT_ROW_CAP\)/);
  assert.match(source, /const EVENT_ROW_CAP = 5000;/);
});
