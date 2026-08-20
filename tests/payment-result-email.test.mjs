import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PAYMENT_RESULT_EMAIL_TIMEOUT_MS,
  sendCardHandoffReceipt,
  sendPaymentResultEmails,
  shouldSendPaymentResultEmail,
} from '../src/lib/paymentResultEmail.mjs';
import { buildOrderNotificationPayload } from '../src/lib/adminOrderEmail.mjs';

const ORDER = {
  order_number: 'CARD-TEST1',
  customer_name: 'Diego',
  customer_phone: '50688887777',
  customer_email: 'buyer@example.com',
  shipping_address: 'San Jose',
  currency: 'CRC',
  total_crc: 147891,
  total_usd: 325.41,
  shipping_cost_crc: 0,
  payment_method: 'card',
  status: 'Paid',
  items: [{ product: 'Retatrutide', qty: 1, price: 147891 }],
};

function makeFetch(results = { adminNotification: { sent: true }, customerReceipt: { sent: true } }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ success: true, results }) };
  };
  return { fetchImpl, calls };
}

test('only a settled payment is worth mailing about', () => {
  assert.equal(shouldSendPaymentResultEmail('Paid'), true);
  assert.equal(shouldSendPaymentResultEmail('Declined'), true);
  assert.equal(shouldSendPaymentResultEmail('Payment Blocked'), true);
  // A 3DS hand-off is not an outcome; the webhook mails once the bank answers.
  assert.equal(shouldSendPaymentResultEmail('Pending - Card 3DS'), false);
  assert.equal(shouldSendPaymentResultEmail('Pending - Card'), false);
});

test('an unsettled order sends nothing at all', async () => {
  const { fetchImpl, calls } = makeFetch();

  const result = await sendPaymentResultEmails('https://catalog.peptidescostarica.net',
    { ...ORDER, status: 'Pending - Card 3DS' }, 'CARD-TEST1', { fetchImpl });

  assert.equal(result.sent, false);
  assert.equal(result.skipped, 'not-settled');
  assert.equal(calls.length, 0);
});

test('one call mails the customer and the team, so the two cannot disagree', async () => {
  const { fetchImpl, calls } = makeFetch();

  await sendPaymentResultEmails('https://catalog.peptidescostarica.net', ORDER, 'CARD-TEST1', { fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://catalog.peptidescostarica.net/api/order-notification');

  const body = calls[0].body;
  assert.equal(body.adminNotificationOnly, false);
  assert.equal(body.customerReceiptOnly, false);
  assert.equal(body.forceCustomerReceipt, true);
  assert.equal(body.notificationKind, 'payment-result');
  assert.equal(body.status, 'Paid');
  assert.equal(body.orderNumber, 'CARD-TEST1');
  assert.equal(body.customerEmail, 'buyer@example.com');
});

test('a refused card carries the gateway wording through to the mail', async () => {
  const { fetchImpl, calls } = makeFetch();

  await sendPaymentResultEmails('https://catalog.peptidescostarica.net',
    { ...ORDER, status: 'Declined' }, 'CARD-TEST1',
    { fetchImpl, declineReason: 'Card brand not allowed' });

  assert.equal(calls[0].body.status, 'Declined');
  assert.equal(calls[0].body.declineReason, 'Card brand not allowed');
});

test('a mail failure is reported, never thrown at a payment that went through', async () => {
  const fetchImpl = async () => { throw new Error('SMTP unreachable'); };

  const result = await sendPaymentResultEmails('https://catalog.peptidescostarica.net', ORDER, 'CARD-TEST1', { fetchImpl });

  assert.equal(result.sent, false);
  assert.equal(result.error, 'SMTP unreachable');
});

test('the send waits longer than the mail route waits on SMTP', () => {
  assert.ok(PAYMENT_RESULT_EMAIL_TIMEOUT_MS >= 30000);
});

test('the team new-order alert is unchanged and still admin-only', () => {
  // Dropping this flag double-mails every customer, so it must survive the
  // builder gaining options.
  const payload = buildOrderNotificationPayload(ORDER, 'CARD-TEST1');

  assert.equal(payload.adminNotificationOnly, true);
  assert.equal(payload.customerReceiptOnly, false);
  assert.equal(payload.forceCustomerReceipt, false);
  assert.equal(payload.notificationKind, 'new-order');
  assert.equal(payload.declineReason, null);
});

test('a 3DS hand-off still tells the customer their order exists', async () => {
  const { fetchImpl, calls } = makeFetch({ customerReceipt: { sent: true } });

  await sendCardHandoffReceipt('https://catalog.peptidescostarica.net',
    { ...ORDER, status: 'Pending - Card 3DS' }, 'CARD-TEST1', { fetchImpl });

  const body = calls[0].body;
  assert.equal(body.status, 'Pending - Card 3DS');
  // Customer only: the team's new-order alert has already gone out, and a
  // hand-off to the bank is not news.
  assert.equal(body.customerReceiptOnly, true);
  assert.equal(body.forceCustomerReceipt, true);
  assert.equal(body.notificationKind, 'new-order');
});

test('a card checkout gets one team email, flagged as the order alert itself', async () => {
  const { fetchImpl, calls } = makeFetch();

  await sendPaymentResultEmails('https://catalog.peptidescostarica.net', ORDER, 'CARD-TEST1',
    { fetchImpl, firstTeamAlert: true });

  assert.equal(calls[0].body.firstTeamAlert, true);
  assert.equal(calls[0].body.adminNotificationOnly, false);
});

test('a later payment on an already-alerted order is not flagged as new', async () => {
  const { fetchImpl, calls } = makeFetch();

  await sendPaymentResultEmails('https://catalog.peptidescostarica.net', ORDER, 'CARD-TEST1', { fetchImpl });

  assert.equal(calls[0].body.firstTeamAlert, false);
});

test('the order-creation route holds the team alert only for card orders', () => {
  const route = fs.readFileSync('src/app/api/orders/create/route.js', 'utf8');

  // A card order's alert waits for the charge result.
  assert.match(route, /admin email \(deferred to payment result\)/);
  // A non-card order has no charge step, so its alert must still go at once.
  assert.match(route, /\['admin email', sendAdminOrderEmail\(/);
});
