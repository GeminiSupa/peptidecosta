import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWhatsAppCatalogFormatReply,
  buildWhatsAppSalesReply,
  buildWhatsAppSalesSnapshot,
  formatWhatsAppSalesContext,
  replyMentionsPromoCode,
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

test('a bulk weekly deal is quoted as automatic threshold pricing without shelf-price claims', () => {
  const snapshot = buildWhatsAppSalesSnapshot({
    now: NOW,
    liveDeal: {
      status: 'live',
      pricing_mode: 'bulk_threshold',
      discount_pct: 0.4,
      min_units: 20,
      product_names: ['GLP-1 10mg', 'NAD+ 500mg'],
      starts_at: '2026-08-24T00:00:00.000Z',
      ends_at: '2026-08-31T00:00:00.000Z',
    },
    products: [{ product: 'GLP-1 10mg', price_usd: '100' }],
  });

  assert.match(snapshot.offers[0].en, /40% off when you mix and match 20\+/i);
  assert.match(snapshot.offers[0].en, /automatically; no code, no stacking/i);
  assert.doesNotMatch(snapshot.offers[0].en, /\$100/);
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

test('no limited promotion still reports truthful automatic volume savings', () => {
  const snapshot = buildWhatsAppSalesSnapshot({ now: NOW });
  const reply = buildWhatsAppSalesReply(snapshot, 'en');
  assert.match(reply, /^Current savings:/);
  assert.match(reply, /15% off 5\+ vials/);
  assert.doesNotMatch(reply, /competitively priced/i);
});

test('promo codes never reach the bot, affiliate or not', () => {
  // Affiliate codes (JEANPAUL) sit in promo_codes as public codes. The bot
  // quoted and "applied" them for strangers, so it gets no codes at all.
  const snapshot = buildWhatsAppSalesSnapshot({
    now: NOW,
    promos: [
      { code: 'JEANPAUL', discount_pct: 0.05, is_active: true, hidden: false },
      { code: 'PUBLIC20', discount_pct: 0.2, is_active: true, hidden: false },
    ],
  });

  const context = formatWhatsAppSalesContext(snapshot);
  assert.doesNotMatch(context, /JEANPAUL|PUBLIC20/);
  assert.equal(snapshot.offers.some((offer) => offer.kind === 'promo_code'), false);
  assert.match(context, /never name, share, confirm, apply or price with any promo, coupon, affiliate or referral code/);
  assert.match(context, /one the customer mentions/);
  assert.match(context, /earlier in this conversation/);
  assert.match(context, /15% off 5\+ vials or 20% off 10\+ vials/);
});

test('the context and the sales reply point to the deal page and support phone', () => {
  const snapshot = buildWhatsAppSalesSnapshot({ now: NOW });
  const context = formatWhatsAppSalesContext(snapshot);
  assert.match(context, /https:\/\/catalog\.peptidescostarica\.net\/deal-of-the-week/);
  assert.match(context, /\+506 8404-6973/);

  for (const lang of ['en', 'es']) {
    const reply = buildWhatsAppSalesReply(snapshot, lang);
    assert.match(reply, /https:\/\/catalog\.peptidescostarica\.net\/deal-of-the-week/);
    assert.match(reply, /\+506 8404-6973/);
  }
});

test('a model reply that names a code is caught', () => {
  assert.equal(replyMentionsPromoCode('Claro, Lilly. Aplicaré el código JEANPAUL para obtener un 5% de descuento en tu pedido del GLP-1 de 60 mg'), true);
  assert.equal(replyMentionsPromoCode('Use code MUSCLE10 at checkout.'), true);
  assert.equal(replyMentionsPromoCode('El código de descuento "RAQUELDELGADO" te da 10%.'), true);
  assert.equal(replyMentionsPromoCode('JEANPAUL code gives you 5% off.'), true);
});

test('ordinary replies are not mistaken for a code', () => {
  assert.equal(replyMentionsPromoCode('El GLP-1 de 60 mg cuesta $270 USD / ₡120,496 CRC.'), false);
  assert.equal(replyMentionsPromoCode('Si tienes un código, escríbelo en el carrito. BPC-157 cuesta $80 USD.'), false);
  assert.equal(replyMentionsPromoCode('Para tu código postal, TB-500 está disponible con COA.'), false);
});
