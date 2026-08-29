import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync(new URL('../src/components/admin/DashboardHome.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/app/admin/page.js', import.meta.url), 'utf8');
const orders = fs.readFileSync(new URL('../src/components/admin/OrdersManager.js', import.meta.url), 'utf8');

// The card used to open the unfiltered queue, so a "5 pending orders" prompt
// landed the reader on every order including the completed ones.
test('the pending-orders card asks for the status it counted', () => {
  assert.match(home, /navOptions: \{ orderStatus: 'Pending' \}/);
  assert.match(home, /onNavigate\(item\.tab, null, item\.navOptions\)/);
});

test('the card and the filter it opens count the same orders', () => {
  // The tile counts strictly 'Pending'; asking for a wider group would show
  // more rows than the number that was clicked.
  assert.match(home, /pendingOrders = orders\.filter\(\(o\) => \(o\.status \|\| 'Pending'\) === 'Pending'\)/);
  assert.match(home, /navOptions: \{ orderStatus: 'Pending' \}/);
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
