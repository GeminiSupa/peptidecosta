import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCompleteLike,
  isFirstPaidTransition,
  isPaidLike,
  shouldSendPaidConfirmation,
} from '../src/lib/orderStatusEmails.mjs';

test('paid and completed both count as settled', () => {
  assert.equal(isPaidLike('Paid'), true);
  assert.equal(isPaidLike('paid'), true);
  assert.equal(isPaidLike('Order Complete'), true);
  assert.equal(isPaidLike('completed'), true);
  assert.equal(isPaidLike('Pending'), false);
  assert.equal(isPaidLike(''), false);
  assert.equal(isPaidLike(null), false);
});

test('completion is recognised whatever wording the panel used', () => {
  assert.equal(isCompleteLike('Order Complete'), true);
  assert.equal(isCompleteLike('completed'), true);
  assert.equal(isCompleteLike('Paid'), false);
});

test('the first paid transition is detected once, not on every later save', () => {
  assert.equal(isFirstPaidTransition('Pending', 'Paid'), true);
  assert.equal(isFirstPaidTransition('Paid', 'Order Complete'), false);
  assert.equal(isFirstPaidTransition('Paid', 'Paid'), false);
  assert.equal(isFirstPaidTransition('Pending', 'Pending'), false);
  assert.equal(isFirstPaidTransition(null, 'Paid'), true);
  assert.equal(isFirstPaidTransition('Pending', ''), false);
});

test('becoming paid sends the confirmation receipt', () => {
  assert.equal(shouldSendPaidConfirmation('Pending', 'Paid'), true);
  assert.equal(shouldSendPaidConfirmation(null, 'Paid'), true);
});

// The Aug 2026 duplicate: unpaid straight to complete fired the confirmation
// here AND the completed mail from /api/order-shipped-notification, so the
// customer got the same receipt twice and the accountant two tax copies.
test('jumping straight to complete leaves the mail to the shipped route', () => {
  assert.equal(shouldSendPaidConfirmation('Pending', 'Order Complete'), false);
  assert.equal(shouldSendPaidConfirmation('Pending', 'completed'), false);
  assert.equal(shouldSendPaidConfirmation(null, 'Order Complete'), false);
});

test('completing an already-paid order sends nothing from here', () => {
  assert.equal(shouldSendPaidConfirmation('Paid', 'Order Complete'), false);
});

test('a status change that is not a settlement sends nothing', () => {
  assert.equal(shouldSendPaidConfirmation('Pending', 'Cancelled'), false);
  assert.equal(shouldSendPaidConfirmation('Pending', 'Shipped'), false);
});
