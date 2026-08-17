import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAbandonedCartRow,
  isValidSessionId,
  recoveredCartPayload,
  shouldTrackCart,
} from '../src/lib/abandonedCartTracking.mjs';

test('session ids are bounded in shape and length', () => {
  assert.equal(isValidSessionId('session_k3j4h5g6j7h8'), true);
  assert.equal(isValidSessionId('short'), false);
  assert.equal(isValidSessionId(''), false);
  assert.equal(isValidSessionId(null), false);
  assert.equal(isValidSessionId('session with spaces'), false);
  assert.equal(isValidSessionId("session';DROP TABLE--"), false);
  assert.equal(isValidSessionId('a'.repeat(129)), false);
  assert.equal(isValidSessionId('a'.repeat(128)), true);
});

test('a cart nobody can be contacted about is not stored', () => {
  // Storing one would keep an IP, geolocation and device string for a shopper
  // who can never be mailed about it.
  assert.equal(shouldTrackCart({}), false);
  assert.equal(shouldTrackCart({ customerName: '   ' }), false);
  assert.equal(shouldTrackCart({ customerName: 'Ana' }), true);
  assert.equal(shouldTrackCart({ customerPhone: '88887777' }), true);
  assert.equal(shouldTrackCart({ customerEmail: 'a@b.com' }), true);
});

test('the request IP and user agent outrank anything the browser claims', () => {
  const row = buildAbandonedCartRow({
    sessionId: 'session_abcdefghijk',
    cart: [{ product: 'Retatrutide 10mg', qty: 1 }],
    customerName: ' Ana ',
    metadata: {
      ip_address: '1.2.3.4',
      device_info: 'TotallyLegitBrowser/1.0',
      location_data: { city: 'San José' },
    },
    requestIp: '203.0.113.9',
    userAgent: 'Mozilla/5.0 (real)',
  });

  assert.equal(row.ip_address, '203.0.113.9');
  assert.equal(row.device_info, 'Mozilla/5.0 (real)');
  // Geolocation has no server-side equivalent, so the looked-up value stands.
  assert.deepEqual(row.location_data, { city: 'San José' });
  assert.equal(row.customer_name, 'Ana');
});

test('the client-reported values are still used when the request has none', () => {
  const row = buildAbandonedCartRow({
    sessionId: 'session_abcdefghijk',
    metadata: { ip_address: '1.2.3.4', device_info: 'Firefox' },
    requestIp: null,
    userAgent: null,
  });

  assert.equal(row.ip_address, '1.2.3.4');
  assert.equal(row.device_info, 'Firefox');
});

test('blank contact fields are stored as null rather than empty strings', () => {
  const row = buildAbandonedCartRow({
    sessionId: 'session_abcdefghijk',
    customerName: '',
    customerPhone: '   ',
    customerEmail: null,
  });

  assert.equal(row.customer_name, null);
  assert.equal(row.customer_phone, null);
  assert.equal(row.customer_email, null);
});

test('lang and currency fall back rather than storing whatever was sent', () => {
  const row = buildAbandonedCartRow({ sessionId: 'session_abcdefghijk', lang: 'fr', currency: 'GBP' });
  assert.equal(row.lang, 'es');
  assert.equal(row.currency, 'CRC');

  const en = buildAbandonedCartRow({ sessionId: 'session_abcdefghijk', lang: 'en', currency: 'USD' });
  assert.equal(en.lang, 'en');
  assert.equal(en.currency, 'USD');
});

test('a missing or malformed cart becomes an empty array, never null', () => {
  assert.deepEqual(buildAbandonedCartRow({ sessionId: 'session_abcdefghijk' }).cart_data, []);
  assert.deepEqual(
    buildAbandonedCartRow({ sessionId: 'session_abcdefghijk', cart: 'nope' }).cart_data,
    [],
  );
});

test('recovery returns the checkout fields and withholds the tracking data', () => {
  const payload = recoveredCartPayload({
    session_id: 'session_abcdefghijk',
    cart_data: [{ product: 'BPC-157 5mg', qty: 1 }],
    customer_name: 'Ana',
    customer_phone: '88887777',
    customer_email: 'ana@example.com',
    ip_address: '203.0.113.9',
    location_data: { city: 'San José' },
    device_info: 'Mozilla/5.0',
    status: 'active',
  });

  assert.deepEqual(Object.keys(payload).sort(), [
    'cart_data', 'customer_email', 'customer_name', 'customer_phone', 'session_id',
  ]);
  // A recovery link is a capability — whoever holds it gets the row — so it
  // must not also hand over the shopper's IP, location and device fingerprint.
  assert.equal(payload.ip_address, undefined);
  assert.equal(payload.location_data, undefined);
  assert.equal(payload.device_info, undefined);

  assert.equal(recoveredCartPayload(null), null);
});
