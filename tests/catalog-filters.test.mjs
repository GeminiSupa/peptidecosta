import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalogParams, resolveCategoryParam } from '../src/lib/catalogFilters.mjs';

// The real category names on the products table — deliberately not the
// "Peptides For Weight Loss" style the old links used.
const products = [
  { product: 'Retatrutide', category: 'Weight Loss & Metabolism' },
  { product: 'Sermorelin', category: 'Performance & Hormones' },
  { product: 'DSIP', category: 'Sleep' },
  { product: 'Bac Water', category: null },
];

test('reads the search param the site header sends', () => {
  assert.equal(readCatalogParams('?search=BPC-157').search, 'BPC-157');
  assert.equal(readCatalogParams('?search=%20Sermorelin%20').search, 'Sermorelin');
});

test('reads the category param the footer and landing links send', () => {
  assert.equal(readCatalogParams('?category=Sleep').category, 'Sleep');
  assert.equal(
    readCatalogParams('?category=Weight%20Loss%20%26%20Metabolism').category,
    'Weight Loss & Metabolism'
  );
});

test('both params survive alongside the params the catalog already read', () => {
  const parsed = readCatalogParams('?lang=en&search=NAD&category=Sleep&utm_source=ig');
  assert.equal(parsed.search, 'NAD');
  assert.equal(parsed.category, 'Sleep');
});

test('absent or blank params come back null rather than empty string', () => {
  assert.deepEqual(readCatalogParams(''), { search: null, category: null });
  assert.deepEqual(readCatalogParams('?search=&category=%20'), { search: null, category: null });
});

test('resolves a category to the exact spelling the product filter compares against', () => {
  assert.equal(resolveCategoryParam(products, 'Sleep'), 'Sleep');
  assert.equal(
    resolveCategoryParam(products, 'Weight Loss & Metabolism'),
    'Weight Loss & Metabolism'
  );
});

test('matching ignores casing and surrounding whitespace', () => {
  assert.equal(resolveCategoryParam(products, 'sleep'), 'Sleep');
  assert.equal(resolveCategoryParam(products, '  WEIGHT LOSS & METABOLISM '), 'Weight Loss & Metabolism');
});

test('a stale link shows the whole catalog instead of an empty page', () => {
  // This is exactly what the old footer links sent.
  assert.equal(resolveCategoryParam(products, 'Peptides For Weight Loss'), 'all');
  assert.equal(resolveCategoryParam(products, ''), 'all');
  assert.equal(resolveCategoryParam([], 'Sleep'), 'all');
});

test('products with no category never match', () => {
  assert.equal(resolveCategoryParam(products, 'null'), 'all');
  assert.equal(resolveCategoryParam(products, '   '), 'all');
});
