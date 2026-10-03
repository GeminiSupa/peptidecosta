import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_ACTIVITY_ACTIONS,
  ADMIN_ACTIVITY_RETENTION_DAYS,
  activityCutoffIso,
  buildActivityRow,
  describeActivity,
  describeActivityAction,
  isMissingActivityTable,
  purgeOldActivity,
  recordAdminActivity,
  redactDetail,
  requestOrigin,
  summariseChanges,
} from '../src/lib/adminActivityLog.mjs';

const headers = (map) => ({ get: (key) => map[key.toLowerCase()] ?? null });

test('the retention the owner asked for', () => {
  assert.equal(ADMIN_ACTIVITY_RETENTION_DAYS, 90);
});

test('the cutoff is 90 days back, to the second', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');
  assert.equal(activityCutoffIso(now), '2026-07-05T12:00:00.000Z');
});

test('a line reads as plain English, naming the person and the thing', () => {
  assert.equal(
    describeActivity({ actor_name: 'Omer', action: 'notification_recipient.added', subject_label: 'partner@example.com' }),
    'Omer added partner@example.com to the alert list'
  );
});

test('an account with no name falls back to its email, then to Somebody', () => {
  assert.equal(
    describeActivity({ actor_email: 'joe@example.com', action: 'session.signed_in' }),
    'joe@example.com signed in'
  );
  assert.equal(describeActivity({ action: 'session.signed_in' }), 'Somebody signed in');
});

// A log that drops an action it has no wording for would hide exactly the new
// thing somebody forgot to describe.
test('an action with no wording still shows, as itself', () => {
  const line = describeActivityAction({ action: 'widget.frobnicated', subject_label: 'thing' });
  assert.equal(line, 'widget.frobnicated — thing');
});

test('every action in the catalogue has wording', () => {
  for (const [action, template] of Object.entries(ADMIN_ACTIVITY_ACTIONS)) {
    assert.ok(template && typeof template === 'string', `${action} has no wording`);
  }
});

test('only the fields that really moved are recorded', () => {
  const detail = summariseChanges(
    { status: 'Pending', total_usd: 100, note: 'same' },
    { status: 'Paid', total_usd: 100, note: 'same' },
    ['status', 'total_usd', 'note']
  );
  assert.deepEqual(detail, { status: { from: 'Pending', to: 'Paid' } });
});

test('a field this save never touched is not reported as emptied', () => {
  assert.equal(summariseChanges({ status: 'Paid' }, {}, ['status']), null);
});

test('null and empty count as the same value, so a blank is not a change', () => {
  assert.equal(summariseChanges({ note: null }, { note: '' }, ['note']), null);
});

test('a long value is cut, so the log cannot become a copy of the row', () => {
  const detail = summariseChanges({ a: '' }, { a: 'x'.repeat(5000) }, ['a']);
  assert.equal(detail.a.to.length, 200);
});

// The whole point of recording actions rather than typing: nothing sensitive
// should be able to reach this table, even by a caller's mistake.
test('anything that looks like a credential or an ID is hidden', () => {
  const kept = redactDetail({
    password: { from: 'a', to: 'b' },
    api_key: { from: 'a', to: 'b' },
    customer_cedula: { from: '1', to: '2' },
    status: { from: 'Pending', to: 'Paid' },
  });
  assert.equal(kept.password, 'hidden');
  assert.equal(kept.api_key, 'hidden');
  assert.equal(kept.customer_cedula, 'hidden');
  assert.deepEqual(kept.status, { from: 'Pending', to: 'Paid' });
});

test('the row keeps who it was in plain text, so it still reads after they are deleted', () => {
  const row = buildActivityRow({
    actor: { user_id: 'u1', email: 'omer@example.com', name: 'Omer', tier: 'staff' },
    action: 'account.deleted',
    subjectType: 'account',
    subjectId: 'u2',
    subjectLabel: 'partner@example.com',
    request: { headers: headers({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9', 'user-agent': 'Firefox' }) },
  });
  assert.equal(row.actor_email, 'omer@example.com');
  assert.equal(row.actor_name, 'Omer');
  assert.equal(row.actor_tier, 'staff');
  assert.equal(row.subject_label, 'partner@example.com');
  // The first address in the chain is the caller; the rest are proxies.
  assert.equal(row.ip, '5.6.7.8');
  assert.equal(row.user_agent, 'Firefox');
});

test('a row still builds when there is no request to read', () => {
  const row = buildActivityRow({ actor: { email: 'a@b.c' }, action: 'session.signed_in' });
  assert.equal(row.ip, null);
  assert.equal(row.user_agent, null);
});

test('an absent table is recognised however PostgREST words it', () => {
  assert.equal(isMissingActivityTable({ code: '42P01' }), true);
  assert.equal(isMissingActivityTable({ code: 'PGRST205' }), true);
  assert.equal(isMissingActivityTable({
    message: "Could not find the table 'public.admin_activity_log' in the schema cache",
  }), true);
  assert.equal(isMissingActivityTable({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(isMissingActivityTable(null), false);
});

test('requestOrigin survives a request with no headers at all', () => {
  assert.deepEqual(requestOrigin(null), { ip: null, userAgent: null });
  assert.deepEqual(requestOrigin({}), { ip: null, userAgent: null });
});

/**
 * A stand-in for the one table, enough to prove the write and the purge.
 * The real round trip needs add-admin-activity-log.sql run in Supabase; this
 * covers the shape of what is sent and that nothing throws at the caller.
 */
function fakeDb(rows = [], { failWith = null } = {}) {
  const db = {
    rows,
    from() {
      const q = {
        _filters: [],
        insert(row) { if (failWith) return Promise.resolve({ error: failWith }); rows.push(row); return Promise.resolve({ error: null }); },
        select() { return q; },
        lt(_col, value) { q._filters.push((r) => r.at < value); return q; },
        gte(_col, value) { q._filters.push((r) => r.at >= value); return q; },
        eq(col, value) { q._filters.push((r) => r[col] === value); return q; },
        limit() {
          if (failWith) return Promise.resolve({ data: null, error: failWith });
          return Promise.resolve({ data: rows.filter((r) => q._filters.every((f) => f(r))), error: null });
        },
        delete() {
          return { in(_col, ids) { db.rows = rows.filter((r) => !ids.includes(r.id)); return Promise.resolve({ error: null }); } };
        },
      };
      return q;
    },
  };
  return db;
}

test('recording an action sends one row with the actor and the change', async () => {
  const rows = [];
  const result = await recordAdminActivity(fakeDb(rows), {
    actor: { email: 'omer@example.com', name: 'Omer', tier: 'staff' },
    action: 'notification_recipient.added',
    subjectLabel: 'partner@example.com',
    detail: { channel: { from: '', to: 'email' } },
  });
  assert.equal(result.recorded, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'notification_recipient.added');
  assert.equal(rows[0].actor_email, 'omer@example.com');
  assert.deepEqual(rows[0].detail, { channel: { from: '', to: 'email' } });
});

// The log must never be the reason a save fails. This is the whole contract.
test('a database that refuses the write does not throw at the caller', async () => {
  const result = await recordAdminActivity(
    fakeDb([], { failWith: { code: '42P01', message: 'relation does not exist' } }),
    { actor: { email: 'a@b.c' }, action: 'order.updated' }
  );
  assert.equal(result.recorded, false);
  assert.equal(result.available, false);
});

test('an action with no name records nothing rather than a blank row', async () => {
  const rows = [];
  assert.equal((await recordAdminActivity(fakeDb(rows), { action: '' })).recorded, false);
  assert.equal(rows.length, 0);
});

test('the purge takes what is past 90 days and leaves the rest', async () => {
  const now = new Date('2026-10-03T00:00:00.000Z');
  const db = fakeDb([
    { id: '1', at: '2026-10-02T00:00:00.000Z' },
    { id: '2', at: '2026-09-01T00:00:00.000Z' },
    { id: '3', at: '2026-01-01T00:00:00.000Z' },
    { id: '4', at: '2026-06-01T00:00:00.000Z' },
  ]);
  const result = await purgeOldActivity(db, { now });
  assert.equal(result.ok, true);
  assert.equal(result.purged, 2); // January and June are both past the cutoff
  assert.deepEqual(db.rows.map((r) => r.id), ['1', '2']);
});

test('a purge on a table that is not there yet is a quiet success', async () => {
  const result = await purgeOldActivity(
    fakeDb([], { failWith: { code: '42P01', message: 'relation "admin_activity_log" does not exist' } })
  );
  assert.equal(result.ok, true);
  assert.equal(result.purged, 0);
  assert.equal(result.available, false);
});
