import test from 'node:test';
import assert from 'node:assert/strict';

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
