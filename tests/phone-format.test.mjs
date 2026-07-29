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
