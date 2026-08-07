import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_LIVE_CHAT_AVAILABILITY,
  formatHour12,
  isLiveChatOnline,
  isWithinSchedule,
  normalizeLiveChatAvailability,
} from '../src/lib/liveChatAvailability.mjs';

test('the hour picker and the visitor copy read an hour the same way', () => {
  // Same function drives the dashboard dropdown and the "open 7am-7pm" line,
  // so the two can never describe the same setting differently.
  assert.equal(formatHour12(0), '12am', 'midnight is 12am, not 0am');
  assert.equal(formatHour12(7), '7am');
  assert.equal(formatHour12(12), '12pm', 'noon is 12pm, not 0pm');
  assert.equal(formatHour12(13), '1pm');
  assert.equal(formatHour12(19), '7pm');
  assert.equal(formatHour12(23), '11pm');
});

test('the hour formatter refuses anything that is not a real hour', () => {
  for (const bad of [-1, 24, 7.5, null, undefined, NaN, 'seven', {}]) {
    assert.equal(formatHour12(bad), '', `${JSON.stringify(bad)} is not an hour`);
  }
  // A numeric string is accepted rather than blanked: a select posts strings,
  // and rendering nothing would be worse than rendering the hour.
  assert.equal(formatHour12('7'), '7am');
});

test('with no setting saved the chat keeps the original 7am-7pm schedule', () => {
  assert.deepEqual(normalizeLiveChatAvailability(undefined), DEFAULT_LIVE_CHAT_AVAILABILITY);
  assert.equal(isLiveChatOnline(undefined, 9), true);
  assert.equal(isLiveChatOnline(undefined, 6), false);
  assert.equal(isLiveChatOnline(undefined, 19), false, '7pm is closing time, not still open');
  assert.equal(isLiveChatOnline(undefined, 18), true);
});

test('the manual toggle overrides the clock in both directions', () => {
  // 3am, but someone is on shift.
  assert.equal(isLiveChatOnline({ mode: 'online' }, 3), true);
  // Midday, but the office is closed for a holiday.
  assert.equal(isLiveChatOnline({ mode: 'offline' }, 12), false);
});

test('auto mode follows hours the superadmin has changed', () => {
  const nightShift = { mode: 'auto', openHour: 9, closeHour: 22 };
  assert.equal(isLiveChatOnline(nightShift, 8), false);
  assert.equal(isLiveChatOnline(nightShift, 9), true);
  assert.equal(isLiveChatOnline(nightShift, 21), true);
  assert.equal(isLiveChatOnline(nightShift, 22), false);
});

test('a broken stored value can never strand the chat offline', () => {
  // An inverted range would make every hour fall outside the window.
  assert.deepEqual(
    normalizeLiveChatAvailability({ mode: 'auto', openHour: 20, closeHour: 6 }),
    DEFAULT_LIVE_CHAT_AVAILABILITY,
  );
  assert.equal(isLiveChatOnline({ mode: 'auto', openHour: 20, closeHour: 6 }, 12), true);

  // Junk of every shape falls back rather than throwing.
  for (const junk of [null, 'offline', 42, [], { mode: 'sometimes' }, { openHour: 'nine' }]) {
    const config = normalizeLiveChatAvailability(junk);
    assert.ok(['auto', 'online', 'offline'].includes(config.mode), `bad mode from ${JSON.stringify(junk)}`);
    assert.ok(config.openHour < config.closeHour, `bad range from ${JSON.stringify(junk)}`);
  }
});

test('an unknown local time leaves the chat online rather than falsely closed', () => {
  // Better to answer a message out of hours than to tell every visitor we are
  // shut because the timezone lookup failed.
  assert.equal(isLiveChatOnline({ mode: 'auto' }, null), true);
  assert.equal(isLiveChatOnline({ mode: 'auto' }, undefined), true);
  assert.equal(isWithinSchedule(NaN, DEFAULT_LIVE_CHAT_AVAILABILITY), true);
});

test('a forced offline still wins when the clock is unknown', () => {
  assert.equal(isLiveChatOnline({ mode: 'offline' }, null), false);
});
