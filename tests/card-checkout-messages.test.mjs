import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CARD_CHECKOUT_MESSAGE_KEYS, cardCheckoutMessage } from '../src/lib/cardCheckoutMessages.mjs';

const route = fs.readFileSync('src/app/api/shieldhubpay/process-card/route.js', 'utf8');
const catalog = fs.readFileSync('src/app/catalog/page.js', 'utf8');

test('no internal wording can reach a customer from the card route', () => {
  // Each of these was returned verbatim and printed on the checkout under
  // "The card payment did not go through".
  for (const leak of [
    'Shield Hub Pay credentials are not configured',
    'Card payments are currently configured for USD only',
    'Missing required billing fields',
    'Order not found',
    'This order is already paid',
  ]) {
    assert.ok(
      !route.includes(`error: '${leak}`),
      `"${leak}" is still returned to the browser`,
    );
  }
  // The raw exception text was the worst of them.
  assert.ok(!route.includes("error: error.message"), 'raw exception text is still returned');
  // The internal reason is still logged, just not sent.
  assert.match(route, /console\.error\(`\[Shield Hub Pay\] \$\{code\}/);
});

test('every stop is answered in the customer language', () => {
  for (const key of CARD_CHECKOUT_MESSAGE_KEYS) {
    const en = cardCheckoutMessage(key, 'en');
    const es = cardCheckoutMessage(key, 'es');
    assert.ok(en.message.length > 20, `${key} has no English message`);
    assert.ok(es.message.length > 20, `${key} has no Spanish message`);
    assert.notEqual(en.message, es.message, `${key} is not translated`);
    assert.equal(en.code, key);
  }
});

test('an unconfirmed payment never claims nothing was charged', () => {
  // We do not know. A gateway that captures and then times out is
  // indistinguishable here from one that was never reached.
  for (const lang of ['en', 'es']) {
    const { message, retryable } = cardCheckoutMessage('unconfirmed', lang);
    assert.doesNotMatch(message, /nothing has been charged|ning\u00fan cargo/i);
    assert.equal(retryable, false, 'a retry builds a new order number and can double-charge');
  }
});

test('a stop that cannot be retried locks the button instead of inviting a retry', () => {
  assert.match(catalog, /data\.retryable === false/);
  assert.match(catalog, /setCardRetryBlocked\(true\)/);
  assert.match(catalog, /disabled=\{cardSubmitting \|\| cardRetryBlocked/);
});

test('a gateway decline still gets our own follow-up sentence', () => {
  // Its message is the bank's reason, not a complete instruction.
  assert.match(route, /errorCode: 'declined'/);
  assert.match(catalog, /const isGatewayDecline = !data\.errorCode \|\| data\.errorCode === 'declined'/);
});

test('an unknown key falls back to a safe message rather than throwing', () => {
  const fallback = cardCheckoutMessage('no-such-key', 'en');
  assert.equal(fallback.code, 'unavailable');
  assert.equal(fallback.retryable, false);
});

test('the browser-side network failure stops promising nothing was charged', () => {
  assert.doesNotMatch(catalog, /Nothing has been charged\. Check your internet connection/);
});

test('the rate-limit stops go through the catalog like every other stop', () => {
  // These two were correct English shown to Spanish buyers — the last customer
  // messages still written inline in the route instead of the catalog.
  for (const inlineMessage of [
    'Payment protection is temporarily unavailable',
    'Too many card attempts',
  ]) {
    assert.ok(
      !route.includes(inlineMessage),
      `"${inlineMessage}" is still hard-coded in the route`,
    );
  }
  assert.match(route, /stopCheckout\('rate_limited'/);
  assert.match(route, /stopCheckout\('protection_unavailable'/);
  // Retry-After has to survive the move into stopCheckout.
  assert.match(route, /rateLimitHeaders\(deniedLimit\)/);
});

test('a rate-limited attempt never locks the button', () => {
  // Both stops happen before the gateway is touched, so the card was not used
  // and there is nothing for the customer to do but wait and press again.
  for (const key of ['rate_limited', 'protection_unavailable']) {
    assert.equal(cardCheckoutMessage(key, 'en').retryable, true, key);
  }
});
