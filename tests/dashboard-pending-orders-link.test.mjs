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
const css = fs.readFileSync(new URL('../src/app/admin.css', import.meta.url), 'utf8');

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
  assert.match(home, /isAwaitingPayment\(o\.status\) && inRange\(new Date\(o\.created_at\)\)/);
  assert.match(home, /isAwaitingPayment\(order\.status\) && inRange\(new Date\(order\.created_at\)\)/);
  assert.match(page, /const pendingOrderCount = visibleOrders\.filter\(\(o\) => isAwaitingPayment\(o\.status\)\)\.length;/);
  assert.match(orders, /statuses: AWAITING_PAYMENT_STATUSES,/);
  // Nobody may re-hardcode the narrow test the tile used to run.
  assert.doesNotMatch(home, /\(o\.status \|\| 'Pending'\) === 'Pending'/);
  assert.doesNotMatch(page, /\(o\.status \|\| 'Pending'\) === 'Pending'/);
});

test('one dropdown drives the whole KPI row, defaulting to today', () => {
  assert.match(home, /const \[kpiRange, setKpiRange\] = useState\('today'\);/);
  // Whatever the default, it has to be one of the offered windows.
  assert.match(home, /\{ id: 'today', label: 'Today', start: \(now\) => startOfDay\(now\) \}/);
  assert.match(home, /\{ id: 'week', label: 'This week', start: \(now\) => startOfWeek\(now\) \}/);
  for (const id of ["'today'", "'30d'", "'all'"]) assert.ok(home.includes(`{ id: ${id},`), id);
  // One control above the grid, not one per tile.
  assert.equal((home.match(/className="dashboard-kpi-range"/g) || []).length, 1);
  assert.match(home, /aria-label="Date range for the figures below"/);
  assert.match(css, /\.dashboard-kpi-rangebar \{/);
});

test('every figure in the row reads the same window', () => {
  // 'All time' has no start, so an absent start must mean "everything".
  assert.match(home, /const inRange = \(date\) => !kpiRangeStart \|\| date >= kpiRangeStart;/);
  assert.match(home, /orderCountsAsSale\(o\) && inRange\(getRevenueDate\(o\)\)/);
  assert.match(home, /\(c\.status === 'active' \|\| !c\.status\) && inRange\(new Date\(c\.created_at\)\)/);
  // Both memos have to recompute when the window moves, or a tile goes stale.
  assert.match(home, /\}, \[orders, abandonedCarts, leads, products, exchangeRate, kpiRangeStart\]\);/);
  assert.match(home, /\}, \[orders, exchangeRate, kpiRangeStart\]\);/);
});

test('the split Today and This Week revenue tiles are gone', () => {
  // They contradict a shared window: two fixed periods in a row that claims one.
  assert.doesNotMatch(home, /revenueToday/);
  assert.doesNotMatch(home, /revenueWeek/);
  assert.match(home, /<div className="dashboard-kpi-label">Revenue<\/div>/);
});

test('no tile carries its own dropdown or a total in small print', () => {
  assert.doesNotMatch(home, /dashboard-kpi-sub/);
  assert.doesNotMatch(home, /dashboard-kpi-rangerow/);
  assert.doesNotMatch(home, /waiting in total/);
  assert.doesNotMatch(css, /\.dashboard-kpi-sub \{/);
  // A select nested in a button is invalid markup and swallows the click, so
  // the row's control must sit outside every card.
  const gridAt = home.indexOf('<div className="dashboard-kpi-grid">');
  assert.ok(gridAt > home.indexOf('className="dashboard-kpi-range"'), 'the control belongs above the grid');
});

test('the Trustpilot quota keeps its own month', () => {
  // A monthly allowance shown over a week would misread as five times the room.
  assert.match(home, /const monthStart = startOfMonth\(now\);/);
  assert.doesNotMatch(home, /INVITE_TRIGGER_STATUSES\.has\(o\.status\) && o\.customer_email && inRange/);
});

test('hovering says which days, and whose', () => {
  assert.match(home, /Costa Rica time\./);
  assert.match(home, /const kpiRangeHint = kpiRangeTooltip\(activeKpiRange, kpiRangeStart, new Date\(\)\);/);
  assert.match(home, /'Everything on record, with no date limit\.'/);
  // On the dropdown and on each tile, so it is found from either.
  assert.ok((home.match(/title=\{kpiRangeHint\}/g) || []).length >= 4);
});

test('a breakdown names the window it was opened in', () => {
  assert.match(home, /revenue: `Revenue, \$\{activeKpiRange\.label\.toLowerCase\(\)\}`/);
  assert.match(home, /pendingOrders: `Pending Orders, \$\{activeKpiRange\.label\.toLowerCase\(\)\}`/);
});

// The card used to open the unfiltered queue, so a "5 pending orders" prompt
// landed the reader on every order including the completed ones.
test('the pending-orders card opens the queue filtered to what it counted', () => {
  assert.match(home, /navOptions: \{ orderStatus: 'group:needs_payment' \}/);
  assert.match(home, /onNavigate\(item\.tab, null, item\.navOptions\)/);
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
