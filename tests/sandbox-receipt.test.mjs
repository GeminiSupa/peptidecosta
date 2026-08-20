import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/admin/test-payment/route.js', 'utf8');
const panel = fs.readFileSync('src/components/admin/TestPaymentPanel.js', 'utf8');

test('the sandbox receipt is customer-only, so the team is never copied', () => {
  // A TEST- order in everyone's inbox is the noise this panel exists to avoid;
  // every real card order already produces the team alert.
  assert.match(route, /customerReceiptOnly: true/);
  assert.doesNotMatch(route, /adminNotificationOnly: true/);
});

test('the sandbox receipt goes only to the admin who pressed the button', () => {
  assert.match(route, /to: auth\.user\?\.email/);
  assert.match(route, /customer_email: to/);
});

test('the receipt travels the real mail route, not a private copy of the template', () => {
  // Rendering the template here would prove the wording and nothing else.
  assert.match(route, /\/api\/order-notification/);
  assert.match(route, /buildOrderNotificationPayload/);
});

test('an order with no items would be rejected by the mail route, so tests carry one', () => {
  assert.doesNotMatch(route, /items: \[\],/);
  assert.match(route, /TEST ITEM \(sandbox payment\)/);
});

test('the double-charge burst sends no mail', () => {
  assert.match(panel, /sendReceipt: false/);
  assert.match(route, /body\.sendReceipt !== false/);
});

test('the panel can ask for the Spanish receipt most customers get', () => {
  assert.match(panel, /useState\('es'\)/);
  assert.match(route, /body\.lang === 'en' \? 'en' : 'es'/);
});

test('the Payment Test panel is actually reachable from the dashboard', async () => {
  // It was not: the component and its API route both existed while nothing
  // imported the panel, so there was no sidebar entry and no way in.
  const { ADMIN_MODULES, ADMIN_TAB_IDS } = await import('../src/lib/adminModules.js');
  const adminPage = fs.readFileSync('src/app/admin/page.js', 'utf8');

  const entry = ADMIN_MODULES.find((m) => m.id === 'payment_test');
  assert.ok(entry, 'payment_test is not registered as an admin module');
  assert.equal(entry.superadminOnly, true, 'sandbox charges must stay superadmin-only');
  assert.ok(ADMIN_TAB_IDS.has('payment_test'));
  assert.ok(!entry.hiddenFromNav, 'it must appear in the sidebar');

  assert.match(adminPage, /import TestPaymentPanel from '@\/components\/admin\/TestPaymentPanel'/);
  assert.match(adminPage, /activeTab === 'payment_test'/);
  assert.match(adminPage, /<TestPaymentPanel \/>/);
});

test('the desktop sidebar lists Payment Test, not just the module registry', () => {
  // Registering the module and mounting the panel is not enough to see it.
  // The desktop sidebar is a hardcoded list of tab ids in admin/page.js with
  // its own group names ("Operations", not "System & AI"), so a module missing
  // from that array renders nowhere on desktop however correctly it is
  // declared. That is exactly how this tab stayed invisible.
  const adminPage = fs.readFileSync('src/app/admin/page.js', 'utf8');
  const operations = adminPage.match(/\{ title: 'Operations', tabs: \[([^\]]*)\] \}/);

  assert.ok(operations, 'the Operations sidebar group has moved or been renamed');
  assert.match(operations[1], /'payment_test'/);
});
