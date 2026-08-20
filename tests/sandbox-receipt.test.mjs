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
