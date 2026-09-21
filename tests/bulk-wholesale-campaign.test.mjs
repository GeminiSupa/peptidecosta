import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkWholesaleDealState, bulkWholesaleCatalogHref } from '../src/lib/bulkWholesaleCampaign.mjs';
import { automaticDealPromo, dealEligibleUnits } from '../src/lib/dealOfWeek.mjs';

const deal = { status:'live', pricing_mode:'bulk_threshold', discount_pct:.4, min_units:20, max_units:50, product_names:['A','B'], starts_at:'2026-09-01', ends_at:'2026-09-30', title_en:'Bulk week' };

test('public campaign follows the admin-created weekly deal without a code', () => {
  const state = bulkWholesaleDealState(deal, new Date('2026-09-15'));
  assert.equal(state.active, true); assert.equal(state.code, ''); assert.equal(state.discountPct, 40);
  assert.equal(state.pricingMode, 'bulk_threshold');
  assert.equal(state.minUnits, 20); assert.deepEqual(state.products, ['A','B']);
  assert.equal(new URL(bulkWholesaleCatalogHref({product:'A'}), 'https://x.test').searchParams.has('promo_code'), false);
});

test('two-offer Deal of the Week remains visible in the storefront callouts', () => {
  const offers = {
    mix: { enabled: true, product_names: ['A', 'B'], min_units: 2, discount_pct: 0.10 },
    bundle: { enabled: true, product_names: ['A'], buy_qty: 4, free_qty: 1 },
  };
  const state = bulkWholesaleDealState({
    status: 'live', pricing_mode: 'offers', offers,
    starts_at: '2026-09-01', ends_at: '2026-09-30',
  }, new Date('2026-09-15'));

  assert.equal(state.active, true);
  assert.equal(state.pricingMode, 'offers');
  assert.deepEqual(state.products, ['A', 'B']);
  assert.deepEqual(state.summariesEn, [
    'Buy 2+ vials, get 10% off your whole order',
    'Buy 4 of the same vial, get 1 free',
  ]);
  assert.deepEqual(state.summariesEs, [
    'Compra 2+ viales y obtén 10% de descuento en todo tu pedido',
    'Compra 4 del mismo vial y llévate 1 gratis',
  ]);
});

test('an expired two-offer deal does not leave a stale catalog badge behind', () => {
  const state = bulkWholesaleDealState({
    status: 'live', pricing_mode: 'offers',
    offers: { mix: { enabled: true, product_names: ['A'], min_units: 2, discount_pct: 0.10 } },
    starts_at: '2026-09-01', ends_at: '2026-09-10',
  }, new Date('2026-09-15'));
  assert.equal(state.active, false);
});

test('the build-my-order link narrows the catalog to deal products, product links do not', () => {
  const orderLink = new URL(bulkWholesaleCatalogHref({ lang: 'en', dealOnly: true }), 'https://x.test');
  assert.equal(orderLink.searchParams.get('deal'), 'week');
  const productLink = new URL(bulkWholesaleCatalogHref({ product: 'A', dealOnly: true }), 'https://x.test');
  assert.equal(productLink.searchParams.has('deal'), false);
  assert.equal(new URL(bulkWholesaleCatalogHref({}), 'https://x.test').searchParams.has('deal'), false);
});

test('mix-and-match threshold counts only selected products and applies automatically', () => {
  const items = [{product:'A',qty:12},{product:'B',qty:8},{product:'C',qty:99}];
  assert.equal(dealEligibleUnits(deal, items), 20);
  assert.equal(automaticDealPromo(deal, items).discount_pct, .4);
  assert.equal(automaticDealPromo(deal, items).exact_target_match, true);
  assert.equal(automaticDealPromo(deal, [{product:'A',qty:19}]), null);
  assert.equal(automaticDealPromo(deal, [{product:'A',qty:51}]), null);
});
