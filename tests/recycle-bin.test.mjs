import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_TABLES,
  DEFAULT_RETENTION_DAYS,
  childTablesFor,
  describeRecord,
  isBinnableTable,
  purgeDateFor,
  readRetention,
  recordTypeFor,
  selectExpired,
  summarizeEntry,
  validateRetention,
} from '../src/lib/recycleBin.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

test('a setting nobody has touched keeps the 30-day default, not "never"', () => {
  const retention = readRetention(null);
  assert.equal(retention.days, DEFAULT_RETENTION_DAYS);
  assert.equal(retention.neverPurge, false);
});

test('a damaged retention value falls back to the default rather than never purging', () => {
  for (const broken of [{ retention_days: 'soon' }, { retention_days: 0 }, { retention_days: -5 }]) {
    const retention = readRetention(broken);
    assert.equal(retention.days, DEFAULT_RETENTION_DAYS, JSON.stringify(broken));
    assert.equal(retention.neverPurge, false);
  }
});

test('an explicit null means never purge, and is told apart from a missing key', () => {
  const never = readRetention({ retention_days: null, updated_by: 'Webster' });
  assert.equal(never.neverPurge, true);
  assert.equal(never.days, null);
  assert.equal(never.updatedBy, 'Webster');

  const absent = readRetention({ updated_by: 'Webster' });
  assert.equal(absent.neverPurge, false);
  assert.equal(absent.days, DEFAULT_RETENTION_DAYS);
});

test('retention of zero days is refused — it would erase every delete at once', () => {
  const result = validateRetention(0);
  assert.equal(result.ok, false);
  assert.match(result.error, /at least one day/);
});

test('retention accepts a plain number and the string a dropdown sends', () => {
  assert.deepEqual(validateRetention(90), { ok: true, days: 90, neverPurge: false });
  assert.deepEqual(validateRetention(' 14 '), { ok: true, days: 14, neverPurge: false });
  assert.deepEqual(validateRetention('never'), { ok: true, days: null, neverPurge: true });
});

test('retention refuses fractions and anything past ten years', () => {
  assert.equal(validateRetention(1.5).ok, false);
  assert.equal(validateRetention(4000).ok, false);
});

test('the purge date follows the current setting, so lengthening it protects what is already binned', () => {
  const deletedAt = '2026-09-01T00:00:00.000Z';
  const short = purgeDateFor(deletedAt, { days: 7, neverPurge: false });
  const long = purgeDateFor(deletedAt, { days: 90, neverPurge: false });

  assert.equal(short.toISOString(), '2026-09-08T00:00:00.000Z');
  assert.equal(long.toISOString(), '2026-11-30T00:00:00.000Z');
  assert.equal(purgeDateFor(deletedAt, { days: null, neverPurge: true }), null);
});

test('an item with hours left still reads as a day left, not zero', () => {
  const now = new Date('2026-09-08T20:00:00.000Z');
  const summary = summarizeEntry(
    { deleted_at: '2026-09-01T00:00:00.000Z' },
    { days: 8, neverPurge: false },
    now,
  );
  assert.equal(summary.expired, false);
  assert.equal(summary.daysLeft, 1);
});

test('the purge picks up expired entries and leaves restored ones alone', () => {
  const now = new Date('2026-09-20T00:00:00.000Z');
  const retention = { days: 30, neverPurge: false };
  const entries = [
    { id: 'a', deleted_at: new Date(now.getTime() - 40 * DAY_MS).toISOString() },
    { id: 'b', deleted_at: new Date(now.getTime() - 10 * DAY_MS).toISOString() },
    {
      id: 'c',
      deleted_at: new Date(now.getTime() - 40 * DAY_MS).toISOString(),
      restored_at: new Date(now.getTime() - 39 * DAY_MS).toISOString(),
    },
  ];

  assert.deepEqual(selectExpired(entries, retention, now).map((e) => e.id), ['a']);
});

test('nothing is ever purged while the setting says never', () => {
  const now = new Date('2026-09-20T00:00:00.000Z');
  const ancient = [{ id: 'a', deleted_at: '2020-01-01T00:00:00.000Z' }];
  assert.deepEqual(selectExpired(ancient, { days: null, neverPurge: true }, now), []);
});

test('an order is described by its number and customer', () => {
  const label = describeRecord('orders', {
    id: 'uuid-1',
    order_number: 'PCR-1042',
    customer_name: 'Maria Rojas',
    customer_email: 'maria@example.com',
  });
  assert.equal(label, 'PCR-1042 — Maria Rojas');
});

test('a row with no usable label falls back to its id rather than going blank', () => {
  assert.equal(describeRecord('products', { id: 77, name: '   ' }), '#77');
  assert.equal(describeRecord('products', {}), 'Untitled record');
});

test('a long label is trimmed so one broadcast cannot flood the list', () => {
  const label = describeRecord('scheduled_broadcasts', { message: 'x'.repeat(400) });
  assert.equal(label.length, 120);
});

test('orders and live chats carry their children so a restore is not an empty shell', () => {
  assert.deepEqual(childTablesFor('orders'), []);
  assert.deepEqual(childTablesFor('live_chat_conversations'), [
    { table: 'live_chat_messages', foreignKey: 'conversation_id' },
  ]);
  assert.deepEqual(childTablesFor('products'), []);
});

test('only registered tables are binnable, and each has a friendly type name', () => {
  assert.equal(isBinnableTable('orders'), true);
  assert.equal(isBinnableTable('wa_auth_state'), false, 'session keys are housekeeping, not deletes');
  assert.equal(isBinnableTable(''), false);

  for (const [table, config] of Object.entries(BIN_TABLES)) {
    assert.ok(config.type, `${table} needs a type name`);
    assert.ok(config.labelFields?.length, `${table} needs label fields`);
    assert.equal(recordTypeFor(table), config.type);
  }
});
