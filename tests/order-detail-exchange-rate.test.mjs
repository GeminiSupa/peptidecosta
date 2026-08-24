import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../src/app/admin/page.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../src/components/admin/OrderDetailPanel.js', import.meta.url), 'utf8');

test('order detail receives the live exchange rate from the CRM page', () => {
  assert.match(page, /<OrderDetailPanel[\s\S]*?exchangeRate=\{exchangeRate\}[\s\S]*?\/>/);
  assert.match(panel, /exchangeRate = ADMIN_FALLBACK_EXCHANGE_RATE/);
});

test('order detail converts both shipping and preview total with the live rate', () => {
  assert.match(panel, /getAdminShippingCosts\(shipping, orderCurrency, exchangeRate\)/);
  assert.match(panel, /getAdminShippingCosts\(ship, orderCurrency, exchangeRate\)/);
  assert.match(panel, /getAdminCurrencyPair\(orderTotal, orderCurrency, exchangeRate\)/);
  assert.match(panel, /Shipping USD equivalent:/);
  assert.match(panel, /Total \(preview\)[\s\S]*?totalCosts\.usd\.toFixed\(2\)/);
});
