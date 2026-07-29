import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getNotificationRecipients,
  isMissingRecipientsTable,
  isUsableDestination,
  normalizeDestination,
} from '../src/lib/notificationRecipients.mjs';

/** Minimal stand-in for the chained PostgREST query builder used by the lib. */
function fakeSupabase(result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    then: (resolve) => Promise.resolve(result).then(resolve),
  };
  return { from: () => builder };
}

test('a missing table is recognised in both PostgREST shapes', () => {
  assert.equal(isMissingRecipientsTable({ code: '42P01', message: 'relation "notification_recipients" does not exist' }), true);
  assert.equal(isMissingRecipientsTable({ code: 'PGRST205', message: "Could not find the table 'public.notification_recipients' in the schema cache" }), true);
  assert.equal(isMissingRecipientsTable(null), false);
});

test('an unrelated error is not mistaken for a missing table', () => {
  assert.equal(isMissingRecipientsTable({ code: '23505', message: 'duplicate key value' }), false);
  assert.equal(isMissingRecipientsTable({ code: '42501', message: 'permission denied for table notification_recipients' }), false);
});

test('a missing table reports unavailable rather than an empty list', async () => {
  const supabase = fakeSupabase({ data: null, error: { code: '42P01', message: 'relation "notification_recipients" does not exist' } });
  const result = await getNotificationRecipients(supabase, { channel: 'whatsapp' });
  assert.deepEqual(result, { available: false, recipients: [] });
});

test('an empty table is available and deliberately empty', async () => {
  const result = await getNotificationRecipients(fakeSupabase({ data: [], error: null }), { channel: 'email' });
  assert.equal(result.available, true);
  assert.deepEqual(result.recipients, []);
});

test('a real database error is surfaced, not swallowed', async () => {
  const supabase = fakeSupabase({ data: null, error: { code: '42501', message: 'permission denied' } });
  await assert.rejects(() => getNotificationRecipients(supabase, { channel: 'email' }), /permission denied/);
});

test('unusable destinations are dropped', async () => {
  const supabase = fakeSupabase({
    data: [
      { label: 'Webster', channel: 'whatsapp', destination: '50660626224' },
      { label: 'Typo', channel: 'whatsapp', destination: '6484164' },
      { label: 'Blank', channel: 'whatsapp', destination: '' },
    ],
    error: null,
  });
  const { recipients } = await getNotificationRecipients(supabase, { channel: 'whatsapp' });
  assert.deepEqual(recipients, [{ label: 'Webster', destination: '50660626224' }]);
});

test('the same number listed twice only gets one alert', async () => {
  const supabase = fakeSupabase({
    data: [
      { label: 'Webster', channel: 'whatsapp', destination: '50660626224' },
      { label: 'Webster spare', channel: 'whatsapp', destination: '+506 6062-6224' },
    ],
    error: null,
  });
  const { recipients } = await getNotificationRecipients(supabase, { channel: 'whatsapp' });
  assert.equal(recipients.length, 1);
});

test('addresses dedupe case-insensitively', async () => {
  const supabase = fakeSupabase({
    data: [
      { label: 'Ops', channel: 'email', destination: 'Info@peptidescostarica.net' },
      { label: 'Webster', channel: 'email', destination: 'info@peptidescostarica.net' },
    ],
    error: null,
  });
  const { recipients } = await getNotificationRecipients(supabase, { channel: 'email' });
  assert.deepEqual(recipients, [{ label: 'Ops', destination: 'Info@peptidescostarica.net' }]);
});

test('an unknown notification type is a programming error', async () => {
  await assert.rejects(
    () => getNotificationRecipients(fakeSupabase({ data: [], error: null }), { channel: 'email', type: 'birthday' }),
    /Unknown notification type/
  );
});

test('normalizeDestination strips phone symbols but keeps address text', () => {
  assert.equal(normalizeDestination('whatsapp', '+506 6062-6224'), '50660626224');
  assert.equal(normalizeDestination('email', '  ops@example.com '), 'ops@example.com');
});

test('isUsableDestination enforces the Meta digit range and email shape', () => {
  assert.equal(isUsableDestination('whatsapp', '50660626224'), true);
  assert.equal(isUsableDestination('whatsapp', '6484164'), false);
  assert.equal(isUsableDestination('whatsapp', '1234567890123456'), false);
  assert.equal(isUsableDestination('email', 'ops@example.com'), true);
  assert.equal(isUsableDestination('email', 'not-an-email'), false);
});
