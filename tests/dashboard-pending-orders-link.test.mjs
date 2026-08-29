import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  AWAITING_PAYMENT_STATUSES,
  isAwaitingPayment,
} from '../src/lib/orderAwaitingPayment.mjs';

const home = fs.readFileSync(new URL('../src/components/admin/DashboardHome.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/app/admin/page.js', import.meta.url), 'utf8');
const orders = fs.readFileSync(new URL('../src/components/admin/OrdersManager.js', import.meta.url), 'utf8');

test('every state that is waiting on money counts as awaiting payment', () => {
  for (const status of AWAITING_PAYMENT_STATUSES) assert.equal(isAwaitingPayment(status), true);
  // An order written before the column had a default reads as Pending.
  assert.equal(isAwaitingPayment(''), true);
  assert.equal(isAwaitingPayment(null), true);
  assert.equal(isAwaitingPayment('  payment pending  '), true);
});

test('a settled or refused order is not waiting for anything', () => {
  for (const status of ['Order Complete', 'Completed', 'Paid', 'Processing', 'Refunded', 'Cancelled', 'Declined']) {
    assert.equal(isAwaitingPayment(status), false);
  }
  // Reads like a pending state and is not one: paymentOutcome.mjs normalises it
  // as a refusal, and a refused card is not waiting to be paid.
  assert.equal(isAwaitingPayment('Payment Blocked'), false);
});

test('the dashboard, the nav badge and the orders filter share one list', () => {
  assert.match(home, /import \{ isAwaitingPayment \} from '@\/lib\/orderAwaitingPayment\.mjs';/);
  assert.match(home, /const pendingOrders = orders\.filter\(\(o\) => isAwaitingPayment\(o\.status\)\)/);
  assert.match(home, /\.filter\(\(order\) => isAwaitingPayment\(order\.status\)\)/);
  assert.match(page, /const pendingOrderCount = visibleOrders\.filter\(\(o\) => isAwaitingPayment\(o\.status\)\)\.length;/);
  assert.match(orders, /statuses: AWAITING_PAYMENT_STATUSES,/);
  // Nobody may re-hardcode the narrow test the tile used to run.
  assert.doesNotMatch(home, /\(o\.status \|\| 'Pending'\) === 'Pending'/);
  assert.doesNotMatch(page, /\(o\.status \|\| 'Pending'\) === 'Pending'/);
});

// The card used to open the unfiltered queue, so a "5 pending orders" prompt
// landed the reader on every order including the completed ones.
test('the pending-orders card opens the queue filtered to what it counted', () => {
  assert.match(home, /navOptions: \{ orderStatus: 'group:needs_payment' \}/);
  assert.match(home, /onNavigate\(item\.tab, null, item\.navOptions\)/);
  // The group it asks for has to be the one built from the shared list, or the
  // number and the rows behind it drift apart again.
  assert.match(orders, /id: 'needs_payment',[\s\S]*?statuses: AWAITING_PAYMENT_STATUSES,/);
});

test('the admin page carries the requested status through to the orders table', () => {
  assert.match(page, /if \(tabId === 'orders' && options\.orderStatus\) \{/);
  assert.match(page, /setOrdersStatusRequest\(\{ status: options\.orderStatus, at: Date\.now\(\) \}\)/);
  assert.match(page, /<OrdersManager[\s\S]*?statusFilterRequest=\{ordersStatusRequest\}[\s\S]*?\/>/);
});

test('the orders table applies the requested status and resets to page one', () => {
  assert.match(orders, /statusFilterRequest = null/);
  assert.match(orders, /setOrderStatusFilter\(statusFilterRequest\.status\)/);
  assert.match(orders, /setOrdersCurrentPage\(1\)/);
  // A timestamp on the request is what lets the same card work a second time.
  assert.match(orders, /\}, \[statusFilterRequest\]\);/);
});
