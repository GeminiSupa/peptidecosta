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

test('no limited promotion still reports truthful automatic volume savings', () => {
  const snapshot = buildWhatsAppSalesSnapshot({ now: NOW });
  const reply = buildWhatsAppSalesReply(snapshot, 'en');
  assert.match(reply, /isn't a public weekly deal or promo code active/i);
  assert.match(reply, /15% off 5\+ vials/);
  assert.doesNotMatch(reply, /competitively priced/i);
});
