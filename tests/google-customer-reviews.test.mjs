import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GCR_BADGE_POSITION,
  GCR_DEFAULT_COUNTRY,
  GCR_MERCHANT_ID,
  addBusinessDays,
  badgeLanguage,
  buildReviewOptInRecord,
  crToday,
  estimatedDeliveryDate,
  reviewBadgeConfig,
  reviewOptInPayload,
} from '../src/lib/googleCustomerReviews.mjs';

const validRecord = {
  orderId: 'PCR-10428',
  email: 'Ana@Example.com',
  country: 'CR',
  estimatedDeliveryDate: '2026-09-04',
};

test('business days skip the weekend the couriers do not work', () => {
  // Thursday 2026-09-03 + 4 business days lands on the following Wednesday,
  // not the Sunday a naive +4 would give.
  assert.equal(addBusinessDays('2026-09-03', 4), '2026-09-09');
  // Friday + 1 is Monday.
  assert.equal(addBusinessDays('2026-09-04', 1), '2026-09-07');
  // Saturday + 1 is Monday too.
  assert.equal(addBusinessDays('2026-09-05', 1), '2026-09-07');
  assert.equal(addBusinessDays('2026-09-03', 0), '2026-09-03');
});

test('a date that cannot be read yields no estimate rather than a wrong one', () => {
  assert.equal(addBusinessDays('not-a-date'), null);
  assert.equal(addBusinessDays(''), null);
});

test('the order date is Costa Rica\'s, not the browser\'s', () => {
  // 03:00 UTC on the 4th is still the evening of the 3rd in Costa Rica (UTC-6),
  // so an order placed then must not be dated a day late.
  assert.equal(crToday(new Date('2026-09-04T03:00:00.000Z')), '2026-09-03');
  assert.equal(crToday(new Date('2026-09-04T12:00:00.000Z')), '2026-09-04');
});

test('checkout captures what the confirmation page cannot recover', () => {
  const record = buildReviewOptInRecord({
    orderId: 'PCR-10428',
    email: '  Ana@Example.com ',
    now: new Date('2026-09-03T15:00:00.000Z'),
  });
  assert.equal(record.orderId, 'PCR-10428');
  assert.equal(record.email, 'ana@example.com');
  // Checkout only collects Costa Rican addresses, so an absent country is CR.
  assert.equal(record.country, GCR_DEFAULT_COUNTRY);
  assert.equal(record.estimatedDeliveryDate, '2026-09-09');
});

test('a complete record becomes the payload Google expects', () => {
  const payload = reviewOptInPayload(validRecord);
  assert.deepEqual(payload, {
    merchant_id: GCR_MERCHANT_ID,
    order_id: 'PCR-10428',
    email: 'ana@example.com',
    delivery_country: 'CR',
    estimated_delivery_date: '2026-09-04',
  });
});

test('an incomplete order is not asked at all', () => {
  // Google rejects a submission missing any required field, and the rejection
  // is silent — so a half-filled ask is worse than no ask.
  assert.equal(reviewOptInPayload({ ...validRecord, orderId: '' }), null);
  assert.equal(reviewOptInPayload({ ...validRecord, email: '' }), null);
  assert.equal(reviewOptInPayload({ ...validRecord, email: 'not-an-email' }), null);
  assert.equal(reviewOptInPayload({ ...validRecord, estimatedDeliveryDate: '' }), null);
  assert.equal(reviewOptInPayload({ ...validRecord, estimatedDeliveryDate: '04/09/2026' }), null);
  assert.equal(reviewOptInPayload({ ...validRecord, country: 'Costa Rica' }), null);
  assert.equal(reviewOptInPayload({}), null);
  assert.equal(reviewOptInPayload(validRecord, 0), null);
});

test('the estimate is always a real future-shaped date', () => {
  assert.match(estimatedDeliveryDate(new Date('2026-09-03T15:00:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);
});

/* The seller-rating badge. */

test('the badge stays out of the corner the cart button owns', () => {
  // Google's wrapper sits at z-index 2147483647, so the corner it takes it
  // takes outright. Bottom-right is the catalog's cart button.
  assert.equal(GCR_BADGE_POSITION, 'LEFT_BOTTOM');
  assert.equal(reviewBadgeConfig().position, 'LEFT_BOTTOM');
});

test('the badge asks for the rating of the country this shop ships to', () => {
  // Seller ratings are held per country. Left to its own locale guessing
  // Google can land on one with no rating and draw "no rating available" over
  // a rating that exists.
  assert.equal(reviewBadgeConfig().region, GCR_DEFAULT_COUNTRY);
  assert.equal(reviewBadgeConfig().merchant_id, GCR_MERCHANT_ID);
});

test('a region Google could not read is dropped, not forwarded', () => {
  // Better Google's own fallback than a value it has to reject.
  assert.equal('region' in reviewBadgeConfig({ region: 'Costa Rica' }), false);
  assert.equal('region' in reviewBadgeConfig({ region: '' }), false);
  assert.equal(reviewBadgeConfig({ region: 'us' }).region, 'US');
});

test('the badge speaks the page language, and Spanish when unsure', () => {
  assert.equal(badgeLanguage('en'), 'en');
  assert.equal(badgeLanguage('es'), 'es');
  // The storefront is written in two languages; anything else — a stale stored
  // value, a stray ?lang — reads as the site default rather than as English.
  assert.equal(badgeLanguage('fr'), 'es');
  assert.equal(badgeLanguage(null), 'es');
  assert.equal(reviewBadgeConfig({ language: 'en' }).language, 'en');
  assert.equal(reviewBadgeConfig({}).language, 'es');
});

test('the badge can be switched off without a code change', () => {
  // It renders "no rating available" until enough surveys come back, which is
  // a worse trust signal than showing nothing. Null keeps Google's script off
  // the page entirely rather than loading it and hiding the result.
  assert.equal(reviewBadgeConfig({ enabled: false }), null);
  assert.equal(reviewBadgeConfig({ merchantId: 0 }), null);
});
