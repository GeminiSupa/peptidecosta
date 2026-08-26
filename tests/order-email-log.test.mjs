import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { orderEmailActivity, recordOrderEmails, emailKindLabel } from '../src/lib/orderEmailLog.mjs';

test('a sent email reads as sent, and names who received it', () => {
  const entry = orderEmailActivity({ kind: 'customer-receipt', to: 'buyer@example.com', sent: true });
  assert.equal(entry.type, 'email');
  assert.equal(entry.ok, true);
  assert.equal(entry.message, 'Order receipt sent → buyer@example.com');
});

test('a failed email keeps its reason, because the reason is the whole point', () => {
  const entry = orderEmailActivity({
    kind: 'accounting-copy',
    to: 'pbagcr@peptidescostarica.net',
    sent: false,
    error: '550 rejected as spam',
  });
  assert.equal(entry.ok, false);
  assert.match(entry.message, /Accounting copy FAILED/);
  assert.match(entry.message, /550 rejected as spam/);
});

test('a skipped email is neither a success nor a failure', () => {
  const entry = orderEmailActivity({ kind: 'accounting-copy', skipped: 'not-completed' });
  assert.equal(entry.ok, null);
  assert.match(entry.message, /skipped \(not-completed\)/);
});

test('every kind has a human label', () => {
  for (const kind of ['admin-alert', 'customer-receipt', 'completion-receipt', 'accounting-copy', 'refund-notice', 'payment-result']) {
    assert.notEqual(emailKindLabel(kind), kind, `${kind} should read as English`);
  }
});

function fakeSupabase(row, captured) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: row, error: null }),
        update(patch) { captured.patch = patch; return { eq: async () => ({ error: null }) }; },
      };
    },
  };
}

test('all of a handler\'s emails land in one write, newest first', async () => {
  const captured = {};
  const supabase = fakeSupabase({ id: 'o1', activity_log: [{ type: 'created', at: '2026-08-01T00:00:00Z' }] }, captured);

  const result = await recordOrderEmails(supabase, { id: 'o1' }, [
    orderEmailActivity({ kind: 'admin-alert', sent: true }),
    orderEmailActivity({ kind: 'customer-receipt', to: 'buyer@example.com', sent: true }),
    orderEmailActivity({ kind: 'accounting-copy', to: 'pbagcr@…', sent: false, error: '550' }),
  ]);

  assert.equal(result.recorded, 3);
  const log = captured.patch.activity_log;
  assert.equal(log.length, 4, 'appended, never replacing the existing history');
  assert.match(log[0].message, /Accounting copy FAILED/, 'the last email sent is at the head');
  assert.equal(log[3].type, 'created', 'the original entry survives at the tail');
});

test('a logging failure never breaks the send that already happened', async () => {
  const exploding = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: null, error: { message: 'connection reset' } }),
      };
    },
  };
  const result = await recordOrderEmails(exploding, { id: 'o1' }, [
    orderEmailActivity({ kind: 'customer-receipt', sent: true }),
  ]);
  assert.equal(result.recorded, 0);
  assert.match(result.error, /connection reset/);
});

test('nothing to record is not an error', async () => {
  assert.equal((await recordOrderEmails(null, { id: 'o1' }, [])).recorded, 0);
  assert.equal((await recordOrderEmails({}, {}, [orderEmailActivity({ kind: 'admin-alert', sent: true })])).recorded, 0);
});

test('the customer timeline lifts email entries back out of the order log', () => {
  const route = fs.readFileSync('src/app/api/admin/customer-timeline/route.js', 'utf8');
  // The history is only worth writing if the contact view actually reads it.
  assert.match(route, /entry\?\.type === 'email'/);
  assert.match(route, /customer_inquiries/);
});

test('the order routes record what they send', () => {
  for (const file of [
    'src/app/api/order-notification/route.js',
    'src/app/api/order-shipped-notification/route.js',
    'src/app/api/admin/orders/refund/route.js',
  ]) {
    assert.match(fs.readFileSync(file, 'utf8'), /recordOrderEmails\(/, `${file} should record its sends`);
  }
});
