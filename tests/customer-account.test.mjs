import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClaimBlocklist,
  buildCustomerProfileRow,
  isEmailClaimable,
  normalizeEmail,
  selectClaimableOrders,
} from '../src/lib/customerAccount.mjs';

test('addresses match regardless of casing or stray whitespace', () => {
  assert.equal(normalizeEmail('  Customer@Example.COM '), 'customer@example.com');
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail(null), null);
});

test('a verified customer claims only their own unowned orders', () => {
  const orders = [
    { id: 'a', customer_email: 'Customer@Example.com', customer_user_id: null },
    { id: 'b', customer_email: 'customer@example.com ', customer_user_id: null },
    { id: 'c', customer_email: 'someone.else@example.com', customer_user_id: null },
  ];

  assert.deepEqual(
    selectClaimableOrders(orders, { email: 'customer@example.com' }).map((o) => o.id),
    ['a', 'b'],
  );
});

test('an order already owned is never re-claimed by a matching email', () => {
  // Support corrects a disputed order by hand. The original owner logging back
  // in must not silently take it back.
  const orders = [
    { id: 'corrected', customer_email: 'shared@example.com', customer_user_id: 'the-real-owner' },
  ];

  assert.deepEqual(selectClaimableOrders(orders, { email: 'shared@example.com' }), []);
});

test('a staff address claims nothing', () => {
  // korinneda@icloud.com carries 24 live orders under 24 different customer
  // names. Verifying it must not hand over two dozen strangers' addresses.
  const blocklist = buildClaimBlocklist([
    { email: 'KorinneDA@icloud.com' },
    { email: 'info@peptidescostarica.net' },
  ]);

  const orders = [
    { id: 'x', customer_email: 'korinneda@icloud.com', customer_user_id: null },
    { id: 'y', customer_email: 'korinneda@icloud.com', customer_user_id: null },
  ];

  assert.equal(isEmailClaimable('korinneda@icloud.com', blocklist), false);
  assert.deepEqual(selectClaimableOrders(orders, { email: 'korinneda@icloud.com', blocklist }), []);
});

test('a placeholder address claims nothing', () => {
  // abc@abc.com carries 25 orders under 25 names, and the domain resolves.
  const blocklist = buildClaimBlocklist(['abc@abc.com', 'a@b.com']);

  assert.equal(isEmailClaimable('abc@abc.com', blocklist), false);
  assert.equal(isEmailClaimable('a@b.com', blocklist), false);
  assert.equal(isEmailClaimable('real.customer@gmail.com', blocklist), true);
});

test('a genuine repeat customer is unaffected by the blocklist', () => {
  const blocklist = buildClaimBlocklist(['abc@abc.com']);
  const orders = [
    { id: '1', customer_email: 'carolinajodafe@gmail.com', customer_user_id: null },
    { id: '2', customer_email: 'carolinajodafe@gmail.com', customer_user_id: null },
  ];

  assert.deepEqual(
    selectClaimableOrders(orders, { email: 'carolinajodafe@gmail.com', blocklist }).map((o) => o.id),
    ['1', '2'],
  );
});

test('an empty or unverified email claims nothing', () => {
  const orders = [{ id: 'a', customer_email: null, customer_user_id: null }];
  assert.deepEqual(selectClaimableOrders(orders, { email: null }), []);
  assert.deepEqual(selectClaimableOrders(orders, { email: '  ' }), []);
  assert.equal(isEmailClaimable('', new Set()), false);
});

test('the profile row normalizes its email and defaults to Spanish', () => {
  assert.deepEqual(
    buildCustomerProfileRow({ userId: 'u1', email: ' Customer@Example.com ', displayName: ' Ana ' }),
    { user_id: 'u1', email: 'customer@example.com', display_name: 'Ana', phone: null, locale: 'es' },
  );

  assert.equal(
    buildCustomerProfileRow({ userId: 'u1', email: 'a@b.com', locale: 'EN' }).locale,
    'en',
  );
  assert.equal(
    buildCustomerProfileRow({ userId: 'u1', email: 'a@b.com', locale: 'fr' }).locale,
    'es',
  );
  assert.equal(buildCustomerProfileRow({ userId: null, email: 'a@b.com' }), null);
});
