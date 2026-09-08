/**
 * Per-channel pacing for one-time announcements.
 *
 * The processor used to send a fixed 10 contacts and immediately re-trigger
 * itself, so email and WhatsApp went out at one speed set in code. Meta
 * rate-shapes marketing WhatsApp and reads a burst as spam; email is bounded
 * by a daily allowance instead. Each channel now has its own batch size and
 * its own wait, and the two advance independently.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  channelPacing, channelIsDue, planBatch, encodeRemaining, nextRunTimes,
  canChainImmediately, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE, MAX_DELAY_SECONDS,
} from '../src/lib/broadcastPacing.mjs';

const NOW = Date.parse('2026-09-08T12:00:00Z');

test('an unconfigured broadcast keeps the old behaviour', () => {
  const p = channelPacing({}, 'email');
  assert.equal(p.batchSize, DEFAULT_BATCH_SIZE);
  assert.equal(p.delaySeconds, 0);
  // No pacing stamp yet means the first run goes straight away.
  assert.equal(channelIsDue({}, 'email', NOW), true);
});

test('operator values are read per channel and clamped', () => {
  const row = {
    email_batch_size: 50, email_batch_delay_seconds: 120,
    whatsapp_batch_size: 5, whatsapp_batch_delay_seconds: 600,
  };
  assert.deepEqual(channelPacing(row, 'email'), { batchSize: 50, delaySeconds: 120 });
  assert.deepEqual(channelPacing(row, 'whatsapp'), { batchSize: 5, delaySeconds: 600 });

  // A typo must not become a burst, or a wait longer than a day.
  assert.equal(channelPacing({ email_batch_size: 99999 }, 'email').batchSize, MAX_BATCH_SIZE);
  assert.equal(channelPacing({ email_batch_size: 0 }, 'email').batchSize, 1);
  assert.equal(channelPacing({ email_batch_size: -4 }, 'email').batchSize, 1);
  assert.equal(channelPacing({ email_batch_delay_seconds: 999999 }, 'email').delaySeconds, MAX_DELAY_SECONDS);
  assert.equal(channelPacing({ email_batch_delay_seconds: 'abc' }, 'email').delaySeconds, 0);
});

test('a channel waits until its own time, the other still sends', () => {
  const row = {
    email_next_at: new Date(NOW + 60_000).toISOString(),
    whatsapp_next_at: new Date(NOW - 1000).toISOString(),
  };
  assert.equal(channelIsDue(row, 'email', NOW), false);
  assert.equal(channelIsDue(row, 'whatsapp', NOW), true);
});

test('each channel counts only contacts it can actually reach', () => {
  // 3 reachable by email, 2 by phone, one reachable both ways.
  const contacts = [
    { email: 'a@x.com' },
    { phone: '50611110000', email: 'b@x.com' },
    { phone: '50622220000' },
    { email: 'c@x.com' },
  ];
  const plan = planBatch(contacts, {
    emailDue: true, whatsappDue: true, emailBatchSize: 2, whatsappBatchSize: 1,
  });

  // A batch of 2 emails means 2 emails, not 2 contacts of whom one had no address.
  assert.equal(plan.sendNow.filter((s) => s.doEmail).length, 2);
  assert.equal(plan.sendNow.filter((s) => s.doWhatsapp).length, 1);
  assert.equal(plan.emailRemaining, 1);
  assert.equal(plan.whatsappRemaining, 1);
});

test('a paused channel sends nothing while the other drains', () => {
  const contacts = [{ phone: '50611110000', email: 'a@x.com' }];
  const plan = planBatch(contacts, {
    emailDue: false, whatsappDue: true, emailBatchSize: 10, whatsappBatchSize: 10,
  });
  assert.equal(plan.sendNow.length, 1);
  assert.equal(plan.sendNow[0].doEmail, false);
  assert.equal(plan.sendNow[0].doWhatsapp, true);
  assert.equal(plan.emailRemaining, 1, 'the email is still owed');
});

test('a half-done contact is re-queued for the channel it still needs', () => {
  const contact = { phone: '50611110000', email: 'a@x.com' };
  // Email went, WhatsApp did not: it comes back as a bare phone number.
  assert.deepEqual(encodeRemaining([{ contact, doEmail: true, doWhatsapp: false }]), ['50611110000']);
  // WhatsApp went, email did not.
  assert.deepEqual(encodeRemaining([{ contact, doEmail: false, doWhatsapp: true }]), ['a@x.com']);
  // Neither went: both are still owed.
  assert.deepEqual(encodeRemaining([{ contact, doEmail: false, doWhatsapp: false }]), ['50611110000|a@x.com']);
  // Both went: nothing to re-queue, so the contact disappears.
  assert.deepEqual(encodeRemaining([{ contact, doEmail: true, doWhatsapp: true }]), []);
});

test('the row wakes for whichever channel is due first', () => {
  const t = nextRunTimes({
    emailRemaining: 5, whatsappRemaining: 5,
    emailSentThisRun: true, whatsappSentThisRun: true,
    emailDelaySeconds: 60, whatsappDelaySeconds: 600,
    now: NOW,
  });
  assert.equal(t.emailNextAt, new Date(NOW + 60_000).toISOString());
  assert.equal(t.whatsappNextAt, new Date(NOW + 600_000).toISOString());
  assert.equal(t.scheduledAt, t.emailNextAt, 'the sooner of the two');
  assert.equal(t.done, false);
});

test('a finished channel stops holding the broadcast open', () => {
  const t = nextRunTimes({
    emailRemaining: 0, whatsappRemaining: 3,
    emailSentThisRun: true, whatsappSentThisRun: true,
    emailDelaySeconds: 60, whatsappDelaySeconds: 30,
    now: NOW,
  });
  assert.equal(t.emailNextAt, null);
  assert.equal(t.scheduledAt, t.whatsappNextAt);
  assert.equal(t.done, false);

  const finished = nextRunTimes({
    emailRemaining: 0, whatsappRemaining: 0,
    emailSentThisRun: true, whatsappSentThisRun: true,
    emailDelaySeconds: 60, whatsappDelaySeconds: 30,
    now: NOW,
  });
  assert.equal(finished.done, true);
  assert.equal(finished.scheduledAt, null);
});

test('a channel that did not send this run keeps the time it was already waiting for', () => {
  const waitingUntil = new Date(NOW + 300_000).toISOString();
  const t = nextRunTimes({
    emailRemaining: 4, whatsappRemaining: 0,
    emailSentThisRun: false, whatsappSentThisRun: true,
    emailDelaySeconds: 60, whatsappDelaySeconds: 30,
    emailNextAt: waitingUntil,
    now: NOW,
  });
  assert.equal(t.emailNextAt, waitingUntil, 'its wait must not restart every run');
});

test('the processor only self-triggers when nothing is being waited for', () => {
  assert.equal(canChainImmediately(new Date(NOW).toISOString(), NOW), true);
  assert.equal(canChainImmediately(new Date(NOW + 60_000).toISOString(), NOW), false,
    'chaining through a delay would busy-loop and defeat the pacing');
  assert.equal(canChainImmediately(null, NOW), false);
});

/**
 * Quiet hours.
 *
 * Pacing a send slowly is right for 1,500 recipients and wrong for a night:
 * spread over thirteen hours, a broadcast started in the afternoon runs until
 * dawn and buzzes phones at 3am. Spam reports are what actually get a WhatsApp
 * number restricted, so the window matters more than the throughput.
 */

import {
  readSendWindow, withinSendWindow, nextWindowOpening, crHourOf,
} from '../src/lib/broadcastPacing.mjs';

/**
 * An instant at a given Costa Rica hour (UTC-6, no DST).
 * Date.UTC, not string building: CR 19:00 is 25:00 UTC the same day, which is
 * not a time you can write down but is a date Date.UTC rolls over correctly.
 */
const crAt = (day, hour) => Date.UTC(2026, 8, day, hour + 6);

test('a broadcast with no window set sends around the clock, as before', () => {
  assert.equal(readSendWindow({}), null);
  assert.equal(withinSendWindow(null, crAt(9, 3)), true);
  assert.equal(nextWindowOpening(null, crAt(9, 3)), crAt(9, 3));
});

test('an equal start and end is treated as no window, not a window that never opens', () => {
  assert.equal(readSendWindow({ send_window_start_hour: 9, send_window_end_hour: 9 }), null);
  assert.equal(readSendWindow({ send_window_start_hour: 8, send_window_end_hour: null }), null);
  assert.equal(readSendWindow({ send_window_start_hour: 99, send_window_end_hour: 20 }), null);
});

test('8:00-20:00 sends by day and holds overnight', () => {
  const w = readSendWindow({ send_window_start_hour: 8, send_window_end_hour: 20 });
  assert.deepEqual(w, { start: 8, end: 20 });

  assert.equal(withinSendWindow(w, crAt(9, 8)), true, 'the start hour is included');
  assert.equal(withinSendWindow(w, crAt(9, 13)), true);
  assert.equal(withinSendWindow(w, crAt(9, 19)), true);
  assert.equal(withinSendWindow(w, crAt(9, 20)), false, 'the end hour is excluded');
  assert.equal(withinSendWindow(w, crAt(9, 23)), false);
  assert.equal(withinSendWindow(w, crAt(9, 3)), false, '3am is the whole point');
  assert.equal(withinSendWindow(w, crAt(9, 7)), false);
});

test('a held broadcast resumes at the next opening, not immediately', () => {
  const w = { start: 8, end: 20 };
  // Late evening waits for the morning.
  assert.equal(crHourOf(nextWindowOpening(w, crAt(9, 21))), 8);
  // The small hours wait for the same morning.
  assert.equal(crHourOf(nextWindowOpening(w, crAt(9, 3))), 8);
  // An instant already inside the window is not moved at all.
  assert.equal(nextWindowOpening(w, crAt(9, 12)), crAt(9, 12));
});

test('a window may wrap midnight', () => {
  const w = readSendWindow({ send_window_start_hour: 20, send_window_end_hour: 6 });
  assert.equal(withinSendWindow(w, crAt(9, 22)), true);
  assert.equal(withinSendWindow(w, crAt(9, 2)), true);
  assert.equal(withinSendWindow(w, crAt(9, 12)), false);
  assert.equal(crHourOf(nextWindowOpening(w, crAt(9, 12))), 20);
});

test('the Costa Rica hour is read as CR time, not the reader\'s clock', () => {
  // 02:00 UTC is 20:00 the previous day in Costa Rica — the difference that
  // decides whether a message lands at dinner or at 2am.
  assert.equal(crHourOf(Date.parse('2026-09-09T02:00:00Z')), 20);
  assert.equal(crHourOf(Date.parse('2026-09-09T06:00:00Z')), 0);
});

test('24:00 as an end means the end of the day, not a held send', () => {
  // The trap: a dropdown ending at 23:00 reads as "all day", so a send queued
  // at 23:40 sat until morning with the progress bar on zero.
  const allDay = readSendWindow({ send_window_start_hour: 0, send_window_end_hour: 24 });
  assert.equal(allDay, null, '0 to 24 is no restriction at all');

  const evening = readSendWindow({ send_window_start_hour: 8, send_window_end_hour: 24 });
  assert.equal(withinSendWindow(evening, crAt(9, 23)), true, '23:40 must send');
  assert.equal(withinSendWindow(evening, crAt(9, 3)), false, 'but 3am must not');

  // The old 0-23 still behaves as written: it genuinely stops at 11pm.
  const stopsAt23 = readSendWindow({ send_window_start_hour: 0, send_window_end_hour: 23 });
  assert.equal(withinSendWindow(stopsAt23, crAt(9, 23)), false);
});
