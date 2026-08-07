import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_LIVE_CHAT_AVAILABILITY,
  buildDayEntry,
  formatDayHours,
  formatHour12,
  isLiveChatOnline,
  isWithinSchedule,
  nextOpening,
  normalizeLiveChatAvailability,
  scheduleForDay,
  summarizeSchedule,
} from '../src/lib/liveChatAvailability.mjs';

// 0 is Sunday, matching Date#getDay().
const SUNDAY = 0;
const MONDAY = 1;
const SATURDAY = 6;

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

// --- per-weekday hours -----------------------------------------------------

const WEEK = {
  mode: 'auto',
  openHour: 7,
  closeHour: 19,
  days: {
    [SATURDAY]: { openHour: 9, closeHour: 14 },
    [SUNDAY]: { closed: true },
  },
};

test('a day with its own hours is judged on those, not the shared ones', () => {
  // Saturday is 9am-2pm even though the shop is 7am-7pm the rest of the week.
  assert.equal(isLiveChatOnline(WEEK, 8, SATURDAY), false, '8am is before the short Saturday opens');
  assert.equal(isLiveChatOnline(WEEK, 9, SATURDAY), true);
  assert.equal(isLiveChatOnline(WEEK, 13, SATURDAY), true);
  assert.equal(isLiveChatOnline(WEEK, 14, SATURDAY), false, '2pm is closing time, not still open');
  // The same hours on a day that was never given its own follow 7am-7pm.
  assert.equal(isLiveChatOnline(WEEK, 8, MONDAY), true);
  assert.equal(isLiveChatOnline(WEEK, 18, MONDAY), true);
});

test('a day set to closed is offline at every hour', () => {
  for (const hour of [0, 7, 12, 18, 23]) {
    assert.equal(isLiveChatOnline(WEEK, hour, SUNDAY), false, `${hour}:00 Sunday`);
  }
  // Being closed on Sunday must not leak into the days either side.
  assert.equal(isLiveChatOnline(WEEK, 12, MONDAY), true);
  assert.equal(isLiveChatOnline(WEEK, 12, SATURDAY), true);
});

test('a manual override still beats the per-day schedule', () => {
  assert.equal(isLiveChatOnline({ ...WEEK, mode: 'online' }, 3, SUNDAY), true);
  assert.equal(isLiveChatOnline({ ...WEEK, mode: 'offline' }, 12, MONDAY), false);
});

test('hours saved before per-day support keep working untouched', () => {
  // No `days` key at all: every weekday inherits the old single window.
  const legacy = { mode: 'auto', openHour: 9, closeHour: 22 };
  assert.deepEqual(normalizeLiveChatAvailability(legacy).days, {});
  for (const day of [SUNDAY, MONDAY, SATURDAY]) {
    assert.equal(isLiveChatOnline(legacy, 8, day), false, `8am day ${day}`);
    assert.equal(isLiveChatOnline(legacy, 21, day), true, `9pm day ${day}`);
  }
});

test('an unknown weekday falls back to the shared hours rather than one day', () => {
  // The widget passes null when the date could not be read; picking, say,
  // Sunday's "closed" there would shut the chat for a clock problem.
  assert.equal(isLiveChatOnline(WEEK, 12, null), true);
  assert.equal(isLiveChatOnline(WEEK, 12, undefined), true);
  assert.equal(isLiveChatOnline(WEEK, 6, null), false, 'still respects the shared window');
  // An unknown hour keeps the chat online even on a day that has its own hours.
  assert.equal(isLiveChatOnline(WEEK, null, SATURDAY), true);
});

test('a broken day inherits the shared hours instead of shutting', () => {
  const broken = {
    mode: 'auto',
    days: { [MONDAY]: { openHour: 20, closeHour: 6 }, [SATURDAY]: 'nope', 9: { openHour: 1, closeHour: 2 } },
  };
  const config = normalizeLiveChatAvailability(broken);
  assert.equal(config.days[MONDAY], undefined, 'an inverted day is dropped, not stored');
  assert.equal(config.days[SATURDAY], undefined, 'junk is dropped');
  assert.equal(config.days[9], undefined, 'there is no ninth day');
  assert.equal(isLiveChatOnline(broken, 12, MONDAY), true, 'Monday falls back to 7am-7pm');

  // A deliberately empty range list is a real "closed", not junk to discard.
  assert.deepEqual(normalizeLiveChatAvailability({ days: { [SUNDAY]: { ranges: [] } } }).days[SUNDAY], { ranges: [] });
});

test('per-day hours survive a broken shared range', () => {
  // The shared window snaps back to the default, but Saturday was individually
  // valid and the superadmin meant it.
  const config = normalizeLiveChatAvailability({ mode: 'auto', openHour: 20, closeHour: 6, days: WEEK.days });
  assert.equal(config.openHour, DEFAULT_LIVE_CHAT_AVAILABILITY.openHour);
  assert.deepEqual(config.days[SATURDAY], { ranges: [{ openHour: 9, closeHour: 14 }] });
});

test('normalizing does not let two configs share one days object', () => {
  const first = normalizeLiveChatAvailability(undefined);
  first.days[MONDAY] = { ranges: [] };
  assert.deepEqual(normalizeLiveChatAvailability(undefined).days, {}, 'the default leaked between callers');
});

test('a split shift is honoured, so the lunch break really is offline', () => {
  // The dashboard writes one range per day today; the storage shape is ready
  // for two so adding the picker later needs no migration.
  const split = { mode: 'auto', days: { [MONDAY]: { ranges: [{ openHour: 7, closeHour: 12 }, { openHour: 14, closeHour: 19 }] } } };
  assert.equal(isLiveChatOnline(split, 11, MONDAY), true);
  assert.equal(isLiveChatOnline(split, 12, MONDAY), false, 'closed for lunch');
  assert.equal(isLiveChatOnline(split, 13, MONDAY), false);
  assert.equal(isLiveChatOnline(split, 15, MONDAY), true);
});

test('the widget can tell a visitor when the team is next back', () => {
  // Sunday afternoon: closed all day, so the next opening is Monday 7am.
  assert.deepEqual(nextOpening(WEEK, SUNDAY, 15), { day: MONDAY, openHour: 7 });
  // Saturday after the short day has ended, so it skips to Monday over Sunday.
  assert.deepEqual(nextOpening(WEEK, SATURDAY, 15), { day: MONDAY, openHour: 7 });
  // Early on a Monday, before opening: later the same day.
  assert.deepEqual(nextOpening(WEEK, MONDAY, 5), { day: MONDAY, openHour: 7 });
  // Nothing to promise when every day is closed.
  const shut = { mode: 'auto', days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((day) => [day, { ranges: [] }])) };
  assert.equal(nextOpening(shut, MONDAY, 9), null);
  assert.equal(nextOpening(WEEK, null, 9), null, 'an unknown day promises nothing');
});

test('the schedule reads back the same way for the dashboard and the visitor', () => {
  assert.equal(formatDayHours(scheduleForDay(WEEK, SATURDAY).ranges), '9am–2pm');
  assert.equal(formatDayHours(scheduleForDay(WEEK, MONDAY).ranges), '7am–7pm', 'an untouched day shows the shared hours');
  assert.equal(formatDayHours(scheduleForDay(WEEK, SUNDAY).ranges), 'Closed');
  assert.equal(formatDayHours([], 'cerrado hoy'), 'cerrado hoy');
  assert.equal(
    formatDayHours([{ openHour: 7, closeHour: 12 }, { openHour: 14, closeHour: 19 }]),
    '7am–12pm, 2pm–7pm',
  );

  assert.equal(scheduleForDay(WEEK, MONDAY).inherited, true);
  assert.equal(scheduleForDay(WEEK, SATURDAY).inherited, false);
});

test('editing one time of a day leaves its other time alone', () => {
  const base = { openHour: 9, closeHour: 14 };
  // The short Saturday closes an hour later; it must still open at 9am, not
  // snap back to the shipped 7am.
  assert.deepEqual(buildDayEntry({ closeHour: 15 }, base), { ranges: [{ openHour: 9, closeHour: 15 }] });
  assert.deepEqual(buildDayEntry({ openHour: 8 }, base), { ranges: [{ openHour: 8, closeHour: 14 }] });
  assert.deepEqual(buildDayEntry({ closed: true }, base), { ranges: [] });
  // The apply bar passes both hours, so neither comes from the day.
  assert.deepEqual(buildDayEntry({ openHour: 6, closeHour: 20 }, base), { ranges: [{ openHour: 6, closeHour: 20 }] });
});

test('an opening hour can never overtake the closing hour', () => {
  const base = { openHour: 9, closeHour: 14 };
  // Opening moved past closing pulls closing up rather than saving a range
  // that normalize would drop, silently returning the day to the shared hours.
  const entry = buildDayEntry({ openHour: 16 }, base);
  assert.deepEqual(entry, { ranges: [{ openHour: 16, closeHour: 17 }] });
  assert.deepEqual(normalizeLiveChatAvailability({ days: { [MONDAY]: entry } }).days[MONDAY], entry, 'survives a save');

  // The late edge: 11pm cannot be an opening, because nothing closes after it.
  const late = buildDayEntry({ openHour: 23, closeHour: 23 }, base);
  assert.deepEqual(late, { ranges: [{ openHour: 22, closeHour: 23 }] });
  assert.ok(late.ranges[0].openHour < late.ranges[0].closeHour);

  // Junk from a select falls back to the day's own hours rather than to 0.
  assert.deepEqual(buildDayEntry({ openHour: 'nine' }, base), { ranges: [{ openHour: 9, closeHour: 14 }] });
  assert.deepEqual(buildDayEntry({}, undefined), {
    ranges: [{
      openHour: DEFAULT_LIVE_CHAT_AVAILABILITY.openHour,
      closeHour: DEFAULT_LIVE_CHAT_AVAILABILITY.closeHour,
    }],
  });
});

test('applying to several days changes only those days', () => {
  // What the apply bar does: build one entry, write it to the ticked days, and
  // leave everything else standing.
  const entry = buildDayEntry({ openHour: 10, closeHour: 16 }, DEFAULT_LIVE_CHAT_AVAILABILITY);
  const days = { ...WEEK.days };
  for (const day of [MONDAY, 2]) days[day] = entry;

  const config = normalizeLiveChatAvailability({ ...WEEK, days });
  assert.equal(isLiveChatOnline(config, 10, MONDAY), true);
  assert.equal(isLiveChatOnline(config, 9, MONDAY), false, 'Monday now opens at 10am');
  assert.deepEqual(config.days[SATURDAY], { ranges: [{ openHour: 9, closeHour: 14 }] }, 'Saturday untouched');
  assert.deepEqual(config.days[SUNDAY], { ranges: [] }, 'Sunday still closed');
  assert.equal(config.days[5], undefined, 'Friday still inherits');
  assert.equal(isLiveChatOnline(config, 9, 5), true, 'and so still opens at 7am');
});

test('the dashboard button says whether the week is uniform', () => {
  assert.equal(summarizeSchedule(undefined), '7am–7pm');
  assert.equal(summarizeSchedule({ ...WEEK, days: { [SUNDAY]: { closed: true } } }), '7am–7pm · 1 day differs');
  assert.equal(summarizeSchedule(WEEK), '7am–7pm · 2 days differ');
});
