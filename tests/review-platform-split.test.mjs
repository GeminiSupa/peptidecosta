import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GOOGLE_SHARE,
  DEFAULT_TRUSTPILOT_MONTHLY_CAP,
  googleShare,
  orderBucket,
  pickReviewPlatform,
  pickSocialPlatform,
  trustpilotMonthlyCap,
} from '../src/lib/reviewPlatformSplit.mjs';

const at = (share) => ({ REVIEW_GOOGLE_SHARE: String(share) });
const capped = (cap, share = 50) => ({
  REVIEW_TRUSTPILOT_MONTHLY_CAP: String(cap),
  REVIEW_GOOGLE_SHARE: String(share),
});

// ── the Google / Facebook ratio ──────────────────────────────────────────────

test('an unset ratio divides Google and Facebook evenly', () => {
  assert.equal(googleShare({}), 50);
  assert.equal(googleShare({}), DEFAULT_GOOGLE_SHARE);
});

test('the ratio is read from the environment and clamped', () => {
  assert.equal(googleShare(at(70)), 70);
  assert.equal(googleShare(at(0)), 0);
  assert.equal(googleShare(at(100)), 100);
  assert.equal(googleShare(at(140)), 100);
  assert.equal(googleShare(at(-20)), 0);
  assert.equal(googleShare(at('62.6')), 63);
});

test('a typo falls back to the default, never to zero', () => {
  // Reading "abc" as 0 would quietly move every customer to Facebook.
  assert.equal(googleShare(at('abc')), DEFAULT_GOOGLE_SHARE);
  assert.equal(googleShare({}), DEFAULT_GOOGLE_SHARE);
});

test('0 and 100 are absolute, with no order slipping through', () => {
  for (let i = 0; i < 300; i += 1) {
    const order = { order_number: `WPCR-${i}` };
    assert.equal(pickSocialPlatform(order, at(100)), 'google');
    assert.equal(pickSocialPlatform(order, at(0)), 'facebook');
  }
});

test('the real split lands near the configured ratio', () => {
  // Order numbers shaped like production's: a fixed prefix plus a short
  // base-36 tail. A weak hash clumps these; this is the guard against that.
  const orders = [];
  for (let i = 0; i < 2000; i += 1) {
    orders.push({ order_number: `WPCR-MT${(i + 100000).toString(36).toUpperCase()}` });
  }
  for (const share of [25, 50, 70]) {
    const google = orders.filter((o) => pickSocialPlatform(o, at(share)) === 'google').length;
    const pct = (google / orders.length) * 100;
    assert.ok(
      Math.abs(pct - share) <= 4,
      `share ${share}% produced ${pct.toFixed(1)}% Google, outside the 4-point tolerance`,
    );
  }
});

test('the same order always gets the same site', () => {
  const order = { order_number: 'CARD-MTNBQPL4' };
  const first = pickSocialPlatform(order, at(50));
  for (let i = 0; i < 20; i += 1) assert.equal(pickSocialPlatform(order, at(50)), first);
});

// ── buckets ─────────────────────────────────────────────────────────────────

test('the bucket is stable for the same order', () => {
  const first = orderBucket('WPCR-MTNGF4MQ');
  assert.equal(orderBucket('WPCR-MTNGF4MQ'), first);
  assert.equal(orderBucket('wpcr-mtngf4mq'), first, 'case must not change the bucket');
  assert.equal(orderBucket(' WPCR-MTNGF4MQ '), first, 'padding must not change the bucket');
});

test('buckets stay inside 0-99', () => {
  for (let i = 0; i < 500; i += 1) {
    const b = orderBucket(`CARD-${i}`);
    assert.ok(Number.isInteger(b) && b >= 0 && b < 100, `bucket out of range: ${b}`);
  }
});

test('a missing reference does not throw', () => {
  assert.equal(orderBucket(''), 0);
  assert.equal(orderBucket(null), 0);
  assert.equal(orderBucket(undefined), 0);
});

// ── Trustpilot: capped, not shared ───────────────────────────────────────────

test('the cap defaults to the free plan allowance', () => {
  assert.equal(trustpilotMonthlyCap({}), 50);
  assert.equal(trustpilotMonthlyCap({}), DEFAULT_TRUSTPILOT_MONTHLY_CAP);
  assert.equal(trustpilotMonthlyCap({ REVIEW_TRUSTPILOT_MONTHLY_CAP: '250' }), 250);
  assert.equal(trustpilotMonthlyCap({ REVIEW_TRUSTPILOT_MONTHLY_CAP: '-5' }), 0);
  assert.equal(trustpilotMonthlyCap({ REVIEW_TRUSTPILOT_MONTHLY_CAP: 'oops' }), DEFAULT_TRUSTPILOT_MONTHLY_CAP);
});

test('Trustpilot takes orders while the month has room', () => {
  const order = { order_number: 'WPCR-ROOM' };
  assert.equal(pickReviewPlatform(order, capped(50), { trustpilotThisMonth: 0 }), 'trustpilot');
  assert.equal(pickReviewPlatform(order, capped(50), { trustpilotThisMonth: 49 }), 'trustpilot');
});

test('once the month is spent, everyone goes to Google or Facebook', () => {
  // The real shape of the problem: ~300 completions a month against a cap of 50.
  for (let i = 0; i < 300; i += 1) {
    const order = { order_number: `WPCR-CAP${i}` };
    const picked = pickReviewPlatform(order, capped(50), { trustpilotThisMonth: 50 });
    assert.notEqual(picked, 'trustpilot');
    assert.ok(picked === 'google' || picked === 'facebook');
  }
});

test('past the cap the Google/Facebook ratio takes over', () => {
  const orders = [];
  for (let i = 0; i < 600; i += 1) orders.push({ order_number: `WPCR-OVER${i}` });
  const google = orders.filter(
    (o) => pickReviewPlatform(o, capped(50, 70), { trustpilotThisMonth: 999 }) === 'google',
  ).length;
  const pct = (google / orders.length) * 100;
  assert.ok(Math.abs(pct - 70) <= 6, `expected roughly 70% Google past the cap, got ${pct.toFixed(1)}%`);
});

test('a cap of 0 turns Trustpilot off entirely', () => {
  for (let i = 0; i < 100; i += 1) {
    assert.notEqual(
      pickReviewPlatform({ order_number: `Z-${i}` }, capped(0), { trustpilotThisMonth: 0 }),
      'trustpilot',
    );
  }
});

test('an unknown count is treated as room, not as a spent month', () => {
  // The route's own fallback over-counts rather than under-counts, so an
  // unknown here must not throw or return junk.
  for (const unknown of [null, undefined, NaN, 'abc']) {
    const p = pickReviewPlatform({ order_number: 'WPCR-X' }, capped(50), { trustpilotThisMonth: unknown });
    assert.ok(['trustpilot', 'google', 'facebook'].includes(p));
  }
});

test('every order gets exactly one site', () => {
  for (let i = 0; i < 200; i += 1) {
    const p = pickReviewPlatform({ order_number: `X-${i}` }, capped(50), { trustpilotThisMonth: 100 });
    assert.ok(['trustpilot', 'google', 'facebook'].includes(p));
  }
});
