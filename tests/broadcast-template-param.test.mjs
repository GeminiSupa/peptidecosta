import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildTemplateParam } from '../src/lib/broadcastTemplateParam.mjs';

test('a greeting-variable template never leaves English in a Spanish message', () => {
  // The bug this replaces: the send-now route used `firstName || 'Customer'`, so
  // every nameless Costa Rican contact read "Customer" mid-Spanish.
  assert.equal(buildTemplateParam('María', 'es', true), 'Hola María');
  assert.equal(buildTemplateParam('', 'es', true), '¡Buenas!');
  assert.equal(buildTemplateParam(null, 'es', true), '¡Buenas!');
  assert.equal(buildTemplateParam(undefined, 'es', true), '¡Buenas!');
});

test('English templates get English fallbacks', () => {
  assert.equal(buildTemplateParam('Maria', 'en_US', true), 'Hi Maria');
  assert.equal(buildTemplateParam('', 'en_US', true), 'Hello!');
  assert.equal(buildTemplateParam('', 'en_US', false), 'Customer');
});

test('the classic shape returns a bare name, localized when absent', () => {
  assert.equal(buildTemplateParam('María', 'es', false), 'María');
  assert.equal(buildTemplateParam('', 'es', false), 'Cliente');
});

test('whitespace is flattened, because Meta rejects newlines in a parameter', () => {
  assert.equal(buildTemplateParam('  María\n  Rodríguez ', 'es', false), 'María Rodríguez');
  assert.equal(buildTemplateParam('\t\n', 'es', false), 'Cliente');
});

test('a missing language is treated as Spanish', () => {
  assert.equal(buildTemplateParam('', undefined, true), '¡Buenas!');
  assert.equal(buildTemplateParam('', '', false), 'Cliente');
});

test('the value is never empty, whatever it is given', () => {
  for (const name of ['', null, undefined, '   ', '\n']) {
    for (const lang of ['es', 'en_US', '', null]) {
      for (const greeting of [true, false]) {
        assert.ok(buildTemplateParam(name, lang, greeting).length > 0);
      }
    }
  }
});

test('both broadcast routes share one implementation', () => {
  // They each had their own copy, which is how the tickbox came to work on a
  // scheduled send and do nothing on an immediate one.
  for (const route of [
    'src/app/api/admin/broadcast/route.js',
    'src/app/api/cron/process-broadcasts/route.js',
  ]) {
    const source = fs.readFileSync(route, 'utf8');
    assert.ok(
      source.includes("from '@/lib/broadcastTemplateParam.mjs'"),
      `${route} must import the shared helper`
    );
    assert.ok(
      !/function buildTemplateParam/.test(source),
      `${route} must not define its own copy`
    );
    assert.ok(
      !/firstName \|\| 'Customer'/.test(source),
      `${route} still has the old inline fallback`
    );
  }
});
