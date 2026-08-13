import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOrderNotificationPayload,
  sendAdminOrderEmail,
} from '../src/lib/adminOrderEmail.mjs';

const ORDER = {
  order_number: 'TEST-1',
  customer_name: 'Omer',
  customer_phone: '50684046973',
  customer_email: 'customer@example.com',
  shipping_address: 'San Jose',
  currency: 'USD',
  total_usd: 120,
  shipping_cost_usd: 10,
  payment_method: 'sinpe',
  items: [{ product: 'BPC-157', qty: 2, price: 60 }],
};

/** Records every call instead of making one. */
function makeFetch(response = { ok: true, json: async () => ({ success: true }) }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return response;
  };
  return { fetchImpl, calls };
}

test('the admin email is posted to the notification route', async () => {
  const { fetchImpl, calls } = makeFetch();

  await sendAdminOrderEmail('https://catalog.peptidescostarica.net', ORDER, 'TEST-1', { fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://catalog.peptidescostarica.net/api/order-notification');
  assert.equal(calls[0].options.method, 'POST');
});

test('the customer is not mailed twice — the browser already sent their receipt', async () => {
  const { fetchImpl, calls } = makeFetch();

  await sendAdminOrderEmail('https://example.test', ORDER, 'TEST-1', { fetchImpl });

  assert.equal(calls[0].body.adminNotificationOnly, true);
});

test('a failed send is reported, never swallowed', async () => {
  const { fetchImpl } = makeFetch({
    ok: false,
    status: 500,
    json: async () => ({ error: 'SMTP refused the connection' }),
  });

  await assert.rejects(
    () => sendAdminOrderEmail('https://example.test', ORDER, 'TEST-1', { fetchImpl }),
    /SMTP refused the connection/
  );
});

test('a structured SMTP failure returned with HTTP 200 is still reported', async () => {
  const { fetchImpl } = makeFetch({
    ok: true,
    status: 200,
    json: async () => ({
      success: false,
      results: { adminNotification: { sent: false, error: 'Provider rejected sender' } },
    }),
  });

  await assert.rejects(
    () => sendAdminOrderEmail('https://example.test', ORDER, 'TEST-1', { fetchImpl }),
    /Provider rejected sender/
  );
});

test('the payload carries what the team needs to act on the order', () => {
  const payload = buildOrderNotificationPayload(ORDER, 'TEST-1');

  assert.equal(payload.orderNumber, 'TEST-1');
  assert.equal(payload.customerName, 'Omer');
  assert.equal(payload.customerPhone, '50684046973');
  assert.equal(payload.total, 120);
  assert.equal(payload.shipping, 10);
  assert.equal(payload.subtotal, 120);
  assert.equal(payload.currency, 'USD');
  assert.deepEqual(payload.items, ORDER.items);
});

test('a colon order is summarised in colones and Spanish', () => {
  const payload = buildOrderNotificationPayload({
    ...ORDER,
    currency: 'CRC',
    total_crc: 60000,
    shipping_cost_crc: 3000,
  }, 'TEST-2');

  assert.equal(payload.currency, 'CRC');
  assert.equal(payload.total, 60000);
  assert.equal(payload.shipping, 3000);
  assert.equal(payload.lang, 'es');
});

test('manual discounts are separated from volume discounts in notifications', () => {
  const payload = buildOrderNotificationPayload({
    ...ORDER,
    total_usd: 95,
    shipping_cost_usd: 10,
    discount_amount_usd: 5,
    manual_discount_amount_usd: 10,
    manual_discount_reason: 'Courtesy adjustment',
  }, 'TEST-3');

  assert.equal(payload.promoDiscount, 5);
  assert.equal(payload.manualDiscount, 10);
  assert.equal(payload.manualDiscountReason, 'Courtesy adjustment');
  assert.equal(payload.volumeDiscount, 20);
});
