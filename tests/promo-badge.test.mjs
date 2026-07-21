import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toPercent,
  promoTargetsProduct,
  isBadgeEligible,
  resolvePromoBadgeText,
  getPromoBadgeForProduct,
  getBadgeStyleOptions,
} from '../src/lib/promoBadge.mjs';

const promo = (over = {}) => ({
  code: 'SUMMER25',
  discount_pct: 0.25,
  is_active: true,
  hidden: false,
  show_sale_badge: true,
  badge_style: 'code',
  badge_text: null,
  target_product: null,
  valid_from: null,
  valid_until: null,
  usage_limit: null,
  usage_count: 0,
  ...over,
});

test('reads discount whether stored as a fraction or a whole number', () => {
  assert.equal(toPercent(0.25), 25);
  assert.equal(toPercent(25), 25);
  assert.equal(toPercent(1), 100);
  assert.equal(toPercent(0), 0);
  assert.equal(toPercent(null), 0);
});

test('a hidden promo never badges, even with the box ticked', () => {
  assert.equal(isBadgeEligible(promo({ hidden: true })), false);
});

test('badge is off unless explicitly switched on', () => {
  assert.equal(isBadgeEligible(promo({ show_sale_badge: false })), false);
  assert.equal(isBadgeEligible(promo()), true);
});

test('inactive, expired, not-yet-started and used-up promos do not badge', () => {
  const now = new Date('2026-07-21T12:00:00Z');
  assert.equal(isBadgeEligible(promo({ is_active: false }), now), false);
  assert.equal(isBadgeEligible(promo({ valid_until: '2026-07-20T00:00:00Z' }), now), false);
  assert.equal(isBadgeEligible(promo({ valid_from: '2026-07-22T00:00:00Z' }), now), false);
  assert.equal(isBadgeEligible(promo({ usage_limit: 5, usage_count: 5 }), now), false);
  assert.equal(isBadgeEligible(promo({ usage_limit: 5, usage_count: 4 }), now), true);
});

test('targets products by partial name, or all products when unset', () => {
  assert.equal(promoTargetsProduct(promo({ target_product: 'Retatrutide' }), 'Retatrutide 10mg'), true);
  assert.equal(promoTargetsProduct(promo({ target_product: 'retatrutide' }), 'Retatrutide 10mg'), true);
  assert.equal(promoTargetsProduct(promo({ target_product: 'Retatrutide' }), 'Tesamorelin 10mg'), false);
  assert.equal(promoTargetsProduct(promo({ target_product: 'Retatrutide, Epithalon' }), 'Epithalon 50mg'), true);
  assert.equal(promoTargetsProduct(promo({ target_product: null }), 'Anything'), true);
});

test('default wording names the code, since the shelf price has not moved', () => {
  assert.equal(resolvePromoBadgeText(promo(), 'en'), '25% off with SUMMER25');
  assert.equal(resolvePromoBadgeText(promo(), 'es'), '25% con SUMMER25');
});

test('save and limited presets', () => {
  assert.equal(resolvePromoBadgeText(promo({ badge_style: 'save' }), 'en'), 'Save 25%');
  assert.equal(resolvePromoBadgeText(promo({ badge_style: 'save' }), 'es'), 'Ahorra 25%');
  assert.equal(resolvePromoBadgeText(promo({ badge_style: 'limited' }), 'en'), 'Limited offer');
  assert.equal(resolvePromoBadgeText(promo({ badge_style: 'limited' }), 'es'), 'Oferta limitada');
});

test('custom text is used verbatim', () => {
  assert.equal(
    resolvePromoBadgeText(promo({ badge_style: 'custom', badge_text: 'Ask us for bulk pricing' }), 'en'),
    'Ask us for bulk pricing',
  );
});

test('custom style with no text renders nothing rather than an empty ribbon', () => {
  assert.equal(resolvePromoBadgeText(promo({ badge_style: 'custom', badge_text: '   ' })), null);
  assert.equal(resolvePromoBadgeText(promo({ badge_style: 'custom', badge_text: null })), null);
});

test('falls back sensibly when the discount is zero or the code missing', () => {
  assert.equal(resolvePromoBadgeText(promo({ discount_pct: 0 }), 'en'), 'Limited offer');
  assert.equal(resolvePromoBadgeText(promo({ code: '' }), 'en'), 'Save 25%');
});

test('an unknown badge_style falls back to the code preset', () => {
  assert.equal(resolvePromoBadgeText(promo({ badge_style: 'nonsense' }), 'en'), '25% off with SUMMER25');
});

test('picks the biggest qualifying discount for a product', () => {
  const promos = [
    promo({ code: 'SMALL', discount_pct: 0.10 }),
    promo({ code: 'BIG', discount_pct: 0.30 }),
    promo({ code: 'HIDDEN', discount_pct: 0.90, hidden: true }),
  ];
  const badge = getPromoBadgeForProduct(promos, 'Retatrutide 10mg', 'en');
  assert.equal(badge.code, 'BIG');
  assert.equal(badge.discountPct, 30);
  assert.equal(badge.text, '30% off with BIG');
});

test('a hidden promo cannot win even with the deepest discount', () => {
  const promos = [promo({ code: 'PRIVATE', discount_pct: 0.5, hidden: true })];
  assert.equal(getPromoBadgeForProduct(promos, 'Retatrutide 10mg', 'en'), null);
});

test('no badge when nothing targets the product', () => {
  const promos = [promo({ target_product: 'Tesamorelin' })];
  assert.equal(getPromoBadgeForProduct(promos, 'Retatrutide 10mg', 'en'), null);
});

test('wording options show the discount actually selected, not a fixed example', () => {
  const tenPct = getBadgeStyleOptions(0.10, 'BULK20');
  assert.equal(tenPct[0].label, '10% off with BULK20');
  assert.equal(tenPct[1].label, 'Save 10%');

  const fortyPct = getBadgeStyleOptions(40, 'BIG');
  assert.equal(fortyPct[0].label, '40% off with BIG');
});

test('wording options fall back to a placeholder before a code is typed', () => {
  assert.equal(getBadgeStyleOptions(0.15, '')[0].label, '15% off with CODE');
});

test('wording options survive a zero discount without showing 0%', () => {
  assert.equal(getBadgeStyleOptions(0, 'X')[0].label, '25% off with X');
});
