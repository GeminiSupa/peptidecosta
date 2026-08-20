import assert from 'node:assert/strict';
import test from 'node:test';
import {
  identityMessage,
  normalizeCustomerName,
  validateCustomerName,
} from '../src/lib/checkoutIdentity.mjs';

test('a Costa Rican company named after its cédula jurídica still checks out', () => {
  // Order WPCR-MT0H7T8K: a real clinic whose company has no trade name.
  const result = validateCustomerName('3102736108 SRL ');
  assert.equal(result.ok, true);
  assert.equal(result.name, '3102736108 SRL');
});

test('the cédula jurídica on its own is accepted as a company name', () => {
  assert.equal(validateCustomerName('3-101-123456').ok, true);
});

test('ordinary names pass, including accents and two surnames', () => {
  for (const name of ['Ana Rodríguez Jiménez', "O'Brien", 'José Ángel Mora-Castro', 'Li Wu']) {
    assert.equal(validateCustomerName(name).ok, true, name);
  }
});

test('the name box rejects junk a required-check would let through', () => {
  const cases = {
    '': 'nameRequired',
    '   ': 'nameRequired',
    'a': 'nameGibberish',
    'aaaa': 'nameGibberish',
    '.....': 'nameGibberish',
    '88886666': 'nameNoLetters',
    '12345': 'nameNoLetters',
    'ana@correo.com': 'nameIsContact',
    'www.miempresa.cr': 'nameIsContact',
  };
  for (const [input, reason] of Object.entries(cases)) {
    const result = validateCustomerName(input);
    assert.equal(result.ok, false, `expected ${JSON.stringify(input)} to fail`);
    assert.equal(result.reason, reason, JSON.stringify(input));
  }
});

test('a phone number typed into the name box is rejected', () => {
  assert.equal(validateCustomerName('50661419238').reason, 'nameNoLetters');
});

test('names collapse stray whitespace so the order alert reads cleanly', () => {
  assert.equal(normalizeCustomerName('  Ana   María  '), 'Ana María');
});

test('every failure reason has both a Spanish and an English message', () => {
  const reasons = [
    'nameRequired', 'nameIsContact', 'nameGibberish', 'nameNoLetters',
  ];
  for (const reason of reasons) {
    assert.ok(identityMessage(reason, 'es').length > 0, reason);
    assert.ok(identityMessage(reason, 'en').length > 0, reason);
    assert.notEqual(identityMessage(reason, 'es'), identityMessage(reason, 'en'));
  }
  assert.equal(identityMessage('unknown', 'en'), '');
});
