import test from 'node:test';
import assert from 'node:assert/strict';
import { findActiveBulkPromoConflict, overlappingPromoProducts } from '../src/lib/promoStackingSafety.mjs';

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

test('ordinary promo without a unit threshold is not treated as a bulk conflict', () => {
  assert.deepEqual(overlappingPromoProducts({ ...active, min_units: 0 }, ['Tirzepatide 20mg']), []);
});
