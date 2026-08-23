// Guards for the USD -> CRC feed.
//
// On 22 Aug 2026 a provider quoted 484.50 against a prior 450.45 and it went
// straight onto the storefront, overcharging colón buyers ~7% for five hours
// (orders WPCR-MT4RZPWO and CARD-MT53H4R3). These tests replay that shape.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchLiveUsdToCrcRate,
  isPlausibleRate,
  MAX_RATE_DEVIATION_PCT,
} from '../src/lib/pricing.js';

const CF = 'currencyfreaks.com';
const ER = 'open.er-api.com';
const JD = 'jsdelivr.net';

const realFetch = globalThis.fetch;
const realKey = process.env.CURRENCYFREAKS_API_KEY;

// CurrencyFreaks quotes rates as strings; the other two as numbers.
const cfBody = (rate) => ({ rates: { CRC: String(rate) } });
const erBody = (rate) => ({ rates: { CRC: rate } });
const jdBody = (rate) => ({ usd: { crc: rate } });

function stubProviders(bodies) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const host = Object.keys(bodies).find((h) => String(url).includes(h));
    if (!host) return { ok: false, status: 404, json: async () => ({}) };
    const body = bodies[host];
    if (body === 'down') throw new Error('network unreachable');
    return { ok: true, status: 200, json: async () => body };
  };
  return calls;
}

function restore() {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.CURRENCYFREAKS_API_KEY;
  else process.env.CURRENCYFREAKS_API_KEY = realKey;
}

test('the 22 Aug 2026 spike is refused and a sane provider is used instead', async (t) => {
  t.after(restore);
  process.env.CURRENCYFREAKS_API_KEY = 'test-key';
  stubProviders({
    [CF]: cfBody(484.50),   // the bad quote that actually shipped
    [ER]: erBody(450.02),
    [JD]: jdBody(449.87),
  });

  const result = await fetchLiveUsdToCrcRate({ previousRate: 450.45 });

  assert.notEqual(result.rate, 484.50, '484.50 must never reach the storefront again');
  assert.equal(result.rate, 450.02);
  assert.equal(result.source, 'open.er-api.com');
});

test('a lone provider cannot move the rate more than the deviation limit', async (t) => {
  t.after(restore);
  process.env.CURRENCYFREAKS_API_KEY = 'test-key';
  stubProviders({ [CF]: cfBody(484.50), [ER]: 'down', [JD]: 'down' });

  // Nothing corroborates the jump and nothing else answers, so the caller is
  // told to keep whatever rate it already had.
  assert.equal(await fetchLiveUsdToCrcRate({ previousRate: 450.45 }), null);
});

test('a real market move is accepted once a second provider agrees', async (t) => {
  t.after(restore);
  process.env.CURRENCYFREAKS_API_KEY = 'test-key';
  stubProviders({ [CF]: cfBody(505.00), [ER]: erBody(504.10), [JD]: jdBody(505.60) });

  const result = await fetchLiveUsdToCrcRate({ previousRate: 450.45 });

  assert.equal(result.rate, 505.00, 'a genuine devaluation must still get through');
  assert.equal(result.source, 'currencyfreaks+open.er-api.com');
});

test('an ordinary day costs exactly one request', async (t) => {
  t.after(restore);
  process.env.CURRENCYFREAKS_API_KEY = 'test-key';
  const calls = stubProviders({ [CF]: cfBody(443.94), [ER]: erBody(443.90), [JD]: jdBody(443.80) });

  const result = await fetchLiveUsdToCrcRate({ previousRate: 450.45 });

  assert.equal(result.rate, 443.94);
  assert.equal(result.source, 'currencyfreaks');
  assert.equal(calls.length, 1, 'the free providers should not be polled unnecessarily');
});

test('garbage outside the outer fence is skipped, not served', async (t) => {
  t.after(restore);
  process.env.CURRENCYFREAKS_API_KEY = 'test-key';
  // A decimal shift and a zeroed field — the classic broken-feed shapes.
  stubProviders({ [CF]: cfBody(44394), [ER]: erBody(0), [JD]: jdBody(443.94) });

  const result = await fetchLiveUsdToCrcRate({ previousRate: 450.45 });

  assert.equal(result.rate, 443.94);
  assert.equal(result.source, 'currency-api');
});

test('CurrencyFreaks is skipped when no key is configured', async (t) => {
  t.after(restore);
  delete process.env.CURRENCYFREAKS_API_KEY;
  const calls = stubProviders({ [CF]: cfBody(999), [ER]: erBody(443.94), [JD]: jdBody(443.80) });

  const result = await fetchLiveUsdToCrcRate({ previousRate: 450.45 });

  assert.equal(result.source, 'open.er-api.com');
  assert.ok(!calls.some((u) => u.includes(CF)), 'must not call CurrencyFreaks without a key');
});

test('the API key never appears in a logged source label', async (t) => {
  t.after(restore);
  process.env.CURRENCYFREAKS_API_KEY = 'super-secret-key';
  stubProviders({ [CF]: cfBody(443.94), [ER]: erBody(443.90), [JD]: jdBody(443.80) });

  const result = await fetchLiveUsdToCrcRate({ previousRate: 450.45 });

  assert.ok(!result.source.includes('super-secret-key'));
});

test('the first ever fetch has no anchor and takes the first plausible quote', async (t) => {
  t.after(restore);
  process.env.CURRENCYFREAKS_API_KEY = 'test-key';
  stubProviders({ [CF]: cfBody(443.94), [ER]: erBody(443.90), [JD]: jdBody(443.80) });

  const result = await fetchLiveUsdToCrcRate({ previousRate: null });

  assert.equal(result.rate, 443.94);
});

test('the outer fence and the deviation limit are set where we think', () => {
  assert.equal(isPlausibleRate(484.50), true, '484.50 is plausible in absolute terms...');
  assert.equal(MAX_RATE_DEVIATION_PCT, 5, '...so the deviation check is what actually catches it');
  assert.equal(isPlausibleRate(44394), false);
  assert.equal(isPlausibleRate(4.4394), false);
  assert.equal(isPlausibleRate(0), false);
  assert.equal(isPlausibleRate(null), false);
  assert.equal(isPlausibleRate('443.94'), true, 'CurrencyFreaks string quotes must pass');
});
