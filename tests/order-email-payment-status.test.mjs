import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminHtml, buildCustomerHtml, paymentLabels } from '../src/lib/orderEmailTemplates.mjs';

const LINKS = { whatsappNumber: '50684046973' };

const ORDER = {
  orderNumber: 'CARD-MT1TBGQ0',
  customerName: 'Diego',
  customerPhone: '50688887777',
  customerEmail: 'buyer@example.com',
  shippingAddress: 'San Jose',
  items: [{ product: 'Retatrutide', qty: 1, price: 147891 }],
  total: 147891,
  currency: 'CRC',
  shipping: 0,
  paymentMethod: 'card',
};

const customer = (status, extra = {}) => buildCustomerHtml(
  { ...ORDER, status, ...extra },
  paymentLabels.es.card, '₡147,891', null, null, 'es', LINKS, '', '', [],
);

const admin = (status, extra = {}) => buildAdminHtml(
  { ...ORDER, status, ...extra },
  paymentLabels.en.card, '₡147,891', null, null,
);

test('a paid card is confirmed, not left sounding unfinished', () => {
  const html = customer('Paid');

  assert.match(html, /Pedido Confirmado/);
  assert.match(html, /Pagado \/ Completado/);
  assert.doesNotMatch(html, /Esperando Confirmaci\u00f3n del Procesador/);
  assert.doesNotMatch(html, /Pago Pendiente/);
});

test('a blocked card is a refusal, not a payment still in progress', () => {
  // The whole bug: "Payment Blocked" failed an === 'Declined' check, fell
  // through to the card branch, and told the buyer we were waiting on the
  // processor for a card the gateway had already refused.
  const html = customer('Payment Blocked', { declineReason: 'Card brand not allowed' });

  assert.match(html, /Pago Rechazado/);
  assert.match(html, /Rechazado/);
  assert.doesNotMatch(html, /Esperando Confirmaci\u00f3n del Procesador/);
  assert.doesNotMatch(html, /Pago en Proceso/);
  assert.doesNotMatch(html, /Pedido Confirmado/);
});

test('every other refusal wording reads the same way to the customer', () => {
  for (const status of ['Declined', 'Payment Blocked', 'Error', 'Payment Failed', 'Cancelled']) {
    const html = customer(status);
    assert.match(html, /Pago Rechazado/, `${status} should read as declined`);
    assert.doesNotMatch(html, /Esperando Confirmaci\u00f3n del Procesador/, `${status} must not read as pending`);
  }
});

test('the customer is told why, and that nothing was taken', () => {
  const html = customer('Declined', { declineReason: 'The card has insufficient funds' });

  assert.match(html, /No se realiz\u00f3 ning\u00fan cargo a su tarjeta/);
  assert.match(html, /The card has insufficient funds/);
});

test('a decline leaves the customer a way to reach us', () => {
  const html = customer('Declined');

  assert.match(html, /Escr\u00edbanos por WhatsApp/);
  assert.match(html, /api\.whatsapp\.com\/send\?phone=50684046973/);
});

test('a card order still awaiting the processor says exactly that', () => {
  const html = customer('Pending - Card');

  assert.match(html, /Pago en Proceso/);
  assert.doesNotMatch(html, /Pago Rechazado/);
  assert.doesNotMatch(html, /Pedido Confirmado/);
});

test('the decline reason is escaped, not injected into the email', () => {
  const html = customer('Declined', { declineReason: '<script>alert(1)</script>' });

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('the team alert keeps its wording for a brand new order', () => {
  const html = admin('Pending - Card');

  assert.match(html, /New Order Received!/);
  assert.match(html, /PENDING - CARD|Pending - Card/);
});

test('a card order gets one team email that is both the alert and the outcome', () => {
  // The alert in the screenshot was raised before the charge and never
  // corrected, so an approved order and a refused one looked identical in the
  // inbox. A card order's alert is now held until the charge answers, so this
  // single mail has to say both things.
  const approved = admin('Paid', { notificationKind: 'payment-result', firstTeamAlert: true });
  assert.match(approved, /New Order — Payment Approved|New Order . Payment Approved/);
  assert.match(approved, /A new order has been placed and the card cleared/);
  assert.match(approved, /ready to fulfil/);
  // Still the full order detail, because it is the only mail the team gets.
  assert.match(approved, /Retatrutide/);
  assert.match(approved, /Diego/);

  const refused = admin('Payment Blocked', {
    notificationKind: 'payment-result',
    firstTeamAlert: true,
    declineReason: 'Card brand not allowed',
  });
  assert.match(refused, /New Order . Card Declined/);
  assert.match(refused, /Card brand not allowed/);
  assert.match(refused, /Nothing was charged and the order is unpaid/);
  assert.match(refused, /Retatrutide/);
});

test('a payment on an order the team already saw does not claim to be new', () => {
  // Payment-link orders were alerted on when they were created, days earlier.
  const later = admin('Paid', { notificationKind: 'payment-result', firstTeamAlert: false });

  assert.match(later, /Payment Approved/);
  assert.doesNotMatch(later, /New Order/);
});

test('the admin email does not crash if customerPhone is an integer', () => {
  const html = admin('Paid', { customerPhone: 50688887777 });
  assert.match(html, /50688887777/);
});
