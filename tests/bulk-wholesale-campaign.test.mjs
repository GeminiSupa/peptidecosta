import test from 'node:test';
import assert from 'node:assert/strict';
import { BULK_WHOLESALE_PRODUCTS, bulkWholesaleCatalogHref, bulkWholesalePromoState } from '../src/lib/bulkWholesaleCampaign.mjs';

const promo = {
  code: 'WHOLESALE40', discount_pct: 0.4, min_units: 20, is_active: true,
  target_product: BULK_WHOLESALE_PRODUCTS.join(','),
};

test('campaign is live only when the exact safety-critical setup is active', () => {
  assert.equal(bulkWholesalePromoState(promo).active, true);
  assert.equal(bulkWholesalePromoState({ ...promo, discount_pct: 0.5 }).active, false);
  assert.equal(bulkWholesalePromoState({ ...promo, min_units: 19 }).active, false);
  assert.equal(bulkWholesalePromoState({ ...promo, target_product: 'GLP-1 10mg' }).active, false);
  assert.equal(bulkWholesalePromoState({ ...promo, is_active: false }).active, false);
});

test('campaign catalog link preserves variant, product, and code', () => {
  const href = bulkWholesaleCatalogHref({ lang: 'en', variant: 'b', product: 'NAD+ 500mg' });
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.get('promo_code'), 'WHOLESALE40');
  assert.equal(url.searchParams.get('utm_campaign'), 'bulk_wholesale_40_b');
  assert.equal(url.searchParams.get('product'), 'NAD+ 500mg');
});
