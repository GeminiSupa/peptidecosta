import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REVIEW_SETTINGS,
  normalizeReviewSettings as norm,
} from '../src/lib/reviewSettings.mjs';

test('nothing saved and nothing in the environment gives the defaults', () => {
  assert.deepEqual(norm(null, {}), DEFAULT_REVIEW_SETTINGS);
  assert.deepEqual(norm({}, {}), DEFAULT_REVIEW_SETTINGS);
  assert.deepEqual(norm(undefined, {}), DEFAULT_REVIEW_SETTINGS);
});

test('the saved row wins over the environment', () => {
  const s = norm({ googleSharePct: 70 }, { REVIEW_GOOGLE_SHARE: '20' });
  assert.equal(s.googleSharePct, 70);
});

test('an environment variable still applies where the row says nothing', () => {
  // These were the only control until the panel existed; a value already set in
  // Vercel must not be silently overruled by a default.
  const s = norm({}, { REVIEW_TRUSTPILOT_MONTHLY_CAP: '200', REVIEW_REQUEST_DELAY_DAYS: '4' });
  assert.equal(s.trustpilotMonthlyCap, 200);
  assert.equal(s.waitDays, 4);
});

test('numbers are clamped to something sane', () => {
  assert.equal(norm({ googleSharePct: 150 }, {}).googleSharePct, 100);
  assert.equal(norm({ googleSharePct: -5 }, {}).googleSharePct, 0);
  assert.equal(norm({ waitDays: -1 }, {}).waitDays, 0);
  assert.equal(norm({ waitDays: 5000 }, {}).waitDays, 365);
  assert.equal(norm({ maxAsksWithoutClick: 0 }, {}).maxAsksWithoutClick, 1);
  assert.equal(norm({ trustpilotMonthlyCap: -10 }, {}).trustpilotMonthlyCap, 0);
});

test('a typo falls back to the default rather than to zero', () => {
  // "18O" instead of "180" must not start asking every customer every day.
  assert.equal(norm({ reaskAfterDays: '18O' }, {}).reaskAfterDays, 180);
  assert.equal(norm({ trustpilotMonthlyCap: 'fifty' }, {}).trustpilotMonthlyCap, 50);
  assert.equal(norm({ waitDays: 'two' }, {}).waitDays, 2);
});

test('a decimal is rounded, not truncated to nonsense', () => {
  assert.equal(norm({ waitDays: 2.6 }, {}).waitDays, 3);
  assert.equal(norm({ googleSharePct: '62.4' }, {}).googleSharePct, 62);
});

test('trigger statuses accept a list or a comma string', () => {
  assert.deepEqual(norm({ triggerStatuses: ['Shipped', 'Completed'] }, {}).triggerStatuses, ['Shipped', 'Completed']);
  assert.deepEqual(norm({ triggerStatuses: 'Shipped, Completed' }, {}).triggerStatuses, ['Shipped', 'Completed']);
  assert.deepEqual(norm({ triggerStatuses: ['Paid', 'Paid', ' Paid '] }, {}).triggerStatuses, ['Paid'], 'duplicates collapse');
});

test('clearing every status falls back rather than silencing all reviews', () => {
  // An empty list matches no order at all, which is never what clearing a box
  // is meant to do.
  assert.deepEqual(norm({ triggerStatuses: [] }, {}).triggerStatuses, DEFAULT_REVIEW_SETTINGS.triggerStatuses);
  assert.deepEqual(norm({ triggerStatuses: ['', '  '] }, {}).triggerStatuses, DEFAULT_REVIEW_SETTINGS.triggerStatuses);
});

test('only real http links are kept', () => {
  assert.equal(norm({ googleReviewUrl: 'https://g.page/r/X/review' }, {}).googleReviewUrl, 'https://g.page/r/X/review');
  assert.equal(norm({ googleReviewUrl: 'not a url' }, {}).googleReviewUrl, '');
  assert.equal(norm({ googleReviewUrl: 'javascript:alert(1)' }, {}).googleReviewUrl, '', 'no script urls');
  assert.equal(norm({ facebookReviewUrl: '' }, {}).facebookReviewUrl, '');
});

test('a blank link means "use the site links", not "no link"', () => {
  const s = norm({ googleReviewUrl: '' }, {});
  assert.equal(s.googleReviewUrl, '', 'blank is passed through for the caller to fall back on');
});

test('the shape is always complete, whatever was saved', () => {
  const s = norm({ nonsense: true, googleSharePct: 30 }, {});
  for (const key of Object.keys(DEFAULT_REVIEW_SETTINGS)) {
    assert.ok(key in s, `${key} must always be present`);
  }
  assert.equal('nonsense' in s, false, 'unknown keys are dropped');
});

test('a cap of 0 is honoured, not treated as unset', () => {
  // 0 means "send nothing to Trustpilot", which is a real choice.
  assert.equal(norm({ trustpilotMonthlyCap: 0 }, {}).trustpilotMonthlyCap, 0);
  assert.equal(norm({ googleSharePct: 0 }, {}).googleSharePct, 0);
});
