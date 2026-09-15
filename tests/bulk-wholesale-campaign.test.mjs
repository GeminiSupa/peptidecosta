import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkWholesaleCatalogHref, bulkWholesalePromoState, normalizeBulkWholesaleSettings } from '../src/lib/bulkWholesaleCampaign.mjs';

const settings = { enabled: true, promoCode: 'BULK45', titleAEn: 'Admin headline' };
const promo = { code: 'BULK45', discount_pct: 0.45, min_units: 24, is_active: true, target_product: 'Product A,Product B' };

test('campaign content and offer mechanics come from admin-managed data', () => {
  const state = bulkWholesalePromoState(promo, settings);
  assert.equal(state.active, true);
  assert.equal(state.code, 'BULK45');
  assert.equal(state.discountPct, 45);
  assert.equal(state.minUnits, 24);
  assert.deepEqual(state.products, ['Product A', 'Product B']);
  assert.equal(state.settings.titleAEn, 'Admin headline');
});

test('campaign stays hidden until an admin publishes a valid threshold promo', () => {
  assert.equal(bulkWholesalePromoState(promo, { ...settings, enabled: false }).active, false);
  assert.equal(bulkWholesalePromoState({ ...promo, min_units: 0 }, settings).active, false);
  assert.equal(bulkWholesalePromoState(promo, { ...settings, promoCode: 'OTHER' }).active, false);
});

test('settings normalize safely and catalog links use the selected admin code', () => {
  assert.equal(normalizeBulkWholesaleSettings({ promoCode: ' bulk45 ' }).promoCode, 'BULK45');
  const href = bulkWholesaleCatalogHref({ lang: 'en', variant: 'b', product: 'Product A', code: 'BULK45' });
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.get('promo_code'), 'BULK45');
  assert.equal(url.searchParams.get('utm_campaign'), 'bulk_wholesale_b');
  assert.equal(url.searchParams.get('product'), 'Product A');
});
