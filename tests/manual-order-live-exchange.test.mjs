import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/admin/orders/create/route.js', 'utf8');
const modal = fs.readFileSync('src/components/admin/ManualOrderModal.js', 'utf8');
const adminPage = fs.readFileSync('src/app/admin/page.js', 'utf8');

test('manual order creation resolves the guarded database-backed checkout rate on the server', () => {
  assert.match(route, /getDatabaseBackedUsdToCrcRate\(\)/);
  assert.match(route, /getAdminCurrencyPair\(primaryTotal, currency, liveExchangeRate\)/);
  assert.doesNotMatch(route, /454\.48/);
});

test('the manual order preview receives and displays the same live admin rate', () => {
  assert.match(adminPage, /exchangeRate=\{exchangeRate\}/);
  assert.match(modal, /Live checkout rate/);
  assert.match(modal, /getAdminCurrencyPair\(total, form\.currency, liveExchangeRate\)/);
  assert.doesNotMatch(modal, /total \/ 454\.48|total \* 454\.48/);
});

test('switching manual order currency reprices selected products with the live rate', () => {
  assert.match(modal, /Math\.round\(usd \* liveExchangeRate\)/);
  assert.match(modal, /onChange=\{\(e\) => changeCurrency\(e\.target\.value\)\}/);
});
