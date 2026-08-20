import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  DEFAULT_CR_POSTAL_CODE,
  gatewaySafeText,
  normalizePostalCode,
  parseBillingAddress,
} from '../src/lib/billingAddress.mjs';

// The real address from WPCR-MT1ZN6EG — a $918 order that could not be paid
// because the gateway answered HTTP 500, and the customer was shown
// "Shield Hub Pay returned 500" on the payment page.
const WHATSAPP_ADDRESS = [
  'Coco gym fitness ',
  'Juan ml Ramírez Madrigal ',
  '250 mts norte de la oficina de correos de Costa Rica ',
  'Guanacaste Carrillo el coco ',
  '88474216',
].join('\n');

// What the catalog checkout produces, which is what the old parser assumed.
const CATALOG_ADDRESS = 'Avenida 10, Casa 34\nCatedral, San Jose, San Jose\n10101';

test('a hand-typed address no longer sends a sentence as the postal code', () => {
  const billing = parseBillingAddress(WHATSAPP_ADDRESS);

  assert.equal(billing.postal_code, DEFAULT_CR_POSTAL_CODE);
  assert.doesNotMatch(billing.postal_code, /correos|oficina|norte/);
  assert.ok(billing.postal_code.length <= 6);
});

test('a catalog address still sends its real postal code', () => {
  assert.equal(parseBillingAddress(CATALOG_ADDRESS).postal_code, '10101');
  assert.equal(parseBillingAddress(CATALOG_ADDRESS).city, 'San Jose');
  assert.equal(parseBillingAddress(CATALOG_ADDRESS).state, 'Catedral');
});

test('digits are never scraped out of a sentence to fake a postal code', () => {
  // "250 mts norte de la..." starts with a number. Taking it would send a
  // postal code that looks real and belongs to somebody else.
  assert.equal(normalizePostalCode('250 mts norte de la oficina'), DEFAULT_CR_POSTAL_CODE);
  assert.equal(normalizePostalCode('San Roque'), DEFAULT_CR_POSTAL_CODE);
  assert.equal(normalizePostalCode(''), DEFAULT_CR_POSTAL_CODE);
  assert.equal(normalizePostalCode(null), DEFAULT_CR_POSTAL_CODE);
  // Real ones survive untouched.
  assert.equal(normalizePostalCode('10101'), '10101');
  assert.equal(normalizePostalCode('50301'), '50301');
});

test('accents are stripped, as they already were for cardholder names', () => {
  const billing = parseBillingAddress(WHATSAPP_ADDRESS);

  assert.equal(billing.city, 'Juan ml Ramirez Madrigal');
  assert.doesNotMatch(billing.city, /[^\x00-\x7F]/, 'non-ASCII reached the gateway');
  assert.doesNotMatch(billing.state, /[^\x00-\x7F]/);
  assert.doesNotMatch(billing.address, /[^\x00-\x7F]/);
});

test('free text is clamped so no field can arrive oversized', () => {
  const long = 'x'.repeat(400);
  const billing = parseBillingAddress(`${long}\n${long}, ${long}\n${long}`);

  assert.ok(billing.address.length <= 100, `address was ${billing.address.length}`);
  assert.ok(billing.city.length <= 40, `city was ${billing.city.length}`);
  assert.ok(billing.state.length <= 40, `state was ${billing.state.length}`);
  assert.equal(billing.postal_code, DEFAULT_CR_POSTAL_CODE);
});

test('an empty or missing address still produces a sendable billing block', () => {
  for (const input of ['', null, undefined, '   ', '\n\n\n']) {
    const billing = parseBillingAddress(input);
    assert.equal(billing.address, 'N/A');
    assert.equal(billing.city, 'San Jose');
    assert.equal(billing.state, 'San Jose');
    assert.equal(billing.postal_code, DEFAULT_CR_POSTAL_CODE);
    assert.equal(billing.country, 'CR');
  }
});

test('gatewaySafeText keeps the punctuation a street address needs', () => {
  assert.equal(gatewaySafeText('Avenida 10, Casa #34-B', 100), 'Avenida 10, Casa #34-B');
  assert.equal(gatewaySafeText('Barrio  Escalante\t\tcasa 7', 100), 'Barrio Escalante casa 7');
});

test('both card routes use the shared parser and actually import it', () => {
  // They each carried their own copy, so a fix to one left the other broken.
  // The import matters as much as the call: removing the local copy without
  // adding the import leaves an undefined reference that only fails in
  // production, since `node --check` does not resolve imports.
  for (const f of [
    'src/app/api/shieldhubpay/process-card/route.js',
    'src/app/api/card-payment-link/pay/route.js',
  ]) {
    const source = fs.readFileSync(f, 'utf8');
    assert.ok(
      source.includes("from '@/lib/billingAddress.mjs'"),
      `${f} calls parseBillingAddress without importing it`,
    );
    assert.ok(
      !source.includes('function parseBillingAddress'),
      `${f} still has its own copy of the parser`,
    );
    assert.ok(source.includes('parseBillingAddress('), `${f} no longer builds a billing address`);
  }
});

test('the pay-by-link page never returns raw gateway or exception text', () => {
  // "Shield Hub Pay returned 500" was shown to a paying customer.
  const source = fs.readFileSync('src/app/api/card-payment-link/pay/route.js', 'utf8');

  assert.ok(!source.includes('error: err.message'), 'raw exception text is still returned');
  assert.ok(
    !source.includes("error: 'Shield Hub Pay credentials are not configured'"),
    'internal configuration wording is still returned',
  );
  assert.match(source, /stopPayment\('unconfirmed', customerLang, 502/);
});
