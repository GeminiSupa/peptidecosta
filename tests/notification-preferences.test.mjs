import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentWhatsAppNumber,
  agentWhatsAppNumbers,
  missingColumnFrom,
  notificationsEnabled,
  selectWithOptionalPreferences,
  wantsOrderEmail,
  wantsOrderWhatsApp,
  writeWithOptionalPreferences,
} from '../src/lib/notificationPreferences.mjs';

/** Stands in for a database that only has some of the preference columns. */
function fakeTable(existingColumns, rows) {
  return async (columnList) => {
    const requested = columnList.split(',').map((c) => c.trim());
    const unknown = requested.find((c) => !existingColumns.includes(c));
    if (unknown) {
      return { data: null, error: { code: '42703', message: `column admin_profiles.${unknown} does not exist` } };
    }
    return { data: rows.map((row) => Object.fromEntries(requested.map((c) => [c, row[c]]))), error: null };
  };
}

test('missingColumnFrom names the column PostgREST rejected on a select', () => {
  const error = { code: '42703', message: 'column admin_profiles.notifications_enabled does not exist' };
  assert.equal(missingColumnFrom(error), 'notifications_enabled');
});

test('missingColumnFrom names the column PostgREST rejected on a write', () => {
  const error = {
    code: 'PGRST204',
    message: "Could not find the 'order_whatsapp_notifications' column of 'admin_profiles' in the schema cache",
  };
  assert.equal(missingColumnFrom(error), 'order_whatsapp_notifications');
});

test('missingColumnFrom ignores unrelated failures', () => {
  assert.equal(missingColumnFrom({ code: '23505', message: 'duplicate key value violates unique constraint' }), null);
  assert.equal(missingColumnFrom(null), null);
});

test('write drops only preference columns the database lacks, then succeeds', async () => {
  const attempts = [];
  const existing = new Set(['user_id', 'email', 'order_email_notifications']);

  const result = await writeWithOptionalPreferences(
    {
      user_id: 'u1',
      email: 'a@b.com',
      notifications_enabled: true,
      order_email_notifications: true,
      order_whatsapp_notifications: false,
      whatsapp_number: '50688881234',
    },
    async (row) => {
      attempts.push(Object.keys(row));
      const unknown = Object.keys(row).find((key) => !existing.has(key));
      if (unknown) {
        return { data: null, error: { code: 'PGRST204', message: `Could not find the '${unknown}' column of 'admin_profiles' in the schema cache` } };
      }
      return { data: { ...row }, error: null };
    }
  );

  assert.equal(result.error, null);
  assert.deepEqual(result.droppedColumns.sort(), ['notifications_enabled', 'order_whatsapp_notifications', 'whatsapp_number']);
  // The member is still created, with every column the database does have.
  assert.deepEqual(Object.keys(result.data).sort(), ['email', 'order_email_notifications', 'user_id']);
  assert.equal(attempts.length, 4);
});

test('write surfaces a real error instead of retrying forever', async () => {
  let calls = 0;
  const result = await writeWithOptionalPreferences({ email: 'a@b.com' }, async () => {
    calls += 1;
    return { data: null, error: { code: '23505', message: 'duplicate key value' } };
  });

  assert.equal(calls, 1);
  assert.equal(result.error.code, '23505');
});

test('a column outside the preference list is never silently dropped', async () => {
  let calls = 0;
  const result = await writeWithOptionalPreferences({ commission_rate: 5 }, async () => {
    calls += 1;
    return { data: null, error: { code: 'PGRST204', message: "Could not find the 'commission_rate' column of 'admin_profiles' in the schema cache" } };
  });

  assert.equal(calls, 1);
  assert.equal(result.error.code, 'PGRST204');
});

test('a half-migrated database keeps the opt-outs it already stores', async () => {
  // The real regression: notifications_enabled is missing but
  // order_email_notifications exists. Dropping both would have quietly
  // re-subscribed the two people who had opted out of order emails.
  const run = fakeTable(
    ['email', 'order_email_notifications'],
    [
      { email: 'yese@example.com', order_email_notifications: true },
      { email: 'sean@example.com', order_email_notifications: false },
      { email: 'aziza@example.com', order_email_notifications: false },
    ]
  );

  const { data, error, droppedColumns } = await selectWithOptionalPreferences(
    ['email', 'notifications_enabled', 'order_email_notifications'],
    run
  );

  assert.equal(error, null);
  assert.deepEqual(droppedColumns, ['notifications_enabled']);
  const recipients = data.filter(wantsOrderEmail).map((p) => p.email);
  assert.deepEqual(recipients, ['yese@example.com'], 'opted-out members stay opted out');
});

test('a fully migrated database uses every column', async () => {
  const run = fakeTable(
    ['email', 'notifications_enabled', 'order_email_notifications'],
    [
      { email: 'yese@example.com', notifications_enabled: true, order_email_notifications: true },
      { email: 'quiet@example.com', notifications_enabled: false, order_email_notifications: true },
    ]
  );

  const { data, droppedColumns } = await selectWithOptionalPreferences(
    ['email', 'notifications_enabled', 'order_email_notifications'],
    run
  );

  assert.deepEqual(droppedColumns, []);
  assert.deepEqual(data.filter(wantsOrderEmail).map((p) => p.email), ['yese@example.com']);
});

test('missing columns read as the pre-migration defaults', () => {
  const legacy = { email: 'a@b.com' };
  assert.equal(notificationsEnabled(legacy), true);
  assert.equal(wantsOrderEmail(legacy), true, 'existing agents keep their order emails before the migration runs');
  assert.equal(wantsOrderWhatsApp(legacy), false, 'WhatsApp stays silent until someone opts in');
});

test('the master switch overrides the individual channels', () => {
  const optedOut = {
    notifications_enabled: false,
    order_email_notifications: true,
    order_whatsapp_notifications: true,
    whatsapp_number: '50688881234',
  };
  assert.equal(wantsOrderEmail(optedOut), false);
  assert.equal(wantsOrderWhatsApp(optedOut), false);
});

test('each channel can be switched off on its own', () => {
  const emailOnly = { order_email_notifications: true, order_whatsapp_notifications: false };
  assert.equal(wantsOrderEmail(emailOnly), true);
  assert.equal(wantsOrderWhatsApp(emailOnly), false);

  const whatsappOnly = { order_email_notifications: false, order_whatsapp_notifications: true };
  assert.equal(wantsOrderEmail(whatsappOnly), false);
  assert.equal(wantsOrderWhatsApp(whatsappOnly), true);
});

test('WhatsApp numbers are normalised, and unusable ones are rejected', () => {
  assert.equal(agentWhatsAppNumber({ whatsapp_number: '+506 8888-1234' }), '50688881234');
  assert.equal(agentWhatsAppNumber({ whatsapp_number: '123' }), '', 'too short to be a real number');
  assert.equal(agentWhatsAppNumber({ whatsapp_number: null }), '');
  assert.equal(agentWhatsAppNumber({}), '');
});

test('one member can be reached on several numbers', () => {
  assert.deepEqual(
    agentWhatsAppNumbers({ whatsapp_number: '+506 6062 6224, +506 9999 5678' }),
    ['50660626224', '50699995678']
  );
});

test('junk entries in the list are dropped without losing the good ones', () => {
  assert.deepEqual(
    agentWhatsAppNumbers({ whatsapp_number: '50660626224, 123, , abc, 50699995678' }),
    ['50660626224', '50699995678']
  );
  assert.deepEqual(agentWhatsAppNumbers({ whatsapp_number: '' }), []);
  assert.deepEqual(agentWhatsAppNumbers({}), []);
});

test('the same number listed twice is only messaged once', () => {
  assert.deepEqual(
    agentWhatsAppNumbers({ whatsapp_number: '50660626224, +506 6062-6224' }),
    ['50660626224']
  );
});
