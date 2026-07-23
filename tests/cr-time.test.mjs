import test from 'node:test';
import assert from 'node:assert/strict';
import { crWallToIso, isoToCrWall, crEndOfDayIso, crStartOfDayIso } from '../src/lib/crTime.mjs';

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

test('garbage in, null out', () => {
  assert.equal(crWallToIso(''), null);
  assert.equal(crWallToIso('not a date'), null);
  assert.equal(isoToCrWall(null), '');
  assert.equal(crEndOfDayIso(''), null);
});
