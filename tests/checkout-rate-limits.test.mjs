import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  limiterUnavailableMessage,
  normalizeOrderEmailKey,
  normalizeOrderPhoneKey,
  orderContactLimits,
  tooManyAttemptsMessage,
  tooManyAttemptsTitle,
  ORDERS_PER_CONTACT_PER_DAY,
  ORDER_ATTEMPTS_PER_IP_PER_HOUR,
  ORDER_CONTACT_WINDOW_SECONDS,
} from '../src/lib/checkoutRateLimits.mjs';

import {
  shouldSendExchangeRateAlert,
  exchangeRateAlertSubject,
  exchangeRateAlertBody,
  EXCHANGE_RATE_ALERT_RECIPIENT,
} from '../src/lib/exchangeRateAlert.mjs';

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

test('email and phone are separate allowances, both at fifteen a day', () => {
  const limits = orderContactLimits({
    customer_email: 'Homeoka@Yahoo.com ',
    customer_phone: '+506 8706-3824',
  });

  assert.equal(limits.length, 2);
  assert.deepEqual(limits.map((l) => l.bucket).sort(), ['order-create-email', 'order-create-phone']);
  for (const limit of limits) {
    assert.equal(limit.limit, ORDERS_PER_CONTACT_PER_DAY);
    assert.equal(limit.limit, 15);
    assert.equal(limit.windowSeconds, ORDER_CONTACT_WINDOW_SECONDS);
  }
});

test('the same person written two ways lands in the same bucket', () => {
  const typed = orderContactLimits({ customer_email: '  KARINA@x.com', customer_phone: '+506 8706 3824' });
  const stored = orderContactLimits({ customer_email: 'karina@x.com', customer_phone: '50687063824' });
  assert.deepEqual(typed.map((l) => l.key), stored.map((l) => l.key));
});

test('a guest with no email does not share one bucket with every other guest', () => {
  // The combined "email|phone" key this replaces would hash an absent email to
  // the same empty prefix for everyone, and the phone kept them apart only by
  // accident. A bucket is skipped entirely when its value is missing.
  const limits = orderContactLimits({ customer_email: '', customer_phone: '50687063824' });
  assert.deepEqual(limits.map((l) => l.bucket), ['order-create-phone']);

  const blank = orderContactLimits({ customer_email: null, customer_phone: null });
  assert.deepEqual(blank, []);
});

test('normalizers strip the formatting a phone keyboard adds', () => {
  assert.equal(normalizeOrderPhoneKey('+506 8706-3824'), '50687063824');
  assert.equal(normalizeOrderEmailKey('  Foo@Bar.COM '), 'foo@bar.com');
});

test('the blocked message is short, and never says to press the button again', () => {
  for (const lang of ['en', 'es']) {
    const message = tooManyAttemptsMessage(lang);
    assert.match(message, /WhatsApp/);
    assert.doesNotMatch(message, /press the button again/i);
    assert.doesNotMatch(message, /presione el botón de nuevo/i);

    // A customer stopped mid-checkout reads one line or none. Anything longer
    // than this is an explanation of our abuse controls, which is our problem
    // and not hers.
    assert.ok(message.length <= 100, `too long (${message.length}): ${message}`);
    assert.ok(tooManyAttemptsTitle(lang).length <= 30);
    assert.ok(limiterUnavailableMessage(lang).length <= 100);
  }
  assert.match(tooManyAttemptsMessage('en'), /unusual activity/i);
  assert.match(tooManyAttemptsMessage('es'), /actividad inusual/i);
});

test('the IP allowance is well clear of one carrier NAT hour', () => {
  assert.equal(ORDER_ATTEMPTS_PER_IP_PER_HOUR, 40);
});

test('the checkout route peeks at contact limits and consumes only after the insert', () => {
  const route = read('src/app/api/orders/create/route.js');

  // Peeked before the work.
  assert.match(route, /peekDurableRateLimit\(supabase, contactLimit\)/);
  // Consumed after it, and after the insert-error branch has already returned.
  const insertFailed = route.indexOf("console.error('[orders/create] Insert failed:");
  const consumed = route.indexOf('consumeDurableRateLimit(supabase, contactLimit)');
  assert.ok(insertFailed > 0 && consumed > insertFailed,
    'contact limits must be consumed only after a successful insert');

  // The old combined key and the old ceiling are gone.
  assert.doesNotMatch(route, /order-create-contact/);
  assert.doesNotMatch(route, /limit: 5,/);
});

test('a repricing refusal carries the rate the customer needs to recover', () => {
  const route = read('src/app/api/orders/create/route.js');
  const changed = route.slice(route.indexOf('if (authoritative.changed)'));
  assert.match(changed.slice(0, 1200), /exchangeRate: rateResult\.rate/);
});

test('the catalog adopts the server rate and retries instead of looping', () => {
  const catalog = read('src/app/catalog/page.js');

  assert.match(catalog, /const adoptServerPricing = \(data\) =>/);
  assert.match(catalog, /repriceRetriesLeft/);
  // Bounded: one retry, never a loop.
  assert.match(catalog, /repriceRetriesLeft: repriceRetriesLeft - 1/);
  // Silent only when the customer is not paying more.
  assert.match(catalog, /serverTotal <= shownTotal/);

  // The copy that sent a blocked customer back into the counter is gone.
  assert.doesNotMatch(catalog, /Press the button again — if it keeps failing/);
  assert.doesNotMatch(catalog, /Presione el botón de nuevo — si sigue fallando/);
});

test('the catalog refuses an exchange rate the API could not stand behind', () => {
  const catalog = read('src/app/catalog/page.js');
  assert.match(catalog, /if \(res\.ok && isPlausibleRate\(data\.rate\)\)/);
  assert.match(catalog, /const useCachedExchangeRate = \(\) =>/);
});

test('a stale rate keeps pricing the shop instead of jumping to the constant', () => {
  const source = read('src/lib/exchangeRate.js');
  assert.doesNotMatch(source, /fallback:expired/);
  assert.match(source, /maybeAlertStaleExchangeRate\(supabase, stored\)/);
});

test('the stale-rate alert waits two days, then repeats daily', () => {
  const hours = (n) => n * 60 * 60 * 1000;
  const now = Date.parse('2026-09-10T00:00:00Z');

  assert.equal(shouldSendExchangeRateAlert({ ageMs: hours(47), lastAlertAt: null, now }), false);
  assert.equal(shouldSendExchangeRateAlert({ ageMs: hours(48), lastAlertAt: null, now }), true);

  // Sent an hour ago: not again.
  assert.equal(shouldSendExchangeRateAlert({
    ageMs: hours(72), lastAlertAt: '2026-09-09T23:00:00Z', now,
  }), false);

  // Sent a day ago: again.
  assert.equal(shouldSendExchangeRateAlert({
    ageMs: hours(72), lastAlertAt: '2026-09-09T00:00:00Z', now,
  }), true);

  // An unreadable marker must not become a mail loop.
  assert.equal(shouldSendExchangeRateAlert({ ageMs: hours(72), lastAlertAt: 'not a date', now }), false);
});

test('the alert says IMPORTANT, goes to the owner, and states the real rate', () => {
  const stale = {
    rate: 448.065,
    updatedAt: '2026-09-08T04:30:54.589Z',
    ageMs: 50 * 60 * 60 * 1000,
    source: 'currencyfreaks',
  };
  assert.match(exchangeRateAlertSubject(stale.ageMs), /^IMPORTANT: /);
  assert.equal(EXCHANGE_RATE_ALERT_RECIPIENT, 'omerforce@gmail.com');

  const body = exchangeRateAlertBody(stale);
  assert.match(body, /448\.065/);
  assert.match(body, /NOT using a hardcoded number/);
});

test('the migration ships both the peek function and the exchange-rate lock', () => {
  const sql = read('fix-checkout-limits-and-rate-lock.sql');
  assert.match(sql, /create or replace function public\.peek_api_rate_limit/);
  assert.match(sql, /grant execute on function public\.peek_api_rate_limit\(text, text, integer, integer\) to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.peek_api_rate_limit[^;]*to (anon|authenticated)/);
  // Settings writes are staff-only, and the rate is off limits even to staff.
  assert.match(sql, /using \(public\.is_admin_user\(\) and id <> 'exchange_rate'\)/);
  assert.match(sql, /with check \(public\.is_admin_user\(\) and id <> 'exchange_rate'\)/);
});
