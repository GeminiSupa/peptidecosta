// Which orders an affiliate is actually owed commission on.
//
// The weekly affiliate scan asked for every order in the period that was not
// 'Cancelled'. That is not the same question as "which of these were paid for".
// A refused card sits at 'Declined' and a customer who never paid sits at
// 'Pending'; both were swept in, invoiced, approved and paid. The sales-agent
// scan next door had always gated on the paid statuses — only this one did not.
//
// The gross-sales column on the same invoice read `order.total`, which is not a
// column on the orders table, so every affiliate invoice ever sent showed a
// gross of zero beside a real commission figure.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { COMMISSION_ELIGIBLE_ORDER_STATUSES } from '../src/lib/agentAttribution.mjs';

const route = fs.readFileSync(
  'src/app/api/admin/affiliates/payouts/report/route.js',
  'utf8',
);

test('the scan asks only for orders that were actually paid', () => {
  assert.match(route, /\.in\('status', COMMISSION_ELIGIBLE_ORDER_STATUSES\)/);
});

test('the old not-cancelled filter is gone', () => {
  // This is the line that paid commission on declined cards.
  assert.doesNotMatch(route, /\.not\('status', 'eq', 'Cancelled'\)/);
});

test('affiliates and sales agents agree on what counts as paid', () => {
  // Both scans read the same constant, so the two payout runs can never drift
  // into paying on different sets of orders.
  const agentScan = fs.readFileSync(
    'src/app/api/admin/commissions/weekly-report/route.js',
    'utf8',
  );
  assert.match(agentScan, /COMMISSION_ELIGIBLE_ORDER_STATUSES/);
  assert.match(route, /COMMISSION_ELIGIBLE_ORDER_STATUSES/);
});

test('an unpaid status is not in the eligible set', () => {
  const eligible = COMMISSION_ELIGIBLE_ORDER_STATUSES.map((s) => s.toLowerCase());
  for (const unpaid of ['Pending', 'Pending - Card', 'Declined', 'Error', 'Cancelled']) {
    assert.ok(
      !eligible.includes(unpaid.toLowerCase()),
      `${unpaid} must not earn commission`,
    );
  }
});

test('gross sales are read from the real total columns', () => {
  // `order.total` is undefined on every row; this is the zero on the invoices.
  assert.doesNotMatch(route, /Number\(order\.total \|\| 0\)/);
  assert.match(route, /getOrderSalesAmounts\(order\)/);
});
