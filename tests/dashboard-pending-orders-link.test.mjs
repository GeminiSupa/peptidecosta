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

test('the tile defaults to this week and offers the other windows', () => {
  assert.match(home, /useState\('week'\)/);
  assert.match(home, /\{ id: 'week', label: 'This week', start: \(now\) => startOfWeek\(now\) \}/);
  for (const id of ["'today'", "'30d'", "'all'"]) assert.ok(home.includes(`{ id: ${id},`), id);
  assert.match(home, /<div className="dashboard-kpi-value">\{pendingInRange\}<\/div>/);
  // The label stays put; the dropdown beside it is what names the window, so
  // the tile does not re-word itself every time the range changes.
  assert.match(home, /<div className="dashboard-kpi-label">Pending Orders<\/div>/);
});

test('the older pending orders stay on the tile whatever the range', () => {
  // The whole point of the second line: narrowing the window must not put the
  // backlog out of sight the way the literal-'Pending' count once did.
  assert.match(home, /stats\.pendingOrders\.length > pendingInRange &&/);
  assert.match(home, /\{stats\.pendingOrders\.length\} total/);
});

test('hovering the tile says whose week it is', () => {
  assert.match(home, /Costa Rica time\./);
  assert.match(home, /const pendingTooltip = pendingRangeTooltip\(activePendingRange, pendingRangeStart, new Date\(\)\);/);
  // On the number and on the dropdown, so it is found from either.
  assert.match(home, /title=\{pendingTooltip\}[\s\S]*?title=\{pendingTooltip\}/);
  assert.match(home, /'Every order still waiting to be paid, with no date limit\.'/);
});

test('the range dropdown sits beside the button, never inside it', () => {
  // A <select> inside a <button> is invalid, and the click goes to the wrong one.
  // Read the tile's own button body rather than regex across the whole file,
  // which happily spans a closing tag and calls a sibling a child.
  const openedAt = home.indexOf("onClick={() => setOpenTile('pendingOrders')}");
  assert.ok(openedAt > 0, 'pending tile button not found');
  const buttonBody = home.slice(openedAt, home.indexOf('</button>', openedAt));
  assert.ok(!buttonBody.includes('<select'), 'the range select is nested inside the tile button');
  assert.match(home, /<\/button>[\s\S]{0,400}?<select\s+className="dashboard-kpi-range"/);
  const css = fs.readFileSync(new URL('../src/app/admin.css', import.meta.url), 'utf8');
  assert.match(css, /\.dashboard-kpi-sub \{/);
  assert.match(css, /\.dashboard-kpi-range \{/);
  // The dropdown sits on its own row under the label rather than overlapping
  // the figure, which is what squeezed the text onto three lines.
  assert.match(css, /\.dashboard-kpi-rangerow \{/);
  assert.match(css, /\.dashboard-kpi-open \{/);
});
