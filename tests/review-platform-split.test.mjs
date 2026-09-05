import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRUSTPILOT_MONTHLY_CAP,
  DEFAULT_TRUSTPILOT_SHARE,
  orderBucket,
  pickReviewPlatform,
  trustpilotMonthlyCap,
  trustpilotShare,
} from '../src/lib/reviewPlatformSplit.mjs';

const at = (share) => ({ REVIEW_TRUSTPILOT_SHARE: String(share) });

test('an unset share splits the volume evenly', () => {
  assert.equal(trustpilotShare({}), 50);
  assert.equal(trustpilotShare({}), DEFAULT_TRUSTPILOT_SHARE);
});

test('the share is read from the environment and clamped', () => {
  assert.equal(trustpilotShare(at(70)), 70);
  assert.equal(trustpilotShare(at(0)), 0);
  assert.equal(trustpilotShare(at(100)), 100);
  assert.equal(trustpilotShare(at(140)), 100);
  assert.equal(trustpilotShare(at(-20)), 0);
  assert.equal(trustpilotShare(at('  65  ')), 65);
  assert.equal(trustpilotShare(at('62.6')), 63);
});

test('a typo falls back to the default, never to zero', () => {
  // Reading "" or "abc" as 0 would quietly move every customer to Google.
  assert.equal(trustpilotShare(at('abc')), DEFAULT_TRUSTPILOT_SHARE);
  assert.equal(trustpilotShare(at('')), DEFAULT_TRUSTPILOT_SHARE);
  assert.equal(trustpilotShare({}), DEFAULT_TRUSTPILOT_SHARE);
});

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

test('0 and 100 are absolute, with no order slipping through', () => {
  for (let i = 0; i < 300; i += 1) {
    const order = { order_number: `WPCR-${i}` };
    assert.equal(pickReviewPlatform(order, at(100)), 'trustpilot');
    assert.equal(pickReviewPlatform(order, at(0)), 'google');
  }
});

test('the same order always gets the same platform', () => {
  const order = { order_number: 'CARD-MTNBQPL4' };
  const first = pickReviewPlatform(order, at(50));
  for (let i = 0; i < 20; i += 1) {
    assert.equal(pickReviewPlatform(order, at(50)), first);
  }
});

test('id stands in when an order has no number', () => {
  const byId = pickReviewPlatform({ id: 'abc-123' }, at(50));
  assert.equal(pickReviewPlatform({ id: 'abc-123' }, at(50)), byId);
  assert.ok(byId === 'trustpilot' || byId === 'google');
});

test('the real split lands near the configured share', () => {
  // Order numbers shaped like production's: a fixed prefix plus a short
  // base-36 tail. A weak hash clumps these; this is the guard against that.
  const orders = [];
  for (let i = 0; i < 2000; i += 1) {
    orders.push({ order_number: `WPCR-MT${(i + 100000).toString(36).toUpperCase()}` });
  }

  for (const share of [25, 50, 70]) {
    const tp = orders.filter((o) => pickReviewPlatform(o, at(share)) === 'trustpilot').length;
    const pct = (tp / orders.length) * 100;
    assert.ok(
      Math.abs(pct - share) <= 4,
      `share ${share}% produced ${pct.toFixed(1)}% Trustpilot, outside the 4-point tolerance`,
    );
  }
});

test('every order gets exactly one platform', () => {
  for (let i = 0; i < 200; i += 1) {
    const p = pickReviewPlatform({ order_number: `X-${i}` }, at(50));
    assert.ok(p === 'trustpilot' || p === 'google');
  }
});

// ── the monthly Trustpilot cap ───────────────────────────────────────────────

const capped = (cap, share = 50) => ({
  REVIEW_TRUSTPILOT_MONTHLY_CAP: String(cap),
  REVIEW_TRUSTPILOT_SHARE: String(share),
});

test('the cap defaults to the free plan allowance', () => {
  assert.equal(trustpilotMonthlyCap({}), 50);
  assert.equal(trustpilotMonthlyCap({}), DEFAULT_TRUSTPILOT_MONTHLY_CAP);
  assert.equal(trustpilotMonthlyCap({ REVIEW_TRUSTPILOT_MONTHLY_CAP: '250' }), 250);
  assert.equal(trustpilotMonthlyCap({ REVIEW_TRUSTPILOT_MONTHLY_CAP: '-5' }), 0);
  assert.equal(trustpilotMonthlyCap({ REVIEW_TRUSTPILOT_MONTHLY_CAP: 'oops' }), DEFAULT_TRUSTPILOT_MONTHLY_CAP);
});

test('once the month is spent every order goes to Google', () => {
  // The real shape of the problem: ~300 completions a month against a cap of 50.
  for (let i = 0; i < 300; i += 1) {
    const order = { order_number: `WPCR-CAP${i}` };
    assert.equal(pickReviewPlatform(order, capped(50), { trustpilotThisMonth: 50 }), 'google');
    assert.equal(pickReviewPlatform(order, capped(50), { trustpilotThisMonth: 517 }), 'google');
  }
});

test('below the cap the ratio still decides', () => {
  const orders = [];
  for (let i = 0; i < 400; i += 1) orders.push({ order_number: `WPCR-UNDER${i}` });
  const tp = orders.filter(
    (o) => pickReviewPlatform(o, capped(50), { trustpilotThisMonth: 0 }) === 'trustpilot',
  ).length;
  assert.ok(tp > 0, 'Trustpilot still gets orders while there is room');
  assert.ok(tp < orders.length, 'and Google still gets its half');
});

test('the boundary is exact: the cap-th invitation is the last one', () => {
  // A Trustpilot-bucket order, so only the cap can move it.
  const order = [...Array(200).keys()]
    .map((i) => ({ order_number: `WPCR-B${i}` }))
    .find((o) => pickReviewPlatform(o, capped(50), { trustpilotThisMonth: 0 }) === 'trustpilot');
  assert.ok(order, 'guard: found an order in the Trustpilot half');

  assert.equal(pickReviewPlatform(order, capped(50), { trustpilotThisMonth: 49 }), 'trustpilot');
  assert.equal(pickReviewPlatform(order, capped(50), { trustpilotThisMonth: 50 }), 'google');
});

test('a cap of 0 turns Trustpilot off entirely', () => {
  for (let i = 0; i < 100; i += 1) {
    assert.equal(
      pickReviewPlatform({ order_number: `Z-${i}` }, capped(0, 100), { trustpilotThisMonth: 0 }),
      'google',
    );
  }
});

test('an unknown count does not silently spend the allowance', () => {
  // null means the lookup failed. The route's own fallback over-counts, so the
  // safe reading here is "there is room" — but it must not throw or return junk.
  for (const unknown of [null, undefined, NaN, 'abc']) {
    const p = pickReviewPlatform({ order_number: 'WPCR-X' }, capped(50), { trustpilotThisMonth: unknown });
    assert.ok(p === 'trustpilot' || p === 'google');
  }
  assert.equal(pickReviewPlatform({ order_number: 'WPCR-X' }, capped(50), {}), pickReviewPlatform({ order_number: 'WPCR-X' }, capped(50), { trustpilotThisMonth: null }));
});

test('the cap outranks a 100% Trustpilot share', () => {
  assert.equal(
    pickReviewPlatform({ order_number: 'WPCR-ALL' }, capped(50, 100), { trustpilotThisMonth: 50 }),
    'google',
  );
});
