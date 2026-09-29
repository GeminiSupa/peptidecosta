import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nextReleaseBatch,
  recoverableCustomers,
  roomLeftThisMonth,
  splitTrustpilotDelivery,
} from '../src/lib/reviewDelivery.mjs';
import { dailyReviewSeries } from '../src/lib/reviewStats.mjs';

const NOW = Date.parse('2026-09-29T12:00:00Z');

const ask = (email, askedAt, platforms = ['trustpilot'], extra = {}) => ({
  id: `${email}-${askedAt}`,
  customer_email: email,
  platforms,
  asked_at: askedAt,
  clicked_platform: null,
  order_number: 'WPCR-TEST',
  released_at: null,
  ...extra,
});

test('the first invitations of a month are the ones the plan delivered', () => {
  const rows = [
    ask('a@x.com', '2026-08-01T10:00:00Z'),
    ask('b@x.com', '2026-08-02T10:00:00Z'),
    ask('c@x.com', '2026-08-03T10:00:00Z'),
  ];

  const { months, delivered, undelivered } = splitTrustpilotDelivery(rows, {
    pastAllowance: 2, currentAllowance: 100, now: NOW,
  });

  assert.equal(months.length, 1);
  assert.deepEqual(
    { sent: months[0].sent, allowance: months[0].allowance, undelivered: months[0].undelivered },
    { sent: 3, allowance: 2, undelivered: 1 },
  );
  assert.deepEqual(delivered.map((r) => r.customer_email), ['a@x.com', 'b@x.com']);
  assert.deepEqual(undelivered.map((r) => r.customer_email), ['c@x.com']);
});

test('the current month is measured against the live cap, not the old allowance', () => {
  const rows = [
    ask('a@x.com', '2026-09-01T10:00:00Z'),
    ask('b@x.com', '2026-09-02T10:00:00Z'),
    ask('c@x.com', '2026-09-03T10:00:00Z'),
  ];

  const { months } = splitTrustpilotDelivery(rows, {
    pastAllowance: 1, currentAllowance: 100, now: NOW,
  });

  assert.equal(months[0].isCurrentMonth, true);
  assert.equal(months[0].allowance, 100);
  assert.equal(months[0].undelivered, 0);
});

test('a customer who got a real invitation is never released', () => {
  // Two asks in the same month, allowance 1: the first was delivered. Both
  // belong to the same person, so nothing about them is a phantom.
  const rows = [
    ask('repeat@x.com', '2026-08-01T10:00:00Z'),
    ask('repeat@x.com', '2026-08-20T10:00:00Z'),
  ];

  const { ready, waiting } = recoverableCustomers(rows, {
    pastAllowance: 1, currentAllowance: 100, now: NOW,
  });

  assert.deepEqual(ready, []);
  assert.deepEqual(waiting, []);
});

test('a customer whose every invitation was dropped is recoverable', () => {
  const rows = [
    ask('lucky@x.com', '2026-08-01T10:00:00Z'),
    ask('lost@x.com', '2026-08-02T10:00:00Z'),
    ask('lost@x.com', '2026-08-25T10:00:00Z'),
  ];

  const { ready } = recoverableCustomers(rows, {
    pastAllowance: 1, currentAllowance: 100, now: NOW,
  });

  assert.deepEqual(ready.map((c) => c.email), ['lost@x.com']);
  // Both of their rows come back, so the release leaves nothing behind that
  // would still read as "already asked".
  assert.equal(ready[0].rowIds.length, 2);
});

test('an already released row does not come back a second time', () => {
  const rows = [
    ask('a@x.com', '2026-08-01T10:00:00Z'),
    ask('done@x.com', '2026-08-02T10:00:00Z', ['trustpilot'], { released_at: '2026-09-20T00:00:00Z' }),
  ];

  const { ready } = recoverableCustomers(rows, {
    pastAllowance: 1, currentAllowance: 100, now: NOW,
  });

  assert.deepEqual(ready.map((c) => c.email), []);
});

test('someone asked on Google recently is held back, not offered as ready', () => {
  const rows = [
    ask('a@x.com', '2026-08-01T10:00:00Z'),
    ask('gap@x.com', '2026-08-02T10:00:00Z'),
    ask('gap@x.com', '2026-09-20T10:00:00Z', ['google']),
  ];

  const { ready, waiting } = recoverableCustomers(rows, {
    pastAllowance: 1, currentAllowance: 100, reaskAfterDays: 180, now: NOW,
  });

  assert.deepEqual(ready.map((c) => c.email), []);
  assert.deepEqual(waiting.map((c) => c.email), ['gap@x.com']);
});

test('newest customers are released first', () => {
  const rows = [
    ask('keep@x.com', '2026-07-01T10:00:00Z'),
    ask('older@x.com', '2026-07-10T10:00:00Z'),
    ask('newer@x.com', '2026-07-20T10:00:00Z'),
  ];

  const { ready } = recoverableCustomers(rows, {
    pastAllowance: 1, currentAllowance: 100, now: NOW,
  });

  assert.deepEqual(ready.map((c) => c.email), ['newer@x.com', 'older@x.com']);

  const batch = nextReleaseBatch(ready, 1);
  assert.deepEqual(batch.emails, ['newer@x.com']);
  assert.equal(batch.rowIds.length, 1);
});

test('a batch larger than the queue releases the queue, not more', () => {
  const ready = [{ email: 'a@x.com', rowIds: ['1'] }, { email: 'b@x.com', rowIds: ['2', '3'] }];
  const batch = nextReleaseBatch(ready, 99);
  assert.deepEqual(batch.emails, ['a@x.com', 'b@x.com']);
  assert.deepEqual(batch.rowIds, ['1', '2', '3']);
});

test('room left never goes negative when the month has overrun', () => {
  assert.equal(roomLeftThisMonth(120, 100), 0);
  assert.equal(roomLeftThisMonth(66, 100), 34);
  assert.equal(roomLeftThisMonth(0, 0), 0);
});

test('the daily series shows the days nothing was sent', () => {
  const rows = [
    ask('a@x.com', '2026-09-27T18:00:00Z'),
    ask('b@x.com', '2026-09-29T15:00:00Z', ['google'], { clicked_platform: 'google', clicked_at: '2026-09-29T16:00:00Z' }),
  ];

  const series = dailyReviewSeries(rows, { days: 5, now: NOW });

  assert.equal(series.length, 5);
  // Every day in the window is present, including the empty ones — the whole
  // point, since a gap is what a total cannot show.
  const byDate = Object.fromEntries(series.map((d) => [d.date, d]));
  assert.equal(byDate['2026-09-27'].trustpilot, 1);
  assert.equal(byDate['2026-09-28'].asks, 0);
  assert.equal(byDate['2026-09-29'].google, 1);
  assert.equal(byDate['2026-09-29'].clicks, 1);
});

test('days are Costa Rica days, not the reader\'s', () => {
  // 01:00 UTC on the 29th is still 19:00 on the 28th in Costa Rica, and that is
  // the day the business did the work.
  const series = dailyReviewSeries([ask('a@x.com', '2026-09-29T01:00:00Z')], { days: 5, now: NOW });
  const byDate = Object.fromEntries(series.map((d) => [d.date, d]));
  assert.equal(byDate['2026-09-28'].trustpilot, 1);
  assert.equal(byDate['2026-09-29'].trustpilot, 0);
});
