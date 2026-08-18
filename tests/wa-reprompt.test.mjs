import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldScheduleWaReprompt,
  WA_REPROMPT_COOLDOWN_MS,
  WA_REPROMPT_MAX_DISMISSES,
} from '../src/lib/waReprompt.mjs';

const eligible = { hasAccess: true, optedIn: false, isCartOpen: false, state: {} };

test('an unlocked visitor who never opted in is asked', () => {
  assert.equal(shouldScheduleWaReprompt(eligible), true);
});

test('never over an open cart', () => {
  // The card lands on the total and the submit button. A customer at the till
  // is not a browsing visitor.
  assert.equal(shouldScheduleWaReprompt({ ...eligible, isCartOpen: true }), false);
});

test('closing the cart makes the visitor askable again', () => {
  // Deferred, not spent: the same visitor, same untouched cooldown record.
  assert.equal(shouldScheduleWaReprompt({ ...eligible, isCartOpen: true }), false);
  assert.equal(shouldScheduleWaReprompt({ ...eligible, isCartOpen: false }), true);
});

test('nobody who has not unlocked the catalog, and nobody already opted in', () => {
  assert.equal(shouldScheduleWaReprompt({ ...eligible, hasAccess: false }), false);
  assert.equal(shouldScheduleWaReprompt({ ...eligible, optedIn: true }), false);
});

test('two dismissals end it for good', () => {
  assert.equal(shouldScheduleWaReprompt({ ...eligible, state: { dismisses: 1 } }), true);
  assert.equal(
    shouldScheduleWaReprompt({ ...eligible, state: { dismisses: WA_REPROMPT_MAX_DISMISSES } }),
    false,
  );
  assert.equal(shouldScheduleWaReprompt({ ...eligible, state: { dismisses: 9 } }), false);
});

test('at most once every three days', () => {
  const now = 1_000_000_000_000;
  const justShown = { ...eligible, state: { lastShown: now - 1000 }, now };
  const longAgo = { ...eligible, state: { lastShown: now - WA_REPROMPT_COOLDOWN_MS - 1 }, now };

  assert.equal(shouldScheduleWaReprompt(justShown), false);
  assert.equal(shouldScheduleWaReprompt(longAgo), true);
});

test('a malformed stored record does not silence the prompt forever', () => {
  // The component parses localStorage, which can hold anything.
  assert.equal(shouldScheduleWaReprompt({ ...eligible, state: { dismisses: 'x', lastShown: 'y' } }), true);
  assert.equal(shouldScheduleWaReprompt({ ...eligible, state: null }), true);
});

test('called with nothing, it asks nobody', () => {
  assert.equal(shouldScheduleWaReprompt(), false);
});
