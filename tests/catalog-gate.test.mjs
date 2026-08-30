import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldScheduleAccessGate, CATALOG_GATE_DELAY_MS } from '../src/lib/catalogGate.mjs';

const browsing = { hasAccess: false, catalogLoading: false, isCartOpen: false };

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
