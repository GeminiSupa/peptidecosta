import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldScheduleAccessGate, CATALOG_GATE_DELAY_MS } from '../src/lib/catalogGate.mjs';

const browsing = { hasAccess: false, catalogLoading: false, isCartOpen: false, cartItemCount: 0 };

test('a new visitor browsing the loaded catalog is gated', () => {
  assert.equal(shouldScheduleAccessGate(browsing), true);
});

test('never over an open cart', () => {
  // The overlay covers the drawer, so the gate would land on the order total
  // and the checkout button. A customer at the till is not a browsing visitor.
  assert.equal(shouldScheduleAccessGate({ ...browsing, isCartOpen: true }), false);
});

test('closing the cart re-arms the gate', () => {
  // Deferred, not spent: the caller re-runs this when the drawer closes.
  assert.equal(shouldScheduleAccessGate({ ...browsing, isCartOpen: true }), false);
  assert.equal(shouldScheduleAccessGate({ ...browsing, isCartOpen: false }), true);
});

test('a visitor who already unlocked is never gated again', () => {
  assert.equal(shouldScheduleAccessGate({ ...browsing, hasAccess: true }), false);
  assert.equal(
    shouldScheduleAccessGate({ ...browsing, hasAccess: true, isCartOpen: true }),
    false,
  );
});

test('not while the catalog is still loading', () => {
  assert.equal(shouldScheduleAccessGate({ ...browsing, catalogLoading: true }), false);
});

test('the defaults describe a new visitor on a loaded catalog', () => {
  assert.equal(shouldScheduleAccessGate(), true);
});

test('the delay leaves time to see the catalog', () => {
  assert.equal(CATALOG_GATE_DELAY_MS, 15000);
});

test('never over a visitor who is holding a cart', () => {
  // The stronger of the two cart rules. Someone who has added a vial is not a
  // lead to capture — and checkout collects their name, email and phone
  // anyway, so gating them wins nothing the order would not have produced.
  assert.equal(shouldScheduleAccessGate({ ...browsing, cartItemCount: 1 }), false);
  assert.equal(shouldScheduleAccessGate({ ...browsing, cartItemCount: 12 }), false);
});

test('closing the drawer does not re-arm the gate over a full cart', () => {
  // This was the bug. The exemption was keyed on the drawer alone, so a
  // visitor who added something and closed it to keep shopping was gated
  // fifteen seconds later regardless.
  assert.equal(shouldScheduleAccessGate({ ...browsing, isCartOpen: true, cartItemCount: 2 }), false);
  assert.equal(shouldScheduleAccessGate({ ...browsing, isCartOpen: false, cartItemCount: 2 }), false);
});

test('an emptied cart is a browsing visitor again', () => {
  assert.equal(shouldScheduleAccessGate({ ...browsing, cartItemCount: 0 }), true);
});

test('a count that is not a number does not silently gate a customer', () => {
  // cart.reduce over a malformed saved cart can yield NaN or undefined; a
  // comparison against those is false, which would let the gate through.
  assert.equal(shouldScheduleAccessGate({ ...browsing, cartItemCount: undefined }), true);
  assert.equal(shouldScheduleAccessGate({ ...browsing, cartItemCount: NaN }), true);
  assert.equal(shouldScheduleAccessGate({ ...browsing, cartItemCount: '3' }), false);
});
