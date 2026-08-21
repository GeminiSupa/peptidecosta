// What a card charge is allowed to be priced from.
//
// The catalog route used to hand the gateway `amount` straight out of the POST
// body. A $900 order could be charged $1 by anyone willing to edit the request,
// and the order still came back marked Paid — the row said 900, the bank moved
// 1, and only the "verify the amount before fulfilling" line in the bell stood
// between that and a shipped parcel.
//
// The fix prices every charge from the order row. The claim that already locks
// the order returns that row, so these tests pin both halves: the lock hands the
// money columns back, and the route charges from them.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { claimOrderForPayment, PROCESSING_STATUS } from '../src/lib/cardPaymentLock.js';

/**
 * A Supabase stub that records the query it was asked to build.
 *
 * Every filter returns `this`, so the real call chain runs unchanged and the
 * terminal `.select()` resolves with whatever rows the test wants back.
 */
function fakeSupabase({ rows = [], error = null } = {}) {
  const calls = { selected: null, updated: null, table: null };
  const chain = {
    update(patch) { calls.updated = patch; return chain; },
    eq() { return chain; },
    not() { return chain; },
    neq() { return chain; },
    select(columns) { calls.selected = columns; return Promise.resolve({ data: rows, error }); },
  };
  return {
    calls,
    from(table) { calls.table = table; return chain; },
  };
}

test('a winning claim hands back the order row to price the charge from', async () => {
  const supabase = fakeSupabase({
    rows: [{ order_number: 'WPCR-1', total_usd: 918, total_crc: 417213, currency: 'CRC' }],
  });

  const claim = await claimOrderForPayment(supabase, 'WPCR-1');

  assert.equal(claim.claimed, true);
  assert.equal(claim.order.total_usd, 918, 'the stored total must come back with the claim');
});

test('the claim asks for the money columns, not just the order number', async () => {
  const supabase = fakeSupabase({ rows: [{ order_number: 'WPCR-1' }] });

  await claimOrderForPayment(supabase, 'WPCR-1');

  // Without these the route has nothing authoritative to charge and would fall
  // back to whatever the request asked for, which is the whole bug.
  assert.match(supabase.calls.selected, /total_usd/);
  assert.match(supabase.calls.selected, /currency/);
});

test('a losing claim carries no order, so nothing can be charged from it', async () => {
  const supabase = fakeSupabase({ rows: [] });

  const claim = await claimOrderForPayment(supabase, 'WPCR-1');

  assert.equal(claim.claimed, false);
  assert.equal(claim.order, undefined);
});

test('the claim still locks the row it wins', async () => {
  const supabase = fakeSupabase({ rows: [{ order_number: 'WPCR-1', total_usd: 10 }] });

  await claimOrderForPayment(supabase, 'WPCR-1');

  assert.equal(supabase.calls.table, 'orders');
  assert.equal(supabase.calls.updated.status, PROCESSING_STATUS);
});

test('a database error is not mistaken for a successful claim', async () => {
  const supabase = fakeSupabase({ rows: null, error: { message: 'boom' } });

  const claim = await claimOrderForPayment(supabase, 'WPCR-1');

  assert.equal(claim.claimed, false);
  assert.equal(claim.error.message, 'boom');
});

test('the card route charges the stored total and never the posted amount', () => {
  const route = fs.readFileSync('src/app/api/shieldhubpay/process-card/route.js', 'utf8');

  // The figure handed to the gateway must be derived from the claimed row.
  assert.match(route, /const storedAmount = Number\(claim\.order\?\.total_usd \|\| 0\)/);
  assert.match(route, /normalizeAmount\(storedAmount, currency\)/);

  // And must no longer be derived from the request body. Anchored on the
  // assignment so this tests the call site, not `function normalizeAmount(
  // amount, currency)` — the declaration keeps those parameter names.
  assert.doesNotMatch(
    route,
    /=\s*normalizeAmount\(amount,/,
    'the posted amount must not reach the gateway',
  );
});

test('an order with no usable total releases its lock instead of stranding', () => {
  const route = fs.readFileSync('src/app/api/shieldhubpay/process-card/route.js', 'utf8');
  const guard = route.slice(
    route.indexOf('const storedAmount'),
    route.indexOf('const formattedAmount'),
  );

  // Bailing out after the claim without releasing it leaves the order stuck in
  // "Processing - Card", which no later attempt can ever claim again.
  assert.match(guard, /releaseOrderClaim\(supabase, orderNumber\)/);
});
