import test from 'node:test';
import assert from 'node:assert/strict';

import { isAccountsLive, resolveAccountAccess } from '../src/lib/accountPreview.mjs';

test('accounts stay on coming soon while the screens are unfinished', () => {
  assert.equal(isAccountsLive('true'), false);
  assert.equal(isAccountsLive(' TRUE '), false);
  assert.equal(isAccountsLive(''), false);
  assert.equal(isAccountsLive(undefined), false);
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
