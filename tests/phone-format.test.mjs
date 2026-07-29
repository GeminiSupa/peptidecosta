import test from 'node:test';
import assert from 'node:assert/strict';

import { toE164, splitE164, isValidE164, findPhoneCountry } from '../src/lib/phoneFormat.mjs';

test('a Costa Rica national number gets the 506 prefix', () => {
  assert.equal(toE164('83449162', 'CR'), '50683449162');
  assert.equal(toE164('8344 9162', 'CR'), '50683449162');
  assert.equal(toE164('8344-9162', 'CR'), '50683449162');
});

test('the German number that broke the live confirmation now formats', () => {
  // 0176 21429442 reached Meta untouched and came back "(#131009) malformed".
  assert.equal(toE164('017621429442', 'DE'), '4917621429442');
});

test('trunk zeros are dropped once a country code is in front', () => {
  assert.equal(toE164('07911123456', 'GB'), '447911123456');
  assert.equal(toE164('03001234567', 'PK'), '923001234567');
});

test('a number already carrying its country code is not doubled', () => {
  assert.equal(toE164('50683449162', 'CR'), '50683449162');
  assert.equal(toE164('+506 8344 9162', 'CR'), '50683449162');
  assert.equal(toE164('00506 8344 9162', 'CR'), '50683449162');
  assert.equal(toE164('923490554719', 'PK'), '923490554719');
});

test('a foreign international number is respected, not double-prefixed', () => {
  // 923279940377 typed with Costa Rica selected produced 506923279940377 in
  // production: fifteen digits, accepted by Meta, delivered nowhere.
  assert.equal(toE164('923279940377', 'CR'), '923279940377');
  assert.equal(toE164('+92 327 994 0377', 'CR'), '923279940377');
  assert.equal(toE164('18314715559', 'CR'), '18314715559');
  assert.equal(toE164('4917621429442', 'CR'), '4917621429442');
});

test('an ordinary national number is never mistaken for an international one', () => {
  // These 8-digit Costa Rica numbers open with other countries' dial codes.
  assert.equal(toE164('44123456', 'CR'), '50644123456');
  assert.equal(toE164('52123456', 'CR'), '50652123456');
  assert.equal(toE164('12345678', 'CR'), '50612345678');
});

test('a result past 15 digits is refused outright', () => {
  assert.equal(toE164('12345678901234567', 'CR'), '');
  assert.equal(isValidE164(toE164('12345678901234567', 'CR')), false);
});

test('a short number is prefixed rather than mistaken for a country code', () => {
  // '5065060' starts with '506' but the remainder is far too short to be a
  // Costa Rica number, so it is a typo in the national field.
  assert.equal(toE164('5065060', 'CR'), '5065065060');
});

test('empty input stays empty', () => {
  assert.equal(toE164('', 'CR'), '');
  assert.equal(toE164(null, 'CR'), '');
  assert.equal(toE164('   ', 'CR'), '');
});

test('splitE164 reopens a stored number on the right country', () => {
  assert.deepEqual(splitE164('50683449162'), { countryCode: 'CR', nationalNumber: '83449162' });
  assert.deepEqual(splitE164('923490554719'), { countryCode: 'PK', nationalNumber: '3490554719' });
  assert.deepEqual(splitE164('18314715559'), { countryCode: 'US', nationalNumber: '8314715559' });
});

test('legacy bare 8-digit orders are read as Costa Rica', () => {
  assert.deepEqual(splitE164('83449162'), { countryCode: 'CR', nationalNumber: '83449162' });
});

test('splitE164 round-trips through toE164', () => {
  for (const stored of ['50683449162', '923490554719', '18314715559', '4917621429442']) {
    const { countryCode, nationalNumber } = splitE164(stored);
    assert.equal(toE164(nationalNumber, countryCode), stored);
  }
});

test('isValidE164 enforces Meta 8-15 digit limits', () => {
  assert.equal(isValidE164('50683449162'), true);
  assert.equal(isValidE164('6484164'), false);
  assert.equal(isValidE164('1234567890123456'), false);
});

test('isValidE164 infers the country when none is passed', () => {
  // The server has no picker to consult. 506923279940377 reached Meta on a bare
  // length check and was delivered nowhere.
  assert.equal(isValidE164('506923279940377'), false);
  assert.equal(isValidE164('5063279940377'), false);
  assert.equal(isValidE164('50683449162'), true);
  assert.equal(isValidE164('923490554719'), true);
  assert.equal(isValidE164('18314715559'), true);
});

test('a country with no fixed length still passes on length alone', () => {
  assert.equal(isValidE164('4917621429442'), true);
  // A dial code outside the list is not judged against another country.
  assert.equal(isValidE164('919876543210'), true);
});

test('isValidE164 catches a short Costa Rica number', () => {
  // 6484164 is a real 7-digit value sitting in the orders table.
  assert.equal(isValidE164(toE164('6484164', 'CR'), 'CR'), false);
  assert.equal(isValidE164(toE164('83449162', 'CR'), 'CR'), true);
});

test('countries without a fixed national length only get the length check', () => {
  assert.equal(findPhoneCountry('DE').nationalDigits, null);
  assert.equal(isValidE164('4917621429442', 'DE'), true);
});

test('an unknown country code falls back to Costa Rica', () => {
  assert.equal(findPhoneCountry('ZZ').code, 'CR');
});
