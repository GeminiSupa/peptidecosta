import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_CATEGORIES,
  CATALOG_CATEGORY_NAMES,
  CATEGORY_TRANSLATIONS,
  translateCategoryLabel,
  isMetabolicCategory,
  productComposition,
  isBlendOrStack,
  splitCompoundAndSize,
  azLetter,
  buildAzList,
} from '../src/lib/catalogCategories.mjs';

test('the fourteen categories from the plan, each with a slug and both languages', () => {
  assert.equal(CATALOG_CATEGORIES.length, 14);
  for (const c of CATALOG_CATEGORIES) {
    assert.ok(c.slug && c.en && c.es, `incomplete: ${JSON.stringify(c)}`);
  }
  assert.equal(CATALOG_CATEGORY_NAMES[0], 'Metabolic & GLP-1 Compounds');
  assert.ok(!CATALOG_CATEGORY_NAMES.some((name) => /weight loss/i.test(name)), 'no therapeutic claim in a label');
});

test('new and old categories both translate', () => {
  assert.equal(translateCategoryLabel('Tissue Repair Compounds', 'es'), 'Compuestos de reparación de tejidos');
  assert.equal(translateCategoryLabel('Tissue Repair Compounds', 'en'), 'Tissue Repair Compounds');
  // A product nobody has moved yet still reads in Spanish.
  assert.equal(translateCategoryLabel('Recovery & Healing', 'es'), 'Recuperación y curación');
  assert.equal(CATEGORY_TRANSLATIONS['Bacteriostatic Water'], 'Agua bacteriostática');
});

test('a custom "English / Español" category is split by language', () => {
  assert.equal(translateCategoryLabel('Hair Growth / Crecimiento del cabello', 'en'), 'Hair Growth');
  assert.equal(translateCategoryLabel('Hair Growth / Crecimiento del cabello', 'es'), 'Crecimiento del cabello');
  assert.equal(translateCategoryLabel('', 'es'), '');
  assert.equal(translateCategoryLabel(null, 'es'), '');
});

test('the metabolic category is recognised under its old and new names', () => {
  assert.equal(isMetabolicCategory('Metabolic & GLP-1 Compounds'), true);
  assert.equal(isMetabolicCategory('Weight Loss & Metabolism'), true);
  assert.equal(isMetabolicCategory('Tissue Repair Compounds'), false);
  assert.equal(isMetabolicCategory(undefined), false);
});

test('stacks and blends carry their composition; single compounds do not', () => {
  assert.equal(productComposition('GLOW 70mg', 'en'), 'GHK-Cu + BPC-157 + TB-500');
  assert.equal(productComposition('KLOW 80mg', 'en'), 'KPV + GHK-Cu + BPC-157 + TB-500');
  assert.equal(productComposition('BPC-157 + TB-500 20mg (Wolverine Stack)', 'en'), 'BPC-157 + TB-500');
  // Old and new blend names both resolve, so the admin rename changes nothing here.
  assert.match(productComposition('SUPER Human Amino Blend 10ml', 'en'), /amino acid blend/i);
  assert.match(productComposition('Amino Acid Blend 10ml', 'en'), /amino acid blend/i);
  assert.match(productComposition('Fat Blaster Amino Blend 10ml', 'es'), /lipotrópica/i);
  assert.match(productComposition('Lipotropic Blend 10ml', 'en'), /lipotropic/i);
  assert.equal(productComposition('GHK-CU 100mg', 'en'), '', 'GHK-Cu alone is not a stack');
  assert.equal(productComposition('BPC-157 10mg', 'en'), '');
  assert.equal(isBlendOrStack('KLOW 80mg'), true);
  assert.equal(isBlendOrStack('Semaglutide 10mg'), false);
});

test('a product name splits into compound and vial size', () => {
  assert.deepEqual(splitCompoundAndSize('GLP-1 12mg'), { compound: 'GLP-1', size: '12mg' });
  assert.deepEqual(splitCompoundAndSize('HCG 10,000 IU'), { compound: 'HCG', size: '10,000 IU' });
  assert.deepEqual(splitCompoundAndSize('HGH 50 IU (Pfizer Genotropin)'), { compound: 'HGH (Pfizer Genotropin)', size: '50 IU' });
  assert.deepEqual(splitCompoundAndSize('CJC-1295 without DAC + IPA 10mg'), { compound: 'CJC-1295 without DAC + IPA', size: '10mg' });
  assert.deepEqual(splitCompoundAndSize('Melanotan II'), { compound: 'Melanotan II', size: '' });
});

test('digits file under # in the jump bar', () => {
  assert.equal(azLetter('5-amino-1mq'), '#');
  assert.equal(azLetter('adamax'), 'A');
  assert.equal(azLetter(''), '#');
});

test('the A-Z list groups single compounds by letter, sizes smallest first, blends apart', () => {
  const products = [
    { product: 'GLP-1 12mg' },
    { product: 'GLP-1 5mg' },
    { product: 'Adamax 10mg' },
    { product: '5-amino-1mq 50mg' },
    { product: 'KLOW 80mg' },
    { product: 'BAC Water 3ml' },
    { product: 'GHK-CU 100mg' },
  ];
  const { groups, blends } = buildAzList(products, (name) => /bac water/i.test(name));
  assert.deepEqual(groups.map((g) => g.letter), ['#', 'A', 'G']);
  const g = groups.find((group) => group.letter === 'G');
  assert.deepEqual(g.rows.map((r) => r.product.product), ['GHK-CU 100mg', 'GLP-1 5mg', 'GLP-1 12mg']);
  assert.deepEqual(blends.map((r) => r.product.product), ['KLOW 80mg']);
  assert.ok(!groups.some((group) => group.rows.some((r) => /bac water/i.test(r.product.product))), 'supplies are left out');
});
