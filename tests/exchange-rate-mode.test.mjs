import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RATE_MODE_API,
  RATE_MODE_MANUAL,
  checkManualRate,
  readRateMode,
} from '../src/lib/exchangeRateMode.mjs';

test('a row written before the switch existed is API mode', () => {
  const info = readRateMode({ usd_crc: 446.3, source: 'currencyfreaks' });
  assert.equal(info.mode, RATE_MODE_API);
  assert.equal(info.manualRate, null);
  assert.equal(info.lastApiRate, 446.3);
});

test('a manual row reports its rate and who set it', () => {
  const info = readRateMode({
    usd_crc: 450,
    mode: 'manual',
    manual_rate: 450,
    manual_set_at: '2026-09-15T12:00:00.000Z',
    manual_set_by: 'Webster',
    last_api_rate: 446.3,
  });
  assert.equal(info.mode, RATE_MODE_MANUAL);
  assert.equal(info.manualRate, 450);
  assert.equal(info.manualSetBy, 'Webster');
  assert.equal(info.lastApiRate, 446.3);
});

test('a manual row with an unusable number falls back to API mode', () => {
  // A damaged setting must never freeze the shop on garbage.
  for (const manual_rate of [4500, 0, null, 'abc']) {
    assert.equal(readRateMode({ usd_crc: 446.3, mode: 'manual', manual_rate }).mode, RATE_MODE_API);
  }
});

test('typos outside ₡300–₡800 are refused', () => {
  for (const rate of [4500, 45, 0, -450, '', 'abc', '450,5', null]) {
    const result = checkManualRate({ rate, apiRate: 446.3, confirmed: true });
    assert.equal(result.ok, false, String(rate));
    assert.equal(result.code, 'out_of_range');
  }
});

test('a rate close to the API saves without a question', () => {
  const result = checkManualRate({ rate: '452.456', apiRate: 446.3 });
  assert.deepEqual(result, { ok: true, rate: 452.46 });
});

test('a rate more than 5% from the API needs a yes', () => {
  const asked = checkManualRate({ rate: 480, apiRate: 446.3 });
  assert.equal(asked.ok, false);
  assert.equal(asked.code, 'needs_confirmation');
  assert.match(asked.message, /Are you sure/);

  assert.deepEqual(checkManualRate({ rate: 480, apiRate: 446.3, confirmed: true }), { ok: true, rate: 480 });
});

test('with no API rate to compare, only the range applies', () => {
  assert.deepEqual(checkManualRate({ rate: 600, apiRate: null }), { ok: true, rate: 600 });
});

test('the superadmin rate control lives on Home after Health and before Recent Orders', () => {
  const home = readFileSync(new URL('../src/components/admin/DashboardHome.js', import.meta.url), 'utf8');
  const health = home.indexOf('>Health</h3>');
  const control = home.indexOf('<ExchangeRateSettings');
  const recentOrders = home.indexOf('>Recent Orders</h3>');

  assert.ok(health >= 0 && control > health && recentOrders > control);
  assert.match(home, /\{isSuperadmin && \(\s*<ExchangeRateSettings/);
});

test('the rate editor is not duplicated in Products', () => {
  const products = readFileSync(new URL('../src/components/admin/ProductsManager.js', import.meta.url), 'utf8');
  assert.doesNotMatch(products, /ExchangeRateSettings/);
});

test('active admin conversions use the selected rate instead of the emergency fallback', () => {
  const analytics = readFileSync(new URL('../src/components/admin/AnalyticsDashboard.js', import.meta.url), 'utf8');
  const orderDetail = readFileSync(new URL('../src/components/admin/OrderDetailPanel.js', import.meta.url), 'utf8');

  assert.match(analytics, /potentialAbandonedRevenueUsd \* exchangeRate/);
  // The panel no longer converts the saved total itself — the update route
  // reprices the order and writes both currencies — but its shipping pair
  // must still use the selected rate.
  assert.match(orderDetail, /getAdminShippingCosts\(ship, orderCurrency, exchangeRate\)/);
  assert.doesNotMatch(orderDetail, /total \/ ADMIN_FALLBACK_EXCHANGE_RATE/);
  assert.doesNotMatch(orderDetail, /total \* ADMIN_FALLBACK_EXCHANGE_RATE/);
});

test('the emergency rate is defined once and every alias points at it', async () => {
  const { FALLBACK_USD_CRC_RATE } = await import('../src/lib/fallbackExchangeRate.mjs');
  const { FALLBACK_EXCHANGE_RATE } = await import('../src/lib/pricing.js');
  const { ADMIN_FALLBACK_EXCHANGE_RATE } = await import('../src/lib/adminOrderTotals.mjs');
  const orderRevenue = await import('../src/lib/orderRevenue.mjs');
  assert.equal(FALLBACK_EXCHANGE_RATE, FALLBACK_USD_CRC_RATE);
  assert.equal(ADMIN_FALLBACK_EXCHANGE_RATE, FALLBACK_USD_CRC_RATE);
  assert.equal(orderRevenue.FALLBACK_USD_CRC_RATE, FALLBACK_USD_CRC_RATE);

  for (const file of ['pricing.js', 'adminOrderTotals.mjs', 'orderRevenue.mjs', 'referralStats.mjs']) {
    const source = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /=\s*454\.48/, `${file} must not hardcode the fallback rate`);
  }
});

test('the admin never adopts the emergency rate from a failed lookup', () => {
  const admin = readFileSync(new URL('../src/app/admin/page.js', import.meta.url), 'utf8');
  const fetchAt = admin.indexOf("fetch('/api/exchange-rate')");
  const okCheck = admin.indexOf('if (!res.ok) throw', fetchAt);
  const adopt = admin.indexOf('setExchangeRate(rate)', fetchAt);
  assert.ok(fetchAt >= 0 && okCheck > fetchAt && okCheck < adopt);
});
