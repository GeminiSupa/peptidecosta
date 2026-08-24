import test from 'node:test';
import assert from 'node:assert/strict';
import { crWallToIso, isoToCrWall, crEndOfDayIso, crStartOfDayIso, crHourAndDay, formatCrDate } from '../src/lib/crTime.mjs';

test('CR midnight Saturday stores as 05:59 UTC Sunday', () => {
  assert.equal(crEndOfDayIso('2026-07-25'), '2026-07-26T05:59:59.999Z');
});

test('typed CR wall time converts to the right instant', () => {
  // 23:59 Saturday in CR (UTC-6) is 05:59 Sunday UTC
  assert.equal(crWallToIso('2026-07-25T23:59'), '2026-07-26T05:59:00.000Z');
  // 08:00 in CR is 14:00 UTC
  assert.equal(crWallToIso('2026-07-22T08:00'), '2026-07-22T14:00:00.000Z');
});

test('stored instants display back as CR wall time', () => {
  assert.equal(isoToCrWall('2026-07-26T05:59:00.000Z'), '2026-07-25T23:59');
  assert.equal(isoToCrWall('2026-07-22T14:37:00+00:00'), '2026-07-22T08:37');
});

test('round-trips cleanly', () => {
  const wall = '2026-07-25T18:30';
  assert.equal(isoToCrWall(crWallToIso(wall)), wall);
});

test('start of day is 06:00 UTC that day', () => {
  assert.equal(crStartOfDayIso('2026-07-25'), '2026-07-25T06:00:00.000Z');
});

test('does not depend on the machine timezone it runs on', () => {
  // The exact bug being fixed: the old code used new Date(wall).toISOString(),
  // whose answer changed with the admin's browser timezone. These helpers use
  // a fixed offset, so the same input gives the same instant everywhere.
  const before = process.env.TZ;
  try {
    for (const tz of ['Asia/Karachi', 'America/Costa_Rica', 'UTC']) {
      process.env.TZ = tz;
      assert.equal(crWallToIso('2026-07-25T23:59'), '2026-07-26T05:59:00.000Z', `TZ=${tz}`);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test('the live chat reads the CR hour and weekday off the same instant', () => {
  // 05:59 UTC Sunday is still 23:59 Saturday in Costa Rica. Reading the day
  // from the UTC date would put the chat on Sunday's schedule an hour early.
  assert.deepEqual(crHourAndDay('2026-07-26T05:59:00.000Z'), { hour: 23, day: 6 });
  // One minute later it really is Sunday in CR.
  assert.deepEqual(crHourAndDay('2026-07-26T06:00:00.000Z'), { hour: 0, day: 0 });
  assert.deepEqual(crHourAndDay('2026-07-22T14:00:00.000Z'), { hour: 8, day: 3 });

  // The widget passes these straight through as "unknown", which keeps the
  // chat online rather than guessing a day.
  for (const bad of [null, undefined, '', 'not a date']) {
    assert.deepEqual(crHourAndDay(bad), { hour: null, day: null }, `${JSON.stringify(bad)}`);
  }
});

test('the CR hour and weekday do not depend on the machine timezone', () => {
  const before = process.env.TZ;
  try {
    for (const tz of ['Asia/Karachi', 'Pacific/Kiritimati', 'UTC']) {
      process.env.TZ = tz;
      assert.deepEqual(crHourAndDay('2026-07-26T05:59:00.000Z'), { hour: 23, day: 6 }, `TZ=${tz}`);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test('garbage in, null out', () => {
  assert.equal(crWallToIso(''), null);
  assert.equal(crWallToIso('not a date'), null);
  assert.equal(isoToCrWall(null), '');
  assert.equal(crEndOfDayIso(''), null);
});

test('preview line confirms the CR meaning in 24-hour clock', async () => {
  const { formatCrWall } = await import('../src/lib/crTime.mjs');
  const text = formatCrWall('2026-07-25T23:59');
  assert.match(text, /23:59/, 'must be 24-hour, never 11:59 PM');
  assert.match(text, /25/);
  assert.match(text, /Costa Rica/);
  assert.equal(formatCrWall(''), '');
});

// ------------------------------------------------- the list and the tile agree

test('a late-evening CR order is not dated tomorrow for an admin who is ahead', () => {
  // The real one: order WPCR-MT6T71IR was completed 2026-08-24T05:42Z, which is
  // 23:42 on the 23rd in Costa Rica. The orders list read the browser clock, so
  // an admin in Pakistan (UTC+5) saw "Aug 24, 10:42" while Revenue Today - which
  // has always counted the Costa Rican day - correctly left it in the 23rd.
  const instant = '2026-08-24T05:42:00Z';

  const label = formatCrDate(instant, { month: 'short', day: 'numeric' });
  assert.equal(label, 'Aug 23', 'the list must name the day the tile counted');
});

test('the CR date holds whatever timezone the reader is in', () => {
  // Same instant, formatted the old way in two places, gives two answers; this
  // one gives the same answer everywhere because the zone is fixed.
  const instant = '2026-08-24T05:42:00Z';

  assert.equal(formatCrDate(instant, { day: 'numeric' }), '23');
  assert.equal(formatCrDate(new Date(instant), { day: 'numeric' }), '23', 'a Date works too');
});

test('an hour either side of CR midnight lands on the right day', () => {
  // CR midnight on the 24th is 06:00Z.
  assert.equal(formatCrDate('2026-08-24T05:59:59Z', { month: 'short', day: 'numeric' }), 'Aug 23');
  assert.equal(formatCrDate('2026-08-24T06:00:01Z', { month: 'short', day: 'numeric' }), 'Aug 24');
});

test('a missing or unreadable date is blank, not "Invalid Date"', () => {
  for (const bad of [null, undefined, '', 'not-a-date']) {
    assert.equal(formatCrDate(bad), '', String(bad));
  }
});
