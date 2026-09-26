import assert from 'node:assert/strict';
import test from 'node:test';
import { stockRangePhrase } from '../src/lib/stockRange.mjs';

test('catalog stock is a band, never the exact count', () => {
  assert.equal(stockRangePhrase(null, 'en'), null);
  assert.equal(stockRangePhrase(0, 'en'), null);
  assert.equal(stockRangePhrase(1, 'en'), 'less than 10');
  assert.equal(stockRangePhrase(9, 'en'), 'less than 10');
  assert.equal(stockRangePhrase(10, 'en'), 'more than 10');
  assert.equal(stockRangePhrase(50, 'en'), 'more than 10');
  assert.equal(stockRangePhrase(51, 'en'), 'more than 50');
  assert.equal(stockRangePhrase(100, 'en'), 'more than 50');
  assert.equal(stockRangePhrase(101, 'en'), 'more than 100');
  assert.equal(stockRangePhrase(9, 'es'), 'menos de 10');
  assert.equal(stockRangePhrase(10, 'es'), 'más de 10');
  assert.equal(stockRangePhrase(51, 'es'), 'más de 50');
  assert.equal(stockRangePhrase(101, 'es'), 'más de 100');
});
