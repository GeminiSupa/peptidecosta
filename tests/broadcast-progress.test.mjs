import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countQueuedContacts,
  summarizeDeliveryEvents,
  computeBroadcastProgress,
  estimateCompletion,
} from '../src/lib/broadcastProgress.mjs';

const ev = (contact_key, channel, status, at) => ({
  contact_key, channel, status, first_attempt_at: at, last_attempt_at: at,
});

test('counts queued contacts from the cron\'s comma-separated list', () => {
  assert.equal(countQueuedContacts('50688887777|a@b.com,50688887778,c@d.com'), 3);
  assert.equal(countQueuedContacts(''), 0);
  assert.equal(countQueuedContacts(null), 0);
  assert.equal(countQueuedContacts('  '), 0);
});

test('ignores trailing and repeated separators', () => {
  assert.equal(countQueuedContacts('a@b.com,,c@d.com,'), 2);
});

test('a contact messaged on both channels counts once', () => {
  const events = [
    ev('50688887777', 'whatsapp', 'delivered', '2026-07-21T10:00:00Z'),
    ev('maria@x.com', 'email', 'delivered', '2026-07-21T10:00:01Z'),
  ];
  // Same person, two channels — different contact_keys per channel, so this is
  // two contacts. Same key on both channels must collapse to one:
  const same = [
    ev('maria@x.com', 'whatsapp', 'delivered', '2026-07-21T10:00:00Z'),
    ev('maria@x.com', 'email', 'delivered', '2026-07-21T10:00:01Z'),
  ];
  assert.equal(summarizeDeliveryEvents(events).attemptedContacts, 2);
  assert.equal(summarizeDeliveryEvents(same).attemptedContacts, 1);
  assert.equal(summarizeDeliveryEvents(same).reachedContacts, 1);
});

test('derives the total the cron never stored', () => {
  const events = [
    ev('a', 'whatsapp', 'delivered', '2026-07-21T10:00:00Z'),
    ev('b', 'whatsapp', 'delivered', '2026-07-21T10:00:01Z'),
    ev('c', 'whatsapp', 'failed', '2026-07-21T10:00:02Z'),
  ];
  const p = computeBroadcastProgress({ events, customContacts: 'd,e,f,g', status: 'pending' });
  assert.equal(p.attempted, 3);
  assert.equal(p.remaining, 4);
  assert.equal(p.total, 7);
  assert.equal(p.percent, 43);
  assert.equal(p.isComplete, false);
});

test('separates failures from opt-in skips', () => {
  const events = [
    ev('a', 'whatsapp', 'delivered', '2026-07-21T10:00:00Z'),
    ev('b', 'whatsapp', 'suppressed', '2026-07-21T10:00:01Z'),
    ev('c', 'whatsapp', 'failed', '2026-07-21T10:00:02Z'),
    ev('d', 'email', 'bounced', '2026-07-21T10:00:03Z'),
  ];
  const p = computeBroadcastProgress({ events, customContacts: '', status: 'completed' });
  assert.equal(p.reached, 1);
  assert.equal(p.suppressed, 1);
  assert.equal(p.failed, 2, 'bounced counts as a failure, suppressed does not');
});

test('a finished broadcast reports 100 percent', () => {
  const events = [ev('a', 'whatsapp', 'delivered', '2026-07-21T10:00:00Z')];
  const p = computeBroadcastProgress({ events, customContacts: '', status: 'completed' });
  assert.equal(p.percent, 100);
  assert.equal(p.isComplete, true);
});

test('a broadcast that has not started yet does not report 100 percent', () => {
  const p = computeBroadcastProgress({ events: [], customContacts: 'a,b,c', status: 'pending' });
  assert.equal(p.total, 3);
  assert.equal(p.attempted, 0);
  assert.equal(p.percent, 0);
  assert.equal(p.isComplete, false);
});

test('still in flight while a contact is mid-send', () => {
  const events = [ev('a', 'whatsapp', 'processing', '2026-07-21T10:00:00Z')];
  const p = computeBroadcastProgress({ events, customContacts: '', status: 'pending' });
  assert.equal(p.inFlight, 1);
  assert.equal(p.isComplete, false, 'must not claim done while a send is open');
});

test('estimate stays silent without enough history', () => {
  assert.equal(estimateCompletion([], 50), null);
  const few = [ev('a', 'whatsapp', 'delivered', '2026-07-21T10:00:00Z')];
  assert.equal(estimateCompletion(few, 50), null);
});

test('estimate extrapolates from observed throughput', () => {
  // 6 contacts over 60s => 12s each; 10 remaining => ~120s
  const events = Array.from({ length: 6 }, (_, i) =>
    ev(`c${i}`, 'whatsapp', 'delivered', new Date(Date.UTC(2026, 6, 21, 10, 0, i * 12)).toISOString()));
  const est = estimateCompletion(events, 10, Date.UTC(2026, 6, 21, 10, 1, 0));
  assert.equal(est.perContactMs, 12000);
  assert.equal(est.remainingMs, 120000);
});

test('no estimate once nothing is left to send', () => {
  const events = Array.from({ length: 6 }, (_, i) =>
    ev(`c${i}`, 'whatsapp', 'delivered', new Date(Date.UTC(2026, 6, 21, 10, 0, i)).toISOString()));
  assert.equal(estimateCompletion(events, 0), null);
});
