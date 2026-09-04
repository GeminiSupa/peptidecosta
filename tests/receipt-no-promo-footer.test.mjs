/**
 * A receipt is a record, not an advert.
 *
 * The footer printed every active promo code. Two of the three it was actually
 * showing were never ours to give away: JEANPAUL is an affiliate's referral
 * code paying its owner 20%, and the WELCOME-XXXXXX codes are minted one per
 * customer. Filtering it to genuine public offers left a single code behind,
 * which is not a promotion worth the risk of the next one leaking.
 *
 * The banner set in the admin panel still shows. That one is written
 * deliberately, for everybody.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCustomerHtml } from '../src/lib/orderEmailTemplates.mjs';

const ORDER = {
  orderNumber: 'WPCR-TEST01',
  customerName: 'Buyer',
  customerEmail: 'buyer@example.com',
  items: [{ product: 'BPC-157', qty: 1, price: 60 }],
  currency: 'USD',
  status: 'Paid',
  paymentMethod: 'sinpe',
  total: 60,
  subtotal: 60,
};

const CODES = [
  { code: 'JEANPAUL', discount_pct: 0.05 },
  { code: 'PRIMERPEDIDO15', discount_pct: 0.15 },
];

const render = (banner = '', codes = CODES) => buildCustomerHtml(
  ORDER, 'SINPE', '$60.00', '$60.00', '', 'en',
  { whatsappNumber: '50684046973' }, banner, banner, codes,
);

test('no promo code reaches a receipt, whatever is passed in', () => {
  const html = render('', CODES);

  assert.doesNotMatch(html, /JEANPAUL/);
  assert.doesNotMatch(html, /PRIMERPEDIDO15/);
  assert.doesNotMatch(html, /Active Codes/i);
  assert.doesNotMatch(html, /Códigos Activos/i);
});

test('the admin banner still shows, and without a codes heading', () => {
  const html = render('Free shipping this week', CODES);

  assert.match(html, /Free shipping this week/);
  assert.match(html, /Current Sales/);
  assert.doesNotMatch(html, /Promo Codes/i);
  assert.doesNotMatch(html, /JEANPAUL/);
});

test('with no banner the whole block disappears', () => {
  const html = render('', CODES);

  assert.doesNotMatch(html, /Current Sales/);
  assert.doesNotMatch(html, /Ventas Actuales/);
});

test('the Spanish receipt drops the codes too', () => {
  const html = buildCustomerHtml(
    { ...ORDER, currency: 'CRC' }, 'SINPE', '₡30,000', '', '₡30,000', 'es',
    { whatsappNumber: '50684046973' }, 'Envío gratis', 'Envío gratis', CODES,
  );

  assert.match(html, /Envío gratis/);
  assert.match(html, /Ventas Actuales/);
  assert.doesNotMatch(html, /JEANPAUL/);
  assert.doesNotMatch(html, /Códigos Promocionales/i);
});

test('the receipt still says what the customer actually bought', () => {
  // Removing the advert must not take the record with it.
  const html = render('', CODES);

  assert.match(html, /WPCR-TEST01/);
  assert.match(html, /BPC-157/);
  assert.match(html, /\$60\.00/);
});
