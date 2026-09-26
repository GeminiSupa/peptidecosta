import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogDealCardEnabled } from '../src/lib/catalogDealCard.mjs';

test('the catalog deal card is on until somebody switches it off', () => {
  assert.equal(catalogDealCardEnabled(null), true);
  assert.equal(catalogDealCardEnabled(undefined), true);
  assert.equal(catalogDealCardEnabled({}), true);
  assert.equal(catalogDealCardEnabled({ enabled: true }), true);
  assert.equal(catalogDealCardEnabled({ enabled: false }), false);
});
