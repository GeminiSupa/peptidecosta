import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findActiveBulkPromoConflict,
  findBulkPromoConflictForDeal,
  findLiveDealConflictForPromo,
  overlappingPromoProducts,
} from '../src/lib/promoStackingSafety.mjs';

const active = {
  code: 'WHOLESALE40', is_active: true, min_units: 20,
  target_product: 'GLP-1 10mg,Tirzepatide 20mg,NAD+ 500mg',
};

test('active threshold promo conflicts with an overlapping shelf-price deal', () => {
  const conflict = findActiveBulkPromoConflict([active], ['Tirzepatide 20mg', 'BPC-157 10mg']);
  assert.equal(conflict.promo.code, 'WHOLESALE40');
  assert.deepEqual(conflict.products, ['Tirzepatide 20mg']);
});

test('non-overlapping and inactive promos do not conflict', () => {
  assert.equal(findActiveBulkPromoConflict([active], ['BPC-157 10mg']), null);
  assert.equal(findActiveBulkPromoConflict([{ ...active, is_active: false }], ['Tirzepatide 20mg']), null);
});

test('ordinary promo still overlaps a weekly deal, so it cannot stack', () => {
  assert.deepEqual(overlappingPromoProducts({ ...active, min_units: 0 }, ['Tirzepatide 20mg']), ['Tirzepatide 20mg']);
});

/** Minimal stand-in for the two table reads these helpers make. */
const fakeSupabase = (rows) => ({
  from: () => {
    const result = { data: rows, error: null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      gt: () => chain,
      then: (resolve) => resolve(result),
    };
    return chain;
  },
});

const shelfDeal = {
  id: 'd1', title_en: 'Shelf week', status: 'live', pricing_mode: 'shelf',
  product_names: ['GHK-CU 50mg', 'BPC-157 10mg'],
};
const offersDeal = { ...shelfDeal, id: 'd2', pricing_mode: 'offers' };
const thresholdDeal = { ...shelfDeal, id: 'd3', pricing_mode: 'bulk_threshold' };

test('a marked-down shelf deal still blocks a code on the same product', async () => {
  const conflict = await findLiveDealConflictForPromo(fakeSupabase([shelfDeal]), {
    code: 'GHK50', target_product: 'GHK-CU 50mg',
  });
  assert.deepEqual(conflict.products, ['GHK-CU 50mg']);
});

test('a shelf deal ignores a code aimed at products it does not cover', async () => {
  const conflict = await findLiveDealConflictForPromo(fakeSupabase([shelfDeal]), {
    code: 'NAD20', target_product: 'NAD+ 500mg',
  });
  assert.equal(conflict, null);
});

test('offers and bulk-threshold deals let a code run alongside them', async () => {
  for (const deal of [offersDeal, thresholdDeal]) {
    assert.equal(
      await findLiveDealConflictForPromo(fakeSupabase([deal]), { code: 'GHK50', target_product: 'GHK-CU 50mg' }),
      null,
      `${deal.pricing_mode} deal should not block a code`,
    );
    // An untargeted code covers everything, and still must not be blocked.
    assert.equal(
      await findLiveDealConflictForPromo(fakeSupabase([deal]), { code: 'SITEWIDE', target_product: null }),
      null,
      `${deal.pricing_mode} deal should not block a sitewide code`,
    );
  }
});

test('launching a non-shelf deal is not blocked by an active bulk code', async () => {
  const bulkRows = [{ ...active, id: 'p1' }];
  assert.equal(
    await findBulkPromoConflictForDeal(fakeSupabase(bulkRows), ['Tirzepatide 20mg'], new Date(), { pricingMode: 'offers' }),
    null,
  );
  const blocked = await findBulkPromoConflictForDeal(fakeSupabase(bulkRows), ['Tirzepatide 20mg'], new Date(), { pricingMode: 'shelf' });
  assert.equal(blocked.promo.code, 'WHOLESALE40');
});
