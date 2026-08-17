import test from 'node:test';
import assert from 'node:assert/strict';

import { isAccountsLive, resolveAccountAccess } from '../src/lib/accountPreview.mjs';

test('accounts stay gated unless the flag is exactly "true"', () => {
  assert.equal(isAccountsLive('true'), true);
  assert.equal(isAccountsLive(' TRUE '), true);
  // Anything else keeps the feature hidden. An unset or fat-fingered env var
  // must never be the thing that launches it.
  assert.equal(isAccountsLive('1'), false);
  assert.equal(isAccountsLive('yes'), false);
  assert.equal(isAccountsLive(''), false);
  assert.equal(isAccountsLive(undefined), false);
  assert.equal(isAccountsLive(null), false);
});

test('a customer with no preview sees coming soon', () => {
  assert.equal(resolveAccountAccess({ live: false, paramValue: null, stored: null }), false);
  assert.equal(resolveAccountAccess({}), false);
});

test('the preview parameter opens the real account area', () => {
  assert.equal(resolveAccountAccess({ live: false, paramValue: 'true' }), true);
  assert.equal(resolveAccountAccess({ live: false, paramValue: 'TRUE' }), true);
  assert.equal(resolveAccountAccess({ live: false, paramValue: 'false' }), false);
  assert.equal(resolveAccountAccess({ live: false, paramValue: 'maybe' }), false);
});

test('a granted preview survives to later page loads without the parameter', () => {
  assert.equal(resolveAccountAccess({ live: false, paramValue: null, stored: 'true' }), true);
  assert.equal(resolveAccountAccess({ live: false, paramValue: null, stored: true }), true);
  assert.equal(resolveAccountAccess({ live: false, paramValue: null, stored: 'false' }), false);
});

test('launching opens it for everyone regardless of preview state', () => {
  assert.equal(resolveAccountAccess({ live: true, paramValue: null, stored: null }), true);
  assert.equal(resolveAccountAccess({ live: true, paramValue: 'false', stored: 'false' }), true);
});
