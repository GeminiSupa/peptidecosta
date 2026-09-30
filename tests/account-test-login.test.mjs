import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCOUNT_TEST_EMAIL,
  isAccountTestEmail,
  isAccountTestLoginEnabled,
} from '../src/lib/accountTestLogin.mjs';

test('the test sign-in stays closed unless the flag is exactly true', () => {
  assert.equal(isAccountTestLoginEnabled('true'), true);
  assert.equal(isAccountTestLoginEnabled(' TRUE '), true);
  assert.equal(isAccountTestLoginEnabled('1'), false);
  assert.equal(isAccountTestLoginEnabled('yes'), false);
  assert.equal(isAccountTestLoginEnabled(''), false);
  assert.equal(isAccountTestLoginEnabled(undefined), false);
});

test('only the reserved test address is accepted', () => {
  assert.equal(isAccountTestEmail(ACCOUNT_TEST_EMAIL), true);
  assert.equal(isAccountTestEmail('  Account-Test@peptidescostarica.net '), true);
  assert.equal(isAccountTestEmail('customer@peptidescostarica.net'), false);
  assert.equal(isAccountTestEmail(''), false);
});
