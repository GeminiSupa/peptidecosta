import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWhatsAppCatalogFormatReply,
  buildWhatsAppSalesReply,
  buildWhatsAppSalesSnapshot,
  formatWhatsAppSalesContext,
} from '../src/lib/whatsappSales.mjs';

const NOW = new Date('2026-08-25T12:00:00.000Z');

test('a live weekly deal is quoted with current catalog prices', () => {
  const snapshot = buildWhatsAppSalesSnapshot({
    now: NOW,
    liveDeal: {
      status: 'live',
      discount_pct: 0.2,
      product_names: ['BPC-157'],
      starts_at: '2026-08-24T00:00:00.000Z',
      ends_at: '2026-08-31T00:00:00.000Z',
    },
    products: [{
      product: 'BPC-157',
      price_usd: '80',
      price_crc: '36,000',
      original_price_usd: '100',
      original_price_crc: '45,000',
      discount: '20% Deal of the Week',
      sale_start_time: '2026-08-24T00:00:00.000Z',
      sale_end_time: '2026-08-31T00:00:00.000Z',
    }],
  });

  assert.equal(snapshot.hasLimitedOffer, true);
  assert.match(snapshot.offers[0].en, /Deal of the Week: 20% off BPC-157/);
  assert.match(snapshot.offers[0].en, /\$80 \/ ₡36,000/);
  assert.match(buildWhatsAppSalesReply(snapshot, 'en'), /these offers are active now/i);
});

test('tablet questions use only explicit current catalog format data', () => {
  const products = [{ product: 'BPC-157', description_en: 'Research vial' }];
  const unavailable = buildWhatsAppCatalogFormatReply(products, 'Do u got tablets?', 'en');
  assert.match(unavailable, /don't see any tablet or capsule products/i);
  assert.doesNotMatch(unavailable, /liquid|subcutaneous|injection/i);

  const listed = buildWhatsAppCatalogFormatReply([
    ...products,
    { product: 'Research Tablet X', description_en: 'Tablet format' },
  ], 'Do u got tablets?', 'en');
  assert.match(listed, /Research Tablet X/);
});

test('active public promo codes are included and private or expired codes are not', () => {
  const snapshot = buildWhatsAppSalesSnapshot({
    now: NOW,
    promos: [
      { code: 'PUBLIC20', discount_pct: 0.2, is_active: true, hidden: false, valid_until: '2026-09-01T00:00:00.000Z' },
      { code: 'PRIVATE50', discount_pct: 0.5, is_active: true, hidden: true },
      { code: 'OLD10', discount_pct: 0.1, is_active: true, hidden: false, valid_until: '2026-08-01T00:00:00.000Z' },
    ],
  });

  const context = formatWhatsAppSalesContext(snapshot);
  assert.match(context, /PUBLIC20/);
  assert.doesNotMatch(context, /PRIVATE50|OLD10/);
  assert.match(context, /15% off 5\+ vials or 20% off 10\+ vials/);
});

test('WhatsApp-specific exclusions hide codes without deactivating them', () => {
  const snapshot = buildWhatsAppSalesSnapshot({
    now: NOW,
    excludedPromoCodes: ['jeanpaul', ' RAQUELDELGADO '],
    promos: [
      { code: 'JEANPAUL', discount_pct: 0.05, is_active: true, hidden: false },
      { code: 'RAQUELDELGADO', discount_pct: 0.1, is_active: true, hidden: false },
      { code: 'MUSCLE10', discount_pct: 0.1, is_active: true, hidden: false },
    ],
  });

  const context = formatWhatsAppSalesContext(snapshot);
  assert.doesNotMatch(context, /JEANPAUL|RAQUELDELGADO/);
  assert.match(context, /MUSCLE10/);
});

test('no limited promotion still reports truthful automatic volume savings', () => {
  const snapshot = buildWhatsAppSalesSnapshot({ now: NOW });
  const reply = buildWhatsAppSalesReply(snapshot, 'en');
  assert.match(reply, /isn't a public weekly deal or promo code active/i);
  assert.match(reply, /15% off 5\+ vials/);
  assert.doesNotMatch(reply, /competitively priced/i);
});

test('the context names the valid codes and forbids every other one', () => {
  // Filtering the list is not enough on its own. A code the assistant quoted
  // correctly weeks ago is still in the conversation history, and a customer
  // holding a dead code will quote it too — both read as evidence the discount
  // exists unless the model is told the list is the whole list.
  const snapshot = buildWhatsAppSalesSnapshot({
    now: NOW,
    promos: [
      { code: 'LIVE15', discount_pct: 0.15, is_active: true, hidden: false },
      { code: 'DEAD10', discount_pct: 0.1, is_active: true, hidden: false, valid_until: '2026-08-01T00:00:00.000Z' },
    ],
  });

  const context = formatWhatsAppSalesContext(snapshot);
  assert.match(context, /The only promo codes that are valid right now are: LIVE15\./);
  assert.doesNotMatch(context, /DEAD10/);
  assert.match(context, /quoted earlier in this conversation/);
  assert.match(context, /the customer says they hold/);
  assert.match(context, /Never confirm, repeat, extend or honour a code that is not in this list/);
});

test('with nothing live the context says so rather than staying silent', () => {
  // Saying nothing leaves the model free to fall back on whatever code it can
  // see in the history. It has to be told there are none.
  const snapshot = buildWhatsAppSalesSnapshot({
    now: NOW,
    promos: [
      { code: 'EXPIRED', discount_pct: 0.2, is_active: true, hidden: false, valid_until: '2026-08-01T00:00:00.000Z' },
    ],
  });

  const context = formatWhatsAppSalesContext(snapshot);
  assert.match(context, /There are no promo codes valid right now\./);
  assert.doesNotMatch(context, /EXPIRED/);
  // The automatic volume saving is real and unconditional, so it stays.
  assert.match(context, /15% off 5\+ vials/);
});

test('a code used up to its limit is not named as valid', () => {
  const snapshot = buildWhatsAppSalesSnapshot({
    now: NOW,
    promos: [
      { code: 'GONE', discount_pct: 0.2, is_active: true, hidden: false, usage_limit: 5, usage_count: 5 },
      { code: 'LEFT', discount_pct: 0.2, is_active: true, hidden: false, usage_limit: 5, usage_count: 4 },
    ],
  });

  const context = formatWhatsAppSalesContext(snapshot);
  assert.match(context, /valid right now are: LEFT\./);
  assert.doesNotMatch(context, /GONE/);
});
