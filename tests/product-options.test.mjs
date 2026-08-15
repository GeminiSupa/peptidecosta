import assert from 'node:assert/strict';
import test from 'node:test';
import { sortProductsAlphabetically } from '../src/lib/productOptions.mjs';

test('manual order products sort alphabetically with numeric strengths in order', () => {
  const sorted = sortProductsAlphabetically([
    { product: 'Zinc' }, { product: 'BPC-157 10mg' }, { product: 'bpc-157 5mg' }, { product: 'AOD-9604' },
  ]);
  assert.deepEqual(sorted.map((row) => row.product), ['AOD-9604', 'bpc-157 5mg', 'BPC-157 10mg', 'Zinc']);
});
