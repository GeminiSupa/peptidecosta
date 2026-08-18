import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CORREOS_TRACKING_URL,
  correosTrackingStrings,
  hasTrackingNumber,
} from '../src/lib/correosTracking.mjs';

test('a real tracking number gets the link', () => {
  assert.equal(hasTrackingNumber('RR123456789CR'), true);
  assert.equal(hasTrackingNumber('  RR123456789CR  '), true);
});

test('nothing entered means no link', () => {
  for (const value of ['', '   ', null, undefined]) {
    assert.equal(hasTrackingNumber(value), false, JSON.stringify(value));
  }
});

test('the placeholders the email itself prints do not count as a number', () => {
  // The mail writes "N/A" when the field is empty, and an order edited by hand
  // can end up literally holding that. Offering "track your parcel" next to it
  // sends the customer to a lookup page with nothing to type.
  for (const value of ['N/A', 'n/a', 'NA', '-', '--', 'none', 'Pending', 'TBD']) {
    assert.equal(hasTrackingNumber(value), false, value);
  }
});

test('both languages name Correos and carry the URL', () => {
  const es = correosTrackingStrings('es');
  const en = correosTrackingStrings('en');

  assert.match(es.button, /Correos de Costa Rica/);
  assert.match(en.button, /Correos de Costa Rica/);
  assert.match(es.textLine, /correos\.go\.cr\/rastreo/);
  assert.match(en.textLine, /correos\.go\.cr\/rastreo/);
  assert.notEqual(es.body, en.body);
});

test('the copy tells them to type the number, since the link cannot pre-fill it', () => {
  // Correos takes the number on its own lookup page — there is no deep link —
  // so a bare "track your order" button would drop them on a blank form.
  assert.match(correosTrackingStrings('en').body, /enter the tracking number/i);
  assert.match(correosTrackingStrings('es').body, /ingrese el número de rastreo/i);
  assert.equal(CORREOS_TRACKING_URL, 'https://correos.go.cr/rastreo/');
});
