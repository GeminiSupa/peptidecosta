import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  internalJsonHeaders,
  verifyInternalRequest,
} from '../src/lib/internalRequestAuth.mjs';
import {
  consumeDurableRateLimit,
  isTrustedStorefrontRequest,
  readLimitedJson,
  RequestBodyError,
} from '../src/lib/publicApiSecurity.mjs';
import {
  createCardCheckoutToken,
  verifyCardCheckoutToken,
} from '../src/lib/cardPaymentLink.js';

process.env.INTERNAL_API_SECRET = 'test-internal-api-secret';
process.env.API_RATE_LIMIT_SALT = 'test-rate-limit-salt';
process.env.SHIELD_HUB_PAY_API_SECRET = 'test-payment-secret';

test('internal signatures are bound to path, body, and a short time window', () => {
  const body = JSON.stringify({ orderNumber: 'TEST-1' });
  const timestamp = 1_800_000_000_000;
  const headers = internalJsonHeaders(body, '/api/order-notification', { timestamp });
  const request = new Request('https://catalog.peptidescostarica.net/api/order-notification', { headers });

  assert.equal(verifyInternalRequest(request, body, '/api/order-notification', { now: timestamp }), true);
  assert.equal(verifyInternalRequest(request, `${body} `, '/api/order-notification', { now: timestamp }), false);
  assert.equal(verifyInternalRequest(request, body, '/api/other', { now: timestamp }), false);
  assert.equal(verifyInternalRequest(request, body, '/api/order-notification', { now: timestamp + 6 * 60 * 1000 }), false);
});

test('storefront origin checks allow company subdomains, Referer headers, and reject foreign sites', () => {
  const company = new Request('https://catalog.peptidescostarica.net/api/orders/create', {
    headers: { Origin: 'https://checkout.peptidescostarica.net' },
  });
  const foreign = new Request('https://catalog.peptidescostarica.net/api/orders/create', {
    headers: { Origin: 'https://attacker.example' },
  });
  const missingOriginWithValidReferer = new Request('https://catalog.peptidescostarica.net/api/orders/create', {
    headers: { Referer: 'https://peptidescostarica.net/catalog' },
  });
  const missingOriginWithForeignReferer = new Request('https://catalog.peptidescostarica.net/api/orders/create', {
    headers: { Referer: 'https://attacker.example/page' },
  });
  const companyHostNoOrigin = new Request('https://catalog.peptidescostarica.net/api/orders/create');

  assert.equal(isTrustedStorefrontRequest(company), true);
  assert.equal(isTrustedStorefrontRequest(foreign), false);
  assert.equal(isTrustedStorefrontRequest(missingOriginWithValidReferer), true);
  assert.equal(isTrustedStorefrontRequest(missingOriginWithForeignReferer), false);
  assert.equal(isTrustedStorefrontRequest(companyHostNoOrigin), true);
});

test('JSON bodies are rejected before an oversized payload can be processed', async () => {
  const request = new Request('https://example.test/api', {
    method: 'POST',
    body: JSON.stringify({ text: 'x'.repeat(200) }),
  });

  await assert.rejects(
    () => readLimitedJson(request, 32),
    (error) => error instanceof RequestBodyError && error.status === 413,
  );
});

test('durable rate limiting uses the service-role RPC and fails closed on errors', async () => {
  let params;
  const allowed = await consumeDurableRateLimit({
    rpc: async (name, input) => {
      assert.equal(name, 'consume_api_rate_limit');
      params = input;
      return { data: [{ allowed: true, remaining: 2, retry_after: 30 }], error: null };
    },
  }, { bucket: 'test', key: '203.0.113.10', limit: 3, windowSeconds: 60 });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.remaining, 2);
  assert.match(params.p_key_hash, /^[a-f0-9]{64}$/);

  const unavailable = await consumeDurableRateLimit({
    rpc: async () => ({ data: null, error: { message: 'function missing' } }),
  }, { bucket: 'test', key: '203.0.113.10', limit: 3, windowSeconds: 60 });
  assert.equal(unavailable.allowed, false);
  assert.equal(unavailable.unavailable, true);
});

test('card checkout tokens expire and are bound to both order number and row id', () => {
  const now = 1_800_000_000_000;
  const token = createCardCheckoutToken('CARD-ABC123', 'row-42', { now, ttlSeconds: 60 });

  assert.equal(verifyCardCheckoutToken(token, 'CARD-ABC123', { now })?.orderId, 'row-42');
  assert.equal(verifyCardCheckoutToken(token, 'CARD-OTHER', { now }), null);
  assert.equal(verifyCardCheckoutToken(token, 'CARD-ABC123', { now: now + 61_000 }), null);
  assert.equal(verifyCardCheckoutToken(`${token}x`, 'CARD-ABC123', { now }), null);
});

test('all service-consuming routes carry their required guards', () => {
  const orderMail = fs.readFileSync('src/app/api/order-notification/route.js', 'utf8');
  const recoveryMail = fs.readFileSync('src/app/api/abandoned-cart-notification/route.js', 'utf8');
  const createOrder = fs.readFileSync('src/app/api/orders/create/route.js', 'utf8');
  const ai = fs.readFileSync('src/app/api/ai/route.js', 'utf8');
  const card = fs.readFileSync('src/app/api/shieldhubpay/process-card/route.js', 'utf8');
  const catalog = fs.readFileSync('src/app/catalog/page.js', 'utf8');

  assert.match(orderMail, /verifyInternalRequest/);
  assert.match(orderMail, /verifyAdminSession/);
  assert.match(recoveryMail, /verifyAdminSession/);
  assert.match(recoveryMail, /\.from\('abandoned_carts'\)[\s\S]*\.select\('\*'\)/);
  assert.doesNotMatch(catalog, /fetch\('\/api\/order-notification'/);

  assert.match(createOrder, /consumeDurableRateLimit/);
  assert.match(createOrder, /isTrustedStorefrontRequest/);
  assert.match(createOrder, /createCardCheckoutToken/);
  assert.match(ai, /bucket: 'customer-ai-ip'/);
  assert.match(card, /verifyCardCheckoutToken/);
  assert.match(card, /bucket: 'card-attempt-order'/);
});
