import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkWholesaleDealState, bulkWholesaleCatalogHref } from '../src/lib/bulkWholesaleCampaign.mjs';
import { automaticDealPromo, dealEligibleUnits } from '../src/lib/dealOfWeek.mjs';

const deal = { status:'live', pricing_mode:'bulk_threshold', discount_pct:.4, min_units:20, max_units:50, product_names:['A','B'], starts_at:'2026-09-01', ends_at:'2026-09-30', title_en:'Bulk week' };

test('public campaign follows the admin-created weekly deal without a code', () => {
  const state = bulkWholesaleDealState(deal, new Date('2026-09-15'));
  assert.equal(state.active, true); assert.equal(state.code, ''); assert.equal(state.discountPct, 40);
  assert.equal(state.minUnits, 20); assert.deepEqual(state.products, ['A','B']);
  assert.equal(new URL(bulkWholesaleCatalogHref({product:'A'}), 'https://x.test').searchParams.has('promo_code'), false);
});

test('mix-and-match threshold counts only selected products and applies automatically', () => {
  const items = [{product:'A',qty:12},{product:'B',qty:8},{product:'C',qty:99}];
  assert.equal(dealEligibleUnits(deal, items), 20);
  assert.equal(automaticDealPromo(deal, items).discount_pct, .4);
  assert.equal(automaticDealPromo(deal, items).exact_target_match, true);
  assert.equal(automaticDealPromo(deal, [{product:'A',qty:19}]), null);
  assert.equal(automaticDealPromo(deal, [{product:'A',qty:51}]), null);
});
