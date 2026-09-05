import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REASK_AFTER_DAYS,
  MAX_ASKS_WITHOUT_A_CLICK,
  decideReviewAsk,
  normaliseCustomerKey,
} from '../src/lib/reviewAskPolicy.mjs';

const NOW = new Date('2026-09-05T12:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const ask = (over) => decideReviewAsk({ now: NOW, env: {}, ...over });

// ── the ordinary path ────────────────────────────────────────────────────────

test('a brand new customer is asked, following the split', () => {
  assert.deepEqual(
    ask({ history: [], firstChoice: 'trustpilot' }),
    { ask: true, platform: 'trustpilot', offer: ['trustpilot'], reason: 'first ask' },
  );
  const g = ask({ history: [], firstChoice: 'google' });
  assert.equal(g.platform, 'google');
  assert.deepEqual(g.offer, ['google', 'facebook']);
});

test('a full Trustpilot month sends a new customer to Google instead', () => {
  const r = ask({ history: [], firstChoice: 'trustpilot', trustpilotHasRoom: false });
  assert.equal(r.platform, 'google');
});

// ── the rule Omer asked for: do not ask the same person again ────────────────

test('a customer asked days ago is not asked again on a new order', () => {
  const r = ask({ history: [{ platforms: ['google', 'facebook'], asked_at: daysAgo(3) }] });
  assert.equal(r.ask, false);
  assert.match(r.reason, /under the 180d gap/);
});

test('the gap is respected right up to its last day', () => {
  const almost = ask({ history: [{ platforms: ['google', 'facebook'], asked_at: daysAgo(DEFAULT_REASK_AFTER_DAYS - 1) }] });
  assert.equal(almost.ask, false);
  const due = ask({ history: [{ platforms: ['google', 'facebook'], asked_at: daysAgo(DEFAULT_REASK_AFTER_DAYS + 1) }] });
  assert.equal(due.ask, true);
});

test('someone who ignored three asks is left alone for good', () => {
  const history = [
    { platforms: ['google', 'facebook'], asked_at: daysAgo(1200) },
    { platforms: ['google', 'facebook'], asked_at: daysAgo(800) },
    { platforms: ['google', 'facebook'], asked_at: daysAgo(400) },
  ];
  assert.equal(history.length, MAX_ASKS_WITHOUT_A_CLICK);
  const r = ask({ history });
  assert.equal(r.ask, false);
  assert.match(r.reason, /ignored 3 asks/);
});

// ── a click earns the next site ──────────────────────────────────────────────

test('clicking Google means the next ask is Facebook only', () => {
  const r = ask({
    history: [{ platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(300) }],
  });
  assert.equal(r.ask, true);
  assert.deepEqual(r.offer, ['facebook'], 'never the site they already used');
});

test('clicking Facebook means the next ask is Google only', () => {
  const r = ask({
    history: [{ platforms: ['google', 'facebook'], clicked_platform: 'facebook', asked_at: daysAgo(300) }],
  });
  assert.deepEqual(r.offer, ['google']);
});

test('having clicked both, Trustpilot is what is left', () => {
  const r = ask({
    history: [
      { platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(700) },
      { platforms: ['facebook'], clicked_platform: 'facebook', asked_at: daysAgo(300) },
    ],
  });
  assert.equal(r.platform, 'trustpilot');
});

test('with every site used up, nobody is asked again', () => {
  const history = [
    { platforms: ['trustpilot'], asked_at: daysAgo(900) },
    { platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(600) },
    { platforms: ['facebook'], clicked_platform: 'facebook', asked_at: daysAgo(300) },
  ];
  assert.equal(ask({ history }).ask, false);
});

test('a click does not override the gap', () => {
  const r = ask({
    history: [{ platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(10) }],
  });
  assert.equal(r.ask, false, 'engaged customers are not chased either');
});

// ── the Trustpilot blind spot ────────────────────────────────────────────────

test('a Trustpilot ask does not count as ignored, since a click was invisible', () => {
  const r = ask({ history: [{ platforms: ['trustpilot'], asked_at: daysAgo(300) }] });
  assert.equal(r.ask, true);
  assert.equal(r.platform, 'google');
  assert.match(r.reason, /unknowable/);
});

test('after the Trustpilot concession the normal limit applies', () => {
  const history = [
    { platforms: ['trustpilot'], asked_at: daysAgo(1200) },
    { platforms: ['google', 'facebook'], asked_at: daysAgo(900) },
  ];
  const r = ask({ history });
  assert.equal(r.ask, true, 'one ignored non-Trustpilot ask still allows the next');

  const three = [...history, { platforms: ['google', 'facebook'], asked_at: daysAgo(600) }];
  assert.equal(ask({ history: three }).ask, true, 'and the third');

  const four = [...three, { platforms: ['google', 'facebook'], asked_at: daysAgo(300) }];
  assert.equal(ask({ history: four }).ask, false, 'three ignored asks ends it');
});

test('two Trustpilot asks still only earn one Google ask', () => {
  const r = ask({
    history: [
      { platforms: ['trustpilot'], asked_at: daysAgo(900) },
      { platforms: ['trustpilot'], asked_at: daysAgo(400) },
    ],
  });
  assert.equal(r.ask, true);
  assert.equal(r.platform, 'google');
});

test('Trustpilot is never offered twice', () => {
  const r = ask({
    history: [
      { platforms: ['trustpilot'], asked_at: daysAgo(900) },
      { platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(600) },
      { platforms: ['facebook'], clicked_platform: 'facebook', asked_at: daysAgo(300) },
    ],
  });
  assert.equal(r.ask, false, 'they already had their Trustpilot invitation');
});

// ── edge cases ───────────────────────────────────────────────────────────────

test('history order does not matter', () => {
  const rows = [
    { platforms: ['facebook'], clicked_platform: 'facebook', asked_at: daysAgo(300) },
    { platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(700) },
  ];
  const forwards = ask({ history: rows });
  const backwards = ask({ history: [...rows].reverse() });
  assert.deepEqual(forwards, backwards);
});

test('junk rows are ignored rather than crashing the send', () => {
  const r = ask({
    history: [
      null,
      undefined,
      { platforms: null, asked_at: 'not a date' },
      { asked_at: daysAgo(300) },
      { platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(300) },
    ],
  });
  assert.equal(r.ask, true);
  assert.deepEqual(r.offer, ['facebook']);
});

test('no history at all behaves like a new customer', () => {
  for (const history of [[], null, undefined, 'nonsense']) {
    assert.equal(decideReviewAsk({ history, firstChoice: 'google', now: NOW, env: {} }).ask, true);
  }
});

test('the gap is configurable', () => {
  const history = [{ platforms: ['google', 'facebook'], asked_at: daysAgo(40) }];
  assert.equal(decideReviewAsk({ history, now: NOW, env: {} }).ask, false);
  assert.equal(decideReviewAsk({ history, now: NOW, env: { REVIEW_REASK_AFTER_DAYS: '30' } }).ask, true);
  // A nonsense value must not become "ask everyone constantly".
  assert.equal(decideReviewAsk({ history, now: NOW, env: { REVIEW_REASK_AFTER_DAYS: 'soon' } }).ask, false);
  assert.equal(decideReviewAsk({ history, now: NOW, env: { REVIEW_REASK_AFTER_DAYS: '-9' } }).ask, false);
});

test('a Trustpilot-only customer is not offered Trustpilot again when the month is full', () => {
  const r = ask({
    history: [
      { platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(700) },
      { platforms: ['facebook'], clicked_platform: 'facebook', asked_at: daysAgo(300) },
    ],
    trustpilotHasRoom: false,
  });
  assert.equal(r.ask, false, 'no room this month, and nothing else left to offer');
});

test('the same person is recognised whatever they typed', () => {
  assert.equal(normaliseCustomerKey('  Ana@Example.COM '), 'ana@example.com');
  assert.equal(normaliseCustomerKey(null), '');
  assert.equal(normaliseCustomerKey(undefined), '');
});

test('a decision always names what it offers', () => {
  const cases = [
    { history: [] },
    { history: [{ platforms: ['trustpilot'], asked_at: daysAgo(300) }] },
    { history: [{ platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(300) }] },
  ];
  for (const c of cases) {
    const r = ask(c);
    assert.ok(r.ask === true && r.offer.length > 0, 'an ask always carries at least one site');
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
  }
});

test('the wait after an order is completed is 2 days, and configurable', async () => {
  const { DEFAULT_REQUEST_DELAY_DAYS, reviewRequestDelayDays } = await import('../src/lib/reviewAskPolicy.mjs');
  assert.equal(DEFAULT_REQUEST_DELAY_DAYS, 2);
  assert.equal(reviewRequestDelayDays({}), 2);
  assert.equal(reviewRequestDelayDays({ REVIEW_REQUEST_DELAY_DAYS: '5' }), 5);
  assert.equal(reviewRequestDelayDays({ REVIEW_REQUEST_DELAY_DAYS: '0' }), 0);
  // A nonsense or negative value must not turn into "ask everyone immediately".
  assert.equal(reviewRequestDelayDays({ REVIEW_REQUEST_DELAY_DAYS: '-3' }), 2);
  assert.equal(reviewRequestDelayDays({ REVIEW_REQUEST_DELAY_DAYS: 'soon' }), 2);
});

// ── the ignored-requests flag ────────────────────────────────────────────────

test('three ignored requests flags the customer, two does not', async () => {
  const { reviewIgnoreFlag } = await import('../src/lib/reviewAskPolicy.mjs');
  const ig = (n) => Array.from({ length: n }, (_, i) => ({ platforms: ['google', 'facebook'], asked_at: daysAgo(900 - i * 200) }));

  assert.equal(reviewIgnoreFlag(ig(1)).flagged, false);
  assert.equal(reviewIgnoreFlag(ig(2)).flagged, false);
  assert.equal(reviewIgnoreFlag(ig(3)).flagged, true);
  assert.equal(reviewIgnoreFlag(ig(3)).ignored, 3);
  assert.match(reviewIgnoreFlag(ig(3)).label, /Ignored 3 review requests/);
});

test('a customer who clicked is never flagged', async () => {
  const { reviewIgnoreFlag } = await import('../src/lib/reviewAskPolicy.mjs');
  const rows = [
    { platforms: ['google', 'facebook'], asked_at: daysAgo(900) },
    { platforms: ['google', 'facebook'], asked_at: daysAgo(600) },
    { platforms: ['google', 'facebook'], clicked_platform: 'google', asked_at: daysAgo(300) },
  ];
  assert.equal(reviewIgnoreFlag(rows).flagged, false);
  assert.equal(reviewIgnoreFlag(rows).ignored, 0);
});

test('Trustpilot asks do not count towards the flag', async () => {
  const { reviewIgnoreFlag } = await import('../src/lib/reviewAskPolicy.mjs');
  // Their click would have been invisible, so it is not evidence of ignoring.
  const rows = [
    { platforms: ['trustpilot'], asked_at: daysAgo(900) },
    { platforms: ['trustpilot'], asked_at: daysAgo(600) },
    { platforms: ['trustpilot'], asked_at: daysAgo(300) },
  ];
  assert.equal(reviewIgnoreFlag(rows).flagged, false);
});

test('the flag survives junk and empty history', async () => {
  const { reviewIgnoreFlag } = await import('../src/lib/reviewAskPolicy.mjs');
  for (const h of [[], null, undefined, [null, undefined]]) {
    assert.equal(reviewIgnoreFlag(h).flagged, false);
    assert.equal(reviewIgnoreFlag(h).label, '');
  }
});

test('a third ask is now allowed before stopping', () => {
  const two = [
    { platforms: ['google', 'facebook'], asked_at: daysAgo(900) },
    { platforms: ['google', 'facebook'], asked_at: daysAgo(400) },
  ];
  assert.equal(ask({ history: two }).ask, true, 'the third ask is allowed');
  const three = [...two, { platforms: ['google', 'facebook'], asked_at: daysAgo(200) }];
  assert.equal(ask({ history: three }).ask, false, 'the fourth is not');
});
