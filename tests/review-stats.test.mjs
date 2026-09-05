import test from 'node:test';
import assert from 'node:assert/strict';
import { summariseReviewAsks } from '../src/lib/reviewStats.mjs';

const NOW = new Date('2026-09-05T12:00:00Z').getTime();
const ago = (days) => new Date(NOW - days * 86400000).toISOString();

const ask = (over = {}) => ({
  customer_email: 'a@example.com',
  platforms: ['google'],
  clicked_platform: null,
  asked_at: ago(10),
  ...over,
});

const sum = (rows, opts) => summariseReviewAsks(rows, { now: NOW, ...opts });

test('an empty history does not produce a misleading zero rate', () => {
  const s = sum([]);
  assert.equal(s.totals.asks, 0);
  assert.equal(s.totals.clickRatePct, null, 'no asks means no rate, not 0%');
  assert.deepEqual(s.flagged, []);
});

test('the click rate ignores Trustpilot in its denominator', () => {
  // The crux: Trustpilot clicks are invisible, so counting those asks would
  // make a healthy campaign look broken.
  const rows = [
    ask({ platforms: ['trustpilot'], customer_email: 't1@x.com' }),
    ask({ platforms: ['trustpilot'], customer_email: 't2@x.com' }),
    ask({ platforms: ['trustpilot'], customer_email: 't3@x.com' }),
    ask({ platforms: ['google'], customer_email: 'g1@x.com', clicked_platform: 'google' }),
    ask({ platforms: ['google'], customer_email: 'g2@x.com' }),
  ];
  const s = sum(rows);
  assert.equal(s.totals.asks, 5);
  assert.equal(s.totals.trackableAsks, 2, 'only the Google asks can be measured');
  assert.equal(s.totals.clicks, 1);
  assert.equal(s.totals.clickRatePct, 50, 'one click out of two measurable asks');
});

test("Trustpilot's click count is unknown, not zero", () => {
  const s = sum([ask({ platforms: ['trustpilot'] })]);
  assert.equal(s.bySite.trustpilot.asked, 1);
  assert.equal(s.bySite.trustpilot.clicked, null, 'zero would read as "nobody clicked"');
});

test('asks and clicks are counted per site', () => {
  const rows = [
    ask({ customer_email: 'a@x.com', platforms: ['google'], clicked_platform: 'google' }),
    ask({ customer_email: 'b@x.com', platforms: ['facebook'], clicked_platform: 'facebook' }),
    ask({ customer_email: 'c@x.com', platforms: ['facebook'] }),
  ];
  const s = sum(rows);
  assert.equal(s.bySite.google.asked, 1);
  assert.equal(s.bySite.google.clicked, 1);
  assert.equal(s.bySite.facebook.asked, 2);
  assert.equal(s.bySite.facebook.clicked, 1);
});

test('customers are counted once however many times they were asked', () => {
  const rows = [
    ask({ customer_email: 'same@x.com', asked_at: ago(400) }),
    ask({ customer_email: 'same@x.com', asked_at: ago(200) }),
    ask({ customer_email: 'other@x.com' }),
  ];
  assert.equal(sum(rows).totals.customers, 2);
});

test('the same address in different capitals is one customer', () => {
  const rows = [
    ask({ customer_email: 'Ana@Example.com' }),
    ask({ customer_email: 'ana@example.com' }),
  ];
  assert.equal(sum(rows).totals.customers, 1);
});

test('three ignored asks flags the customer', () => {
  const rows = [
    ask({ customer_email: 'quiet@x.com', asked_at: ago(600) }),
    ask({ customer_email: 'quiet@x.com', asked_at: ago(400) }),
    ask({ customer_email: 'quiet@x.com', asked_at: ago(200) }),
  ];
  const s = sum(rows);
  assert.equal(s.flaggedTotal, 1);
  assert.equal(s.flagged[0].email, 'quiet@x.com');
  assert.equal(s.flagged[0].ignored, 3);
  assert.equal(s.flagged[0].lastAskedAt, ago(200), 'the most recent ask, not the first');
});

test('a customer who clicked is never flagged, however many asks', () => {
  const rows = [
    ask({ customer_email: 'keen@x.com', asked_at: ago(600) }),
    ask({ customer_email: 'keen@x.com', asked_at: ago(400) }),
    ask({ customer_email: 'keen@x.com', asked_at: ago(200), clicked_platform: 'google' }),
  ];
  assert.equal(sum(rows).flaggedTotal, 0);
});

test('Trustpilot asks do not push a customer towards the flag', () => {
  const rows = [
    ask({ customer_email: 'tp@x.com', platforms: ['trustpilot'], asked_at: ago(600) }),
    ask({ customer_email: 'tp@x.com', platforms: ['trustpilot'], asked_at: ago(400) }),
    ask({ customer_email: 'tp@x.com', platforms: ['google'], asked_at: ago(200) }),
  ];
  assert.equal(sum(rows).flaggedTotal, 0, 'only one measurable ask was ignored');
});

test('the flag threshold follows the setting', () => {
  const rows = [
    ask({ customer_email: 'q@x.com', asked_at: ago(600) }),
    ask({ customer_email: 'q@x.com', asked_at: ago(400) }),
  ];
  assert.equal(sum(rows).flaggedTotal, 0, 'two is under the default of three');
  assert.equal(sum(rows, { maxAsksWithoutClick: 2 }).flaggedTotal, 1);
});

test("this month's Trustpilot usage counts only this month", () => {
  const rows = [
    ask({ platforms: ['trustpilot'], asked_at: ago(2), customer_email: 'a@x.com' }),
    ask({ platforms: ['trustpilot'], asked_at: ago(3), customer_email: 'b@x.com' }),
    ask({ platforms: ['trustpilot'], asked_at: '2026-07-15T00:00:00Z', customer_email: 'c@x.com' }),
    ask({ platforms: ['google'], asked_at: ago(1), customer_email: 'd@x.com' }),
  ];
  assert.equal(sum(rows).trustpilotThisMonth, 2, 'July does not count towards September');
});

test('recent activity is newest first', () => {
  const rows = [
    ask({ customer_email: 'old@x.com', asked_at: ago(90) }),
    ask({ customer_email: 'new@x.com', asked_at: ago(1) }),
    ask({ customer_email: 'mid@x.com', asked_at: ago(30) }),
  ];
  const emails = sum(rows).recent.map((r) => r.email);
  assert.deepEqual(emails, ['new@x.com', 'mid@x.com', 'old@x.com']);
});

test('junk rows are skipped rather than crashing the dashboard', () => {
  const rows = [null, undefined, {}, { customer_email: 'x@x.com' }, ask()];
  const s = sum(rows);
  assert.equal(s.totals.asks, 1, 'only the row with a date counts');
});

test('a row with no email still counts as an ask but not as a customer', () => {
  const s = sum([ask({ customer_email: '' })]);
  assert.equal(s.totals.asks, 1);
  assert.equal(s.totals.customers, 0);
});
