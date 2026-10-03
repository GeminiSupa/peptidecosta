import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import {
  opaqueDataFromTokenResponse,
  transactionFromChargxResponse,
  verifyChargxWebhookSignature,
  withChargxCheckoutDetails,
} from '../src/lib/chargxPay.mjs';

test('a descriptor token is passed through and a bare token is wrapped', () => {
  assert.deepEqual(
    opaqueDataFromTokenResponse({
      opaqueData: { dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT', dataValue: 'abc' },
    }),
    { dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT', dataValue: 'abc' },
  );
  assert.deepEqual(opaqueDataFromTokenResponse({ token: 'tok_1' }), { token: 'tok_1' });
});

test('a tokenize error is raised without echoing the card', () => {
  assert.throws(
    () => opaqueDataFromTokenResponse({
      messages: { resultCode: 'Error', message: [{ text: 'The card number is invalid.' }] },
    }),
    /card number is invalid/,
  );
});

test('an Ok charge with their order id is an approval', () => {
  const txn = transactionFromChargxResponse({
    message: 'Ok',
    result: { orderId: 'order_01ABC', orderDisplayId: '79' },
  }, true);
  assert.equal(txn.status, 'Approved');
  assert.equal(txn.id, 'order_01ABC');
  assert.equal(txn.authorization, '79');
});

test('a decline body stays a decline even when HTTP is not ok', () => {
  const txn = transactionFromChargxResponse({
    message: 'Error creating transaction',
    error: [{ errorCode: '44', errorText: 'This transaction has been declined.' }],
  }, false);
  assert.equal(txn.status, 'Declined');
  assert.equal(txn.error.message, 'This transaction has been declined.');
});

test('an Ok body with no transaction id is not treated as paid', () => {
  assert.equal(transactionFromChargxResponse({ message: 'Ok', result: {} }, true), null);
});

test('the Chargex page link carries our order number', () => {
  const url = withChargxCheckoutDetails('https://dashboard.chargx.io/payment-form/abc', {
    orderNumber: 'CARD-1',
    email: 'buyer@example.com',
    billing: { address: 'Calle 1', city: 'San Jose', state: 'San Jose', postal_code: '10101', country: 'CR' },
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('external_order_id'), 'CARD-1');
  assert.equal(parsed.searchParams.get('country'), 'CR');
  assert.equal(parsed.searchParams.get('email'), 'buyer@example.com');
});

test('webhook signatures accept the v1= prefix and reject a tampered body', () => {
  const secret = 'whsec_test';
  const rawBody = '{"type":"payment.succeeded"}';
  const timestamp = '1710000000';
  const hex = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

  assert.equal(verifyChargxWebhookSignature({
    secret, timestamp, signatureHeader: `v1=${hex}`, rawBody,
  }), true);
  assert.equal(verifyChargxWebhookSignature({
    secret, timestamp, signatureHeader: `v1=${hex}`, rawBody: `${rawBody} `,
  }), false);
});
