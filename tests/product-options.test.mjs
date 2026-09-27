import assert from 'node:assert/strict';
import test from 'node:test';
import { productPickerName, sortProductsAlphabetically, vialSizeOf } from '../src/lib/productOptions.mjs';

test('manual order products sort alphabetically with numeric strengths in order', () => {
  const sorted = sortProductsAlphabetically([
    { product: 'Zinc' }, { product: 'BPC-157 10mg' }, { product: 'bpc-157 5mg' }, { product: 'AOD-9604' },
  ]);
  assert.deepEqual(sorted.map((row) => row.product), ['AOD-9604', 'bpc-157 5mg', 'BPC-157 10mg', 'Zinc']);
});

test('a manual order can show the vial size apart from the peptide name', () => {
  assert.equal(vialSizeOf({ product: 'AHK-CU', vialSize: '50mg' }), '50mg');
  assert.equal(productPickerName({ product: 'AHK-CU', vialSize: '50mg' }), 'AHK-CU');

  assert.equal(vialSizeOf({ product: 'GHK-CU 100mg' }), '100mg');
  assert.equal(productPickerName({ product: 'GHK-CU 100mg' }), 'GHK-CU');

  assert.equal(vialSizeOf({ product: 'HGH 30 IU' }), '30 IU');
  assert.equal(productPickerName({ product: 'HGH 30 IU' }), 'HGH');

  assert.equal(vialSizeOf({ product: 'BAC Water 10ml' }), '10ml');
  assert.equal(productPickerName({ product: '5-Amino-1MQ 5mg' }), '5-Amino-1MQ');

  const blend = 'BPC-157 + TB-500 (Wolverine Stack) 20mg';
  assert.equal(productPickerName({ product: blend }), 'BPC-157 + TB-500 (Wolverine Stack)');

  const plain = 'CJC-1295 without DAC + Ipamorelin';
  assert.equal(vialSizeOf({ product: plain }), '');
  assert.equal(productPickerName({ product: plain }), plain);
});
