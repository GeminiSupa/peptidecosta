import test from 'node:test';
import assert from 'node:assert/strict';

import { claimOrderInDb } from '../src/lib/claimOrder.js';

/**
 * Minimal stand-in for the Supabase query builder, backed by one order row.
 * `update().eq('id').is('sales_agent', null)` returns the row only when the
 * guard matches — the same semantics Postgres gives us.
 */
function makeSupabase(row) {
  const calls = { updates: 0 };

  return {
    calls,
    row,
    from() {
      const state = { op: null, payload: null, guards: {} };
      const builder = {
        update(payload) { state.op = 'update'; state.payload = payload; return builder; },
        select() {
          if (state.op !== 'update') { state.op = 'select'; return builder; }
          return Promise.resolve(builder._runUpdate());
        },
        eq(col, val) { state.guards[col] = val; return builder; },
        is(col, val) { state.guards[col] = val; return builder; },
        single() { return Promise.resolve({ data: { sales_agent: row.sales_agent }, error: null }); },
        _runUpdate() {
          const guard = 'sales_agent' in state.guards ? state.guards.sales_agent : undefined;
          const matches = guard === undefined
            ? true
            : (guard === null ? row.sales_agent === null : row.sales_agent === guard);
          if (!matches) return { data: [], error: null };
          calls.updates += 1;
          row.sales_agent = state.payload.sales_agent;
          return { data: [{ id: row.id }], error: null };
        },
      };
      return builder;
    },
  };
}

test('claims an unassigned order', async () => {
  const db = makeSupabase({ id: 1, sales_agent: null });
  const result = await claimOrderInDb(db, 1, 'Maria');

  assert.deepEqual(result, { ok: true });
  assert.equal(db.row.sales_agent, 'Maria');
});

test('second agent in a race loses and is told who won', async () => {
  const db = makeSupabase({ id: 1, sales_agent: null });

  const first = await claimOrderInDb(db, 1, 'Maria');
  const second = await claimOrderInDb(db, 1, 'Carlos');

  assert.deepEqual(first, { ok: true });
  assert.equal(second.ok, false);
  assert.equal(second.takenBy, 'Maria');
  // The loser must not overwrite the winner.
  assert.equal(db.row.sales_agent, 'Maria');
  assert.equal(db.calls.updates, 1);
});

test('re-claiming an order you already own succeeds', async () => {
  const db = makeSupabase({ id: 1, sales_agent: 'Maria' });
  const result = await claimOrderInDb(db, 1, 'maria');

  assert.deepEqual(result, { ok: true });
  assert.equal(db.row.sales_agent, 'Maria');
});

test('legacy rows storing empty string still claim', async () => {
  const db = makeSupabase({ id: 1, sales_agent: '' });
  const result = await claimOrderInDb(db, 1, 'Maria');

  assert.deepEqual(result, { ok: true });
  assert.equal(db.row.sales_agent, 'Maria');
});

test('a database error is reported without blaming another agent', async () => {
  const db = {
    from: () => ({
      update: () => ({
        eq: () => ({
          is: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
        }),
      }),
    }),
  };

  const result = await claimOrderInDb(db, 1, 'Maria');
  assert.equal(result.ok, false);
  assert.equal(result.takenBy, '');
});
