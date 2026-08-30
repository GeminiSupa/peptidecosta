import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseFilters,
  parseViews,
  readStored,
  removeView,
  upsertView,
  writeStored,
} from '../src/lib/analyticsViews.mjs';

test('unknown filter values fall back rather than being sent to the endpoint', () => {
  assert.deepEqual(normaliseFilters({ range: 'last-tuesday', compare: 'vibes' }), {
    range: 'all', compare: 'previous', start: '', end: '',
  });
});

test('custom dates are kept only for a custom range, and only if they are dates', () => {
  assert.deepEqual(normaliseFilters({ range: 'custom', start: '2026-08-01', end: '2026-08-07' }), {
    range: 'custom', compare: 'previous', start: '2026-08-01', end: '2026-08-07',
  });
  assert.equal(normaliseFilters({ range: 'custom', start: 'yesterday', end: '2026-08-07' }).start, '');
  // A stale custom date on a preset range would be sent and silently ignored.
  assert.equal(normaliseFilters({ range: '7d', start: '2026-08-01', end: '2026-08-07' }).start, '');
});

test('corrupt storage costs the shortcuts, not the tab', () => {
  assert.deepEqual(parseViews('not json'), []);
  assert.deepEqual(parseViews('{"not":"an array"}'), []);
  assert.deepEqual(parseViews('[{"name":"   "}]'), []);
});

test('saving the same name twice replaces rather than duplicates', () => {
  let views = upsertView([], 'Launch week', { range: 'custom', start: '2026-08-01', end: '2026-08-07' });
  views = upsertView(views, 'launch WEEK', { range: '7d', compare: 'off' });
  assert.equal(views.length, 1);
  assert.equal(views[0].filters.range, '7d');
});

test('the newest view is first, and the list is capped', () => {
  let views = [];
  for (let index = 0; index < 20; index += 1) views = upsertView(views, `View ${index}`, { range: '7d' });
  assert.equal(views.length, 12);
  assert.equal(views[0].name, 'View 19');
});

test('a view is removed by name, case-insensitively', () => {
  const views = upsertView([], 'Launch week', { range: '7d' });
  assert.deepEqual(removeView(views, 'LAUNCH WEEK'), []);
  assert.equal(removeView(views, 'other').length, 1);
});

test('storage that throws reads as absent and reports a failed write', () => {
  const hostile = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
  };
  assert.equal(readStored(hostile, 'k', 'fallback'), 'fallback');
  assert.equal(writeStored(hostile, 'k', 'v'), false);
  assert.equal(readStored(undefined, 'k', 'fallback'), 'fallback');
});

test('a missing key reads as the fallback, and an empty string is a real value', () => {
  const store = new Map([['empty', '']]);
  const storage = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, value) };
  assert.equal(readStored(storage, 'missing', 'fallback'), 'fallback');
  assert.equal(readStored(storage, 'empty', 'fallback'), '');
  assert.equal(writeStored(storage, 'k', 'v'), true);
});
