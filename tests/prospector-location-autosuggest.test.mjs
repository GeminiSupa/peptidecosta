import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  COSTA_RICA_LOCATIONS,
  suggestCostaRicaLocations,
} from '../src/lib/costaRicaLocations.mjs';

const combobox = await readFile(
  new URL('../src/components/admin/prospector/LocationCombobox.js', import.meta.url),
  'utf8',
);

test('the local gazetteer contains Costa Rica, seven provinces, and 84 cantons', () => {
  assert.equal(COSTA_RICA_LOCATIONS.filter((location) => location.type === 'country').length, 1);
  assert.equal(COSTA_RICA_LOCATIONS.filter((location) => location.type === 'province').length, 7);
  assert.equal(COSTA_RICA_LOCATIONS.filter((location) => location.type === 'canton').length, 84);
});

test('location suggestions ignore accents and preserve useful geographic context', () => {
  const escazu = suggestCostaRicaLocations('escazu');
  assert.equal(escazu[0].label, 'Escazú');
  assert.equal(escazu[0].value, 'Escazú, San José, Costa Rica');

  const limon = suggestCostaRicaLocations('limon');
  assert.ok(limon.some((location) => location.type === 'province' && location.label === 'Limón'));
  assert.ok(limon.some((location) => location.type === 'canton' && location.label === 'Limón'));
});

test('the combobox exposes keyboard and screen-reader listbox semantics', () => {
  assert.match(combobox, /role="combobox"/);
  assert.match(combobox, /aria-autocomplete="list"/);
  assert.match(combobox, /role="listbox"/);
  assert.match(combobox, /role="option"/);
  assert.match(combobox, /event\.key === 'ArrowDown'/);
  assert.match(combobox, /event\.key === 'Enter'/);
  assert.match(combobox, /Keep typing to use any location/);
});

