import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPrice, roundToCents } from '../src/lib/money.mjs';

test('a sum of dollar amounts is shown as a price, not as a float', () => {
  // The live bug: subtotal $67.85 plus $5.58 shipping rendered as
  // "$73.42999999999999" on the cart total and the submit button.
  assert.equal(67.85 + 5.58 === 73.43, false, 'the float artefact still exists');
  assert.equal(formatPrice(67.85 + 5.58, 'USD'), '$73.43');
});

test('whole dollars keep their bare form, as the catalog has always shown them', () => {
  assert.equal(formatPrice(70, 'USD'), '$70');
  assert.equal(formatPrice(70.0, 'USD'), '$70');
});

test('cents are always shown in full', () => {
  assert.equal(formatPrice(5.5, 'USD'), '$5.50');
  assert.equal(formatPrice(5.58, 'USD'), '$5.58');
  assert.equal(formatPrice(0.1 + 0.2, 'USD'), '$0.30');
});

test('large totals are grouped, like the colon amounts beside them', () => {
  assert.equal(formatPrice(1234.5, 'USD'), '$1,234.50');
  assert.equal(formatPrice(147891, 'CRC'), '₡147,891');
});

test('colones stay whole', () => {
  assert.equal(formatPrice(147890.6, 'CRC'), '₡147,891');
  assert.equal(formatPrice(147891, 'CRC'), '₡147,891');
});

test('nothing prints as NaN', () => {
  assert.equal(formatPrice(null, 'USD'), '$0');
  assert.equal(formatPrice(undefined, 'USD'), '$0');
  assert.equal(formatPrice('', 'CRC'), '₡0');
  assert.equal(formatPrice('12.5', 'USD'), '$12.50');
});

test('a negative amount keeps its sign in front of the currency amount', () => {
  assert.equal(formatPrice(-5.5, 'USD'), '-$5.50');
});

test('a total is rounded to cents before it is stored or charged', () => {
  assert.equal(roundToCents(67.85 + 5.58), 73.43);
  assert.equal(roundToCents(70), 70);
  assert.equal(roundToCents(null), 0);
});
