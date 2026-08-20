import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPaymentOutcome,
  declineReasonFrom,
  gatewayStatusToOrderStatus,
  ORDER_STATUS,
} from '../src/lib/paymentOutcome.mjs';

test('every settled wording the panel produces reads as paid', () => {
  assert.equal(classifyPaymentOutcome('Paid'), 'paid');
  assert.equal(classifyPaymentOutcome('paid'), 'paid');
  assert.equal(classifyPaymentOutcome('Order Complete'), 'paid');
  assert.equal(classifyPaymentOutcome('Completed'), 'paid');
});

test('a refusal reads as declined whatever the gateway called it', () => {
  // The exact-match check this replaces only caught the first of these, so
  // every other refusal was shown to the customer as still processing.
  assert.equal(classifyPaymentOutcome('Declined'), 'declined');
  assert.equal(classifyPaymentOutcome('Payment Blocked'), 'declined');
  assert.equal(classifyPaymentOutcome('Blocked'), 'declined');
  assert.equal(classifyPaymentOutcome('Error'), 'declined');
  assert.equal(classifyPaymentOutcome('Payment Failed'), 'declined');
  assert.equal(classifyPaymentOutcome('Cancelled'), 'declined');
  assert.equal(classifyPaymentOutcome('Rechazado'), 'declined');
});

test('only genuinely unfinished orders read as pending', () => {
  assert.equal(classifyPaymentOutcome('Pending'), 'pending');
  assert.equal(classifyPaymentOutcome('Payment Pending'), 'pending');
  assert.equal(classifyPaymentOutcome('Pending - Card'), 'pending');
  assert.equal(classifyPaymentOutcome('Pending - Card 3DS'), 'pending');
  assert.equal(classifyPaymentOutcome('Processing'), 'pending');
  assert.equal(classifyPaymentOutcome(''), 'pending');
  assert.equal(classifyPaymentOutcome(null), 'pending');
});

test('settled beats every refusal marker, so a completed order is never an error', () => {
  assert.equal(classifyPaymentOutcome('Order Complete - cancelled shipment'), 'paid');
});

test('the gateway status map is case-insensitive', () => {
  // A direct charge answers "Approved"; a transaction re-read for a webhook
  // came back "approved", and the old exact-match map turned that into
  // "Payment approved" — a status nothing recognised as settled.
  assert.equal(gatewayStatusToOrderStatus('Approved'), ORDER_STATUS.PAID);
  assert.equal(gatewayStatusToOrderStatus('approved'), ORDER_STATUS.PAID);
  assert.equal(gatewayStatusToOrderStatus('APPROVED'), ORDER_STATUS.PAID);
});

test('Blocked lands on a status the admin panel actually filters on', () => {
  // "Payment Blocked" belonged to no status group, so those orders appeared
  // under none of the panel's filters.
  assert.equal(gatewayStatusToOrderStatus('Blocked'), ORDER_STATUS.DECLINED);
  assert.equal(gatewayStatusToOrderStatus('Declined'), ORDER_STATUS.DECLINED);
  assert.equal(gatewayStatusToOrderStatus('Rejected'), ORDER_STATUS.DECLINED);
});

test('a gateway error stays apart from a bank refusal', () => {
  assert.equal(gatewayStatusToOrderStatus('Failed'), ORDER_STATUS.ERROR);
  // Both still tell the customer the same thing: the money did not move.
  assert.equal(classifyPaymentOutcome(ORDER_STATUS.ERROR), 'declined');
});

test('3DS and in-flight statuses stay pending', () => {
  assert.equal(gatewayStatusToOrderStatus('Redirect'), ORDER_STATUS.CARD_3DS);
  assert.equal(gatewayStatusToOrderStatus('redirect'), ORDER_STATUS.CARD_3DS);
  assert.equal(gatewayStatusToOrderStatus('Pending'), ORDER_STATUS.CARD_PENDING);
  assert.equal(gatewayStatusToOrderStatus(''), ORDER_STATUS.CARD_PENDING);
});

test('an unrecognised gateway status is left pending for a human, never guessed', () => {
  const seen = [];
  const status = gatewayStatusToOrderStatus('Quantum', { onUnknown: (raw) => seen.push(raw) });

  assert.equal(status, ORDER_STATUS.CARD_PENDING);
  assert.deepEqual(seen, ['Quantum']);
});

test('the decline reason is the gateway wording a customer can act on', () => {
  assert.equal(
    declineReasonFrom({ status: 'Declined', error: { message: 'The card has insufficient funds' } }),
    'The card has insufficient funds',
  );
  assert.equal(
    declineReasonFrom({ status: 'Blocked', error: { message: 'Card brand not allowed' } }),
    'Card brand not allowed',
  );
  // The gateway's own misspelled key, as seen in the test-payment route.
  assert.equal(declineReasonFrom({ error: { messsage: 'Do not honour' } }), 'Do not honour');
});

test('success wording and placeholders are never shown as a decline reason', () => {
  assert.equal(declineReasonFrom({ error: { message: 'Approved transaction' } }), null);
  assert.equal(declineReasonFrom({ error: { message: 'No URL' } }), null);
  assert.equal(declineReasonFrom({}), null);
  assert.equal(declineReasonFrom(null), null);
});

test('a decline reason containing "completed" survives', () => {
  // isPaidLike matches on "complet", which would have swallowed this one.
  assert.equal(
    declineReasonFrom({ error: { message: 'The transaction could not be completed' } }),
    'The transaction could not be completed',
  );
});
