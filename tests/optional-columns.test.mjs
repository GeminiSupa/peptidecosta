import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUB_USER_PAYOUT_COLUMNS,
  writeDroppingMissingColumns,
} from '../src/lib/optionalColumns.mjs';

/**
 * Fake PostgREST that rejects a named set of columns the way the real one does,
 * one complaint at a time.
 */
function fakeTable(unknownColumns = []) {
  const unknown = new Set(unknownColumns);
  const attempts = [];
  return {
    attempts,
    run(row) {
      attempts.push({ ...row });
      const offending = Object.keys(row).find((column) => unknown.has(column));
      if (offending) {
        return Promise.resolve({
          data: null,
          error: {
            code: 'PGRST204',
            message: `Could not find the '${offending}' column of 'commission_payouts' in the schema cache`,
          },
        });
      }
      return Promise.resolve({ data: { ...row }, error: null });
    },
  };
}

const PAYOUT = {
  agent_email: 'maria@peptides.com',
  usd_sales: 3120,
  usd_commission: 312,
  total_payout_usd: 374.4,
  agent_tier: 'staff',
  override_rate: 2,
  override_usd: 62.4,
  override_crc: 0,
  override_sales_usd: 3120,
  override_sales_crc: 0,
  override_orders_data: [{ id: 'o-1042' }],
};

test('a payout still saves on a database that has never heard of sub-users', () => {
  // The exact situation after deploying before pasting the migration.
  const table = fakeTable(SUB_USER_PAYOUT_COLUMNS);

  return writeDroppingMissingColumns(PAYOUT, SUB_USER_PAYOUT_COLUMNS, table.run).then((result) => {
    assert.equal(result.error, null);
    // Everything the existing weekly report depends on survived untouched.
    assert.equal(result.data.usd_commission, 312);
    assert.equal(result.data.total_payout_usd, 374.4);
    assert.equal(result.data.agent_email, 'maria@peptides.com');
    // And only the new columns were given up.
    assert.deepEqual(result.droppedColumns.sort(), [...SUB_USER_PAYOUT_COLUMNS].sort());
  });
});

test('only the column the database actually named is dropped', async () => {
  // Half-applied migration: the override columns landed, agent_tier did not.
  const table = fakeTable(['agent_tier']);
  const result = await writeDroppingMissingColumns(PAYOUT, SUB_USER_PAYOUT_COLUMNS, table.run);

  assert.equal(result.error, null);
  assert.deepEqual(result.droppedColumns, ['agent_tier']);
  // The override figures must not be discarded along with it, or a staff
  // member's 2% silently vanishes from a payout that otherwise looks fine.
  assert.equal(result.data.override_usd, 62.4);
  assert.deepEqual(result.data.override_orders_data, [{ id: 'o-1042' }]);
});

test('nothing is dropped when the schema is fully migrated', async () => {
  const table = fakeTable([]);
  const result = await writeDroppingMissingColumns(PAYOUT, SUB_USER_PAYOUT_COLUMNS, table.run);

  assert.equal(result.error, null);
  assert.deepEqual(result.droppedColumns, []);
  assert.equal(table.attempts.length, 1, 'a migrated database should take one round trip');
  assert.equal(result.data.override_usd, 62.4);
});

test('a real failure is surfaced, not retried away', async () => {
  const table = {
    attempts: [],
    run(row) {
      table.attempts.push(row);
      return Promise.resolve({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      });
    },
  };

  const result = await writeDroppingMissingColumns(PAYOUT, SUB_USER_PAYOUT_COLUMNS, table.run);
  assert.equal(result.error.code, '23505');
  assert.deepEqual(result.droppedColumns, []);
  assert.equal(table.attempts.length, 1, 'a genuine error must not be retried');
});

test('a select naming an optional column is what broke My Team', async () => {
  // The regression, in one assertion. admin_profiles has grown by hand-applied
  // migration, so whatsapp_number (notification preferences) and avatar_url
  // (team avatars) are optional in practice. Naming either in a select takes
  // down the whole sub-users route on a database that never ran those scripts,
  // which is what produced "Could not load your team".
  const { missingColumnFrom } = await import('../src/lib/optionalColumns.mjs');

  const selectError = {
    code: '42703',
    message: 'column admin_profiles.whatsapp_number does not exist',
  };

  // The old handler only recognised tier columns, so this returned false and
  // the caller fell through to a generic message naming nothing.
  const SUB_USER_ONLY = ['tier', 'status', 'parent_agent_id'];
  assert.equal(SUB_USER_ONLY.includes(missingColumnFrom(selectError)), false);

  // Whatever the column, it is always nameable — which is all the error message
  // needed to be actionable.
  assert.equal(missingColumnFrom(selectError), 'whatsapp_number');
  assert.equal(
    missingColumnFrom({ code: '42703', message: 'column admin_profiles.avatar_url does not exist' }),
    'avatar_url'
  );
});

test('an invite survives a database with no notification columns', async () => {
  const { writeWithOptionalPreferences } = await import('../src/lib/notificationPreferences.mjs');
  const table = fakeTable(['whatsapp_number']);

  const result = await writeWithOptionalPreferences(
    {
      email: 'diego@example.com',
      name: 'Diego Ruiz',
      tier: 'sub_user',
      status: 'pending',
      commission_rate: 8,
      whatsapp_number: '+506 8812 4490',
    },
    table.run
  );

  assert.equal(result.error, null);
  assert.deepEqual(result.droppedColumns, ['whatsapp_number']);
  // The invite itself is intact — only the phone number was given up.
  assert.equal(result.data.name, 'Diego Ruiz');
  assert.equal(result.data.status, 'pending');
  assert.equal(result.data.commission_rate, 8);
});

test('a missing column outside the allow list is a real bug and is surfaced', async () => {
  // total_payout_usd going missing means something is badly wrong; quietly
  // dropping it would write a payout with no total.
  const table = fakeTable(['total_payout_usd']);
  const result = await writeDroppingMissingColumns(PAYOUT, SUB_USER_PAYOUT_COLUMNS, table.run);

  assert.notEqual(result.error, null);
  assert.deepEqual(result.droppedColumns, []);
});
