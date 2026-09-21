import test from 'node:test';
import assert from 'node:assert/strict';
import {
  productInDeal,
  readCatalogParams,
  resolveCategoryParam,
  catalogSearchAliases,
  productMatchesCatalogSearch,
  rankCatalogSearchResults,
  productSortRank,
  compareBySaleAndStock,
} from '../src/lib/catalogFilters.mjs';

// The real category names on the products table — deliberately not the
// "Peptides For Weight Loss" style the old links used.
const products = [
  { product: 'GLP-1', category: 'Weight Loss & Metabolism' },
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

test('?deal=week asks for the weekly deal products only', () => {
  assert.equal(readCatalogParams('?lang=en&deal=week').dealOnly, true);
  assert.equal(readCatalogParams('?deal=WEEK').dealOnly, true);
  assert.equal(readCatalogParams('?deal=other').dealOnly, false);
  assert.equal(readCatalogParams('?lang=en').dealOnly, false);
});

test('deal products match even when a name holds a non-breaking space', () => {
  const dealNames = ['GLP-1 10mg', 'NAD+ 500mg'];
  assert.equal(productInDeal({ product: 'GLP-1 10mg' }, dealNames), true);
  assert.equal(productInDeal({ product: 'nad+  500mg' }, dealNames), true);
  assert.equal(productInDeal({ product: 'GLP-1 15mg' }, dealNames), false);
  assert.equal(productInDeal({ product: 'GLP-1 10mg' }, []), false);
});

test('both params survive alongside the params the catalog already read', () => {
  const parsed = readCatalogParams('?lang=en&search=NAD&category=Sleep&utm_source=ig');
  assert.equal(parsed.search, 'NAD');
  assert.equal(parsed.category, 'Sleep');
});

test('absent or blank params come back null rather than empty string', () => {
  assert.deepEqual(readCatalogParams(''), { search: null, category: null, dealOnly: false, openCart: false });
  assert.deepEqual(readCatalogParams('?search=&category=%20'), { search: null, category: null, dealOnly: false, openCart: false });
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

test('search suggestions prefer product names containing the typed letters', () => {
  const searchableProducts = [
    { product: 'BPC-157', category: 'Recovery & Healing' },
    { product: 'TB-500', category: 'Recovery & Healing' },
    { product: 'BPC-157 + TB-500 20mg (Wolverine Stack)', category: 'Recovery & Healing' },
  ];

  const matches = rankCatalogSearchResults(searchableProducts, 'wolv');

  assert.deepEqual(matches.map((p) => p.product), ['BPC-157 + TB-500 20mg (Wolverine Stack)']);
});

test('search matching tolerates punctuation and accents', () => {
  assert.equal(
    productMatchesCatalogSearch({ product: 'BPC-157 + TB-500 20mg (Wolverine Stack)' }, 'bpc157'),
    true
  );
  assert.equal(
    productMatchesCatalogSearch({ product: 'Pérdida de Peso Blend' }, 'perdida'),
    true
  );
});

test('name matches rank ahead of broad category matches', () => {
  const searchableProducts = [
    { product: 'Generic Repair Blend', category: 'Recovery & Healing' },
    { product: 'Recovery Stack', category: 'Performance & Hormones' },
  ];

  const matches = rankCatalogSearchResults(searchableProducts, 'recovery');

  assert.deepEqual(matches.map((p) => p.product), ['Recovery Stack', 'Generic Repair Blend']);
});

test('renamed products remain findable by the names customers already know', () => {
  assert.equal(productMatchesCatalogSearch({ product: 'Amino Acid Blend' }, 'super human'), true);
  assert.equal(productMatchesCatalogSearch({ product: 'Lipotropic Blend' }, 'fat blaster'), true);
  assert.equal(productMatchesCatalogSearch({ product: 'GLP-1' }, 'retatrutide'), true);
});

test('blend ingredients and common shorthand lead to the current product', () => {
  assert.ok(catalogSearchAliases({ product: 'KLOW 70mg' }).includes('KPV'));
  assert.equal(productMatchesCatalogSearch({ product: 'KLOW 70mg' }, 'KPV'), true);
  assert.equal(productMatchesCatalogSearch({ product: 'Melanotan II 10mg' }, 'melanotan 2'), true);
  assert.equal(productMatchesCatalogSearch({ product: 'TB-4 10mg' }, 'TB500'), true);
});

test('search tolerates a small typo in a specific product name', () => {
  assert.equal(productMatchesCatalogSearch({ product: 'Semaglutide 10mg' }, 'semaglutied'), true);
  // Very short searches are not fuzzied: they would make the catalog noisy.
  assert.equal(productMatchesCatalogSearch({ product: 'GLOW 70mg' }, 'GLP'), false);
});

test('relevance ordering puts the requested product before description-only matches', () => {
  const searchableProducts = [
    { product: 'Amino Acid Blend', descriptionEn: 'A general blend with semaglutide-related research notes.' },
    { product: 'Semaglutide 10mg' },
    { product: 'Semaglutide 5mg' },
  ];

  assert.deepEqual(
    rankCatalogSearchResults(searchableProducts, 'semaglutide').map((p) => p.product),
    ['Semaglutide 10mg', 'Semaglutide 5mg', 'Amino Acid Blend']
  );
});

// --- Grid ordering: on-sale to the top -----------------------------------

// The predicates the catalog supplies, reduced to flags on the fixtures.
const rank = { isInStock: (p) => p.inStock, isOnSale: (p) => p.onSale };

const onSaleInStock = { product: 'GHK-Cu', inStock: true, onSale: true };
const plainInStock = { product: 'BPC-157', inStock: true, onSale: false };
const onSaleSoldOut = { product: 'TB-500', inStock: false, onSale: true };
const plainSoldOut = { product: 'DSIP', inStock: false, onSale: false };

test('an on-sale product outranks its in-stock peers', () => {
  assert.ok(productSortRank(onSaleInStock, rank) < productSortRank(plainInStock, rank));
  assert.ok(compareBySaleAndStock(onSaleInStock, plainInStock, rank) < 0);
});

test('being on sale never lifts a product above the in-stock line', () => {
  // The best position on the page must not go to something nobody can buy.
  assert.ok(productSortRank(plainInStock, rank) < productSortRank(onSaleSoldOut, rank));
  assert.ok(compareBySaleAndStock(plainInStock, onSaleSoldOut, rank) < 0);
});

test('out-of-stock products are not ranked among themselves by sale status', () => {
  assert.equal(productSortRank(onSaleSoldOut, rank), productSortRank(plainSoldOut, rank));
  assert.equal(compareBySaleAndStock(onSaleSoldOut, plainSoldOut, rank), 0);
});

test('sorting a mixed grid gives sale, then in stock, then sold out', () => {
  const grid = [plainSoldOut, plainInStock, onSaleSoldOut, onSaleInStock];
  const sorted = [...grid].sort((a, b) => compareBySaleAndStock(a, b, rank));
  assert.deepEqual(sorted.map((p) => p.product), ['GHK-Cu', 'BPC-157', 'DSIP', 'TB-500']);
});

test('products in the same band keep their incoming order', () => {
  // The default view leans on this: the comparator returns 0 within a band and
  // Array.sort is stable, so the database `priority` ordering survives.
  const a = { product: 'First', inStock: true, onSale: false };
  const b = { product: 'Second', inStock: true, onSale: false };
  const c = { product: 'Third', inStock: true, onSale: false };
  const sorted = [a, b, c].sort((x, y) => compareBySaleAndStock(x, y, rank));
  assert.deepEqual(sorted.map((p) => p.product), ['First', 'Second', 'Third']);
});

test('banding survives a price tie-break, matching the price-sort branch', () => {
  const cheapPlain = { product: 'Cheap', inStock: true, onSale: false, price: 50 };
  const pricySale = { product: 'Pricy', inStock: true, onSale: true, price: 300 };
  const sorted = [cheapPlain, pricySale].sort((a, b) => {
    const banded = compareBySaleAndStock(a, b, rank);
    return banded !== 0 ? banded : a.price - b.price;
  });
  // Low-to-high price would put Cheap first; the sale band wins.
  assert.deepEqual(sorted.map((p) => p.product), ['Pricy', 'Cheap']);
});

test('?cart=open asks the catalog to open the cart drawer (Deal of the Week checkout)', () => {
  assert.equal(readCatalogParams('?deal=week&cart=open').openCart, true);
  assert.equal(readCatalogParams('?deal=week&cart=OPEN').openCart, true);
  assert.equal(readCatalogParams('?deal=week').openCart, false);
});
