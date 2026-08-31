import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShipmentDraft,
  normalizeName,
  parseShippingAddress,
  postalCode,
  resolveTerritory,
} from '../src/lib/correosAddress.mjs';

test('names resolve to the codes Correos actually addresses by', () => {
  const r = resolveTerritory({ province: 'San José', canton: 'Alajuelita', district: 'Alajuelita' });
  assert.equal(r.level, 'district');
  assert.deepEqual([r.provinceCode, r.cantonCode, r.districtCode], ['1', '10', '01']);
  // The three codes joined are the postal code: 1-10-01.
  assert.equal(r.postalCode, '11001');
});

test('cantón 01 answers to both of its names', () => {
  // costarica.json (and so the checkout dropdown) calls it "Central"; INEC and
  // Correos call it after the province. Orders arrive carrying either.
  const central = resolveTerritory({ province: 'Alajuela', canton: 'Central', district: 'San Antonio' });
  const named = resolveTerritory({ province: 'Alajuela', canton: 'Alajuela', district: 'San Antonio' });
  assert.equal(central.postalCode, '20104');
  assert.equal(named.postalCode, central.postalCode);
});

test('accents and case do not decide where a parcel goes', () => {
  assert.equal(normalizeName('Pérez Zeledón'), normalizeName('PEREZ ZELEDON'));
  const a = resolveTerritory({ province: 'San José', canton: 'Pérez Zeledón', district: 'San Isidro de El General' });
  const b = resolveTerritory({ province: 'san jose', canton: 'perez zeledon', district: 'SAN ISIDRO DE EL GENERAL' });
  assert.equal(a.postalCode, '11901');
  assert.equal(b.postalCode, a.postalCode);
});

test('a district is only ever looked for inside its own cantón', () => {
  // This is the property that keeps parcels out of the wrong province. Several
  // cantones have a "San Isidro"; only the cantón separates them.
  const coronado = resolveTerritory({ province: 'San José', canton: 'Vázquez de Coronado', district: 'San Isidro' });
  const heredia = resolveTerritory({ province: 'Heredia', canton: 'San Isidro', district: 'San Isidro' });
  assert.equal(coronado.level, 'district');
  assert.equal(heredia.level, 'district');
  assert.notEqual(coronado.postalCode, heredia.postalCode);

  // A real district name, but not in this cantón: stop at the cantón, do not
  // reach across the country for a match.
  const wrong = resolveTerritory({ province: 'San José', canton: 'Alajuelita', district: 'Tirrases' });
  assert.equal(wrong.level, 'canton');
  assert.equal(wrong.postalCode, '');
  assert.deepEqual(wrong.unresolved, ['district']);
});

test('an unknown place resolves to nothing rather than to something near it', () => {
  assert.equal(resolveTerritory({ province: 'Bogotá', canton: 'X', district: 'Y' }).level, 'none');
  assert.equal(resolveTerritory({}).level, 'none');
  assert.equal(postalCode({ provinceCode: '1', cantonCode: '10' }), '');
});

test('the location line is read whichever way round it was written', () => {
  // Checkout appends "Distrito, Cantón, Provincia"; a good share of orders are
  // typed the other way. One read as the other is a parcel in the wrong place.
  const forward = parseShippingAddress('San Isidro, Vázquez de Coronado, San José');
  const reversed = parseShippingAddress('Heredia, San Rafael, San Josecito');
  assert.equal(forward.postalCode, '11101');
  assert.equal(reversed.postalCode, '40502');
});

test('labels people type around the values are ignored', () => {
  const r = parseShippingAddress('Provincia San José, Cantón Curridabat, distrito Tirrases, barrio la colina');
  assert.equal(r.postalCode, '11804');
});

test('the customer\'s own directions do not get mined for place names', () => {
  // Read bottom-up: the directions above the location line are full of names
  // that would match something if they were allowed to.
  const r = parseShippingAddress([
    'De la iglesia de San Rafael 200 metros sur, casa verde',
    'Tirrases, Curridabat, San José',
  ].join('\n'));
  assert.equal(r.postalCode, '11804');
  assert.equal(r.line, 'Tirrases, Curridabat, San José');
});

test('a postal code written into the text is used only if it is real', () => {
  // Falls back to a bare code when no line resolves...
  assert.equal(parseShippingAddress('Entrega en casa\n10501').postalCode, '10501');
  // ...but 40610 is not a district that exists, and a plausible-looking wrong
  // code is more dangerous than no code.
  assert.equal(parseShippingAddress('San Isidro Heredia código postal 40610').level, 'none');
});

test('a trailing postal code does not stop the name beside it matching', () => {
  const r = parseShippingAddress('Oficinas Correo de Costa Rica, San Marcos, Tarrazu, San Jose 10501');
  assert.equal(r.postalCode, '10501');
});

test('an address with no destination in it resolves to nothing', () => {
  assert.equal(parseShippingAddress('Pick Up Jaco').level, 'none');
  assert.equal(parseShippingAddress('Karen Ramírez\nCondominio Rialto casa a12').level, 'none');
  assert.equal(parseShippingAddress('').level, 'none');
  assert.equal(parseShippingAddress(null).level, 'none');
});

test('a draft says plainly whether it can be shipped without a human', () => {
  const ready = buildShipmentDraft({
    order_number: 'PCR-10428',
    customer_name: 'Ana Solís',
    customer_phone: '+506 8404 6973',
    customer_email: 'ana@example.com',
    shipping_address: 'De la escuela 100m norte, casa 4\nTirrases, Curridabat, San José',
  });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.missing, []);
  assert.equal(ready.destination.postalCode, '11804');
  // The 506 country code is dropped: Correos wants the 8-digit national number.
  assert.equal(ready.recipient.phone, '84046973');
  // Directions are what is left after the location line is taken out.
  assert.equal(ready.directions, 'De la escuela 100m norte, casa 4');
});

test('a draft that cannot be shipped names what is missing', () => {
  const draft = buildShipmentDraft({
    order_number: 'PCR-10429',
    customer_name: 'Karen Ramírez',
    customer_phone: '',
    shipping_address: 'Condominio Rialto casa a12',
  });
  assert.equal(draft.ready, false);
  assert.ok(draft.missing.includes('customer_phone'));
  assert.ok(draft.missing.includes('district'));
  assert.equal(draft.destination.postalCode, '');
});
