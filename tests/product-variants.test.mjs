import test from 'node:test';
import assert from 'node:assert/strict';

import { parseVariant, groupCatalogProducts, defaultDoseIndex } from '../src/lib/productVariants.mjs';

const product = (name, category = 'Metabolic & GLP-1 Compounds', extra = {}) => ({
  product: name,
  category,
  status: 'In Stock',
  ...extra,
});

test('a trailing dose is split off the peptide name', () => {
  assert.deepEqual(parseVariant('GLP-1 20mg'), { base: 'GLP-1', amount: 20, unit: 'mg', label: '20mg' });
  assert.deepEqual(parseVariant('NAD+ 1000mg'), { base: 'NAD+', amount: 1000, unit: 'mg', label: '1000mg' });
  // "VIP 5 mg" has the space the others do not.
  assert.deepEqual(parseVariant('VIP 5 mg'), { base: 'VIP', amount: 5, unit: 'mg', label: '5mg' });
  // IU reads with a space.
  assert.equal(parseVariant('HGH 30 IU').label, '30 IU');
  assert.equal(parseVariant('BAC Water 10ml').label, '10ml');
});

test('a name that does not end in a plain dose is left alone', () => {
  // These must keep their own card: the trailing words mean they are not just
  // another size of the same thing.
  assert.equal(parseVariant('HGH 50 IU (Pfizer Genotropin)'), null);
  assert.equal(parseVariant('BPC-157 + TB-500 20mg (Wolverine Stack)'), null);
  assert.equal(parseVariant('AHK-Cu'), null);
  assert.equal(parseVariant('CJC-1295 without DAC + Ipamorelin'), null);
  assert.equal(parseVariant(''), null);
  assert.equal(parseVariant(null), null);
});

test('same peptide and category groups; everything else stays apart', () => {
  const rows = groupCatalogProducts([
    product('GLP-1 20mg'),
    product('Tirzepatide 10mg'),
    product('GLP-1 5mg'),
    product('AHK-CU 50mg'),
    product('AHK-Cu', 'Copper & Dermatological Peptides'),
    product('HGH 50 IU (Pfizer Genotropin)', 'Somatropin & Related Compounds'),
  ]);

  const glp = rows.find((row) => row.base === 'GLP-1');
  assert.equal(glp.grouped, true);
  assert.deepEqual(glp.doses.map((d) => d.label), ['5mg', '20mg'], 'doses run smallest first');

  // One of a kind stays ungrouped and keeps its full name on the card.
  const tirzepatide = rows.find((row) => row.base === 'Tirzepatide 10mg');
  assert.equal(tirzepatide.grouped, false);

  // Same name, different category: two products, never one card.
  assert.equal(rows.filter((row) => String(row.base).toLowerCase().startsWith('ahk')).length, 2);

  // The qualified Genotropin box is its own product.
  assert.ok(rows.some((row) => row.base === 'HGH 50 IU (Pfizer Genotropin)' && row.grouped === false));
});

test('a group takes the place of its first member, so the chosen sort holds', () => {
  const rows = groupCatalogProducts([
    product('Semax 10mg', 'Nootropic & Neuropeptides'),
    product('GLP-1 5mg'),
    product('KPV 10mg', 'Anti-Inflammatory'),
    product('GLP-1 60mg'),
  ]);
  assert.deepEqual(rows.map((row) => row.base), ['Semax 10mg', 'GLP-1', 'KPV 10mg']);
});

test('excluded products never group, however their names read', () => {
  const isBacWater = (p) => String(p.product).toLowerCase().includes('bac water');
  const rows = groupCatalogProducts([
    product('BAC Water 2ml', 'Bacteriostatic Water'),
    product('BAC Water 10ml', 'Bacteriostatic Water'),
  ], isBacWater);
  assert.equal(rows.length, 2, 'bacteriostatic water is priced by its own rules, so its sizes stay apart');
  assert.equal(rows[0].grouped, false);
});

test('a grouped card opens on the cheapest dose that is actually in stock', () => {
  const doses = [
    { product: { product: 'GLP-1 5mg', status: 'Out of Stock' } },
    { product: { product: 'GLP-1 10mg', status: 'Out of Stock' } },
    { product: { product: 'GLP-1 20mg', status: 'In Stock' } },
  ];
  const inStock = (p) => p.status === 'In Stock';
  assert.equal(defaultDoseIndex(doses, inStock), 2);

  // Nothing in stock: fall back to the first rather than to nothing.
  assert.equal(defaultDoseIndex(doses, () => false), 0);
  assert.equal(defaultDoseIndex([], inStock), 0);
});

test('one card per peptide is what the real shelf produces', () => {
  // The names as the products table actually holds them, so a rename that
  // breaks the grouping is caught here rather than on the live shelf.
  const names = [
    'GLP-1 5mg', 'GLP-1 10mg', 'GLP-1 12mg', 'GLP-1 15mg', 'GLP-1 20mg',
    'GLP-1 24mg', 'GLP-1 30mg', 'GLP-1 40mg', 'GLP-1 50mg', 'GLP-1 60mg',
    'Tirzepatide 10mg', 'Tirzepatide 15mg', 'Tirzepatide 20mg', 'Tirzepatide 30mg',
    'Tirzepatide 40mg', 'Tirzepatide 60mg', 'Tirzepatide 120mg',
    'Semaglutide 10mg', 'Semaglutide 20mg', 'Semaglutide 30mg',
    'HCG 10,000 IU', 'VIP 5 mg', '5-Amino-1MQ 5mg', '5-Amino-1MQ 50mg',
  ];
  const rows = groupCatalogProducts(names.map((name) => product(name)));

  const glp = rows.find((row) => row.base === 'GLP-1');
  assert.equal(glp.doses.length, 10);
  assert.equal(rows.find((row) => row.base === 'Tirzepatide').doses.length, 7);
  assert.equal(rows.find((row) => row.base === 'Semaglutide').doses.length, 3);
  assert.equal(rows.find((row) => row.base === '5-Amino-1MQ').doses.length, 2);

  // 24 products become 8 cards: three GLP-1 families, the two 1MQ sizes, and
  // the two one-offs.
  assert.equal(rows.length, 6);
  assert.ok(rows.some((row) => row.base === 'HCG 10,000 IU' && !row.grouped));
});
