import test from 'node:test';
import assert from 'node:assert/strict';

import { recoveryPhoneKey, selectRecoveryTargets } from '../src/lib/abandonedCartRecovery.mjs';

const cart = (id, phone) => ({ id, customer_phone: phone });

test('the phone key ignores formatting and the country code', () => {
  assert.equal(recoveryPhoneKey('8888-8888'), '88888888');
  assert.equal(recoveryPhoneKey('+506 8888 8888'), '88888888');
  assert.equal(recoveryPhoneKey('50688888888'), '88888888');
});

test('an empty phone yields an empty key', () => {
  assert.equal(recoveryPhoneKey(''), '');
  assert.equal(recoveryPhoneKey(null), '');
  assert.equal(recoveryPhoneKey(undefined), '');
});

test('one person with two carts is messaged once', () => {
  // 50671009625 got two messages two seconds apart on the first live run.
  const { targets, duplicates } = selectRecoveryTargets([
    cart('a', '50671009625'),
    cart('b', '50671009625'),
  ]);
  assert.deepEqual(targets.map(c => c.id), ['a']);
  assert.deepEqual(duplicates.map(c => c.id), ['b']);
});

test('the same person written two ways still collides', () => {
  const { targets, duplicates } = selectRecoveryTargets([
    cart('a', '7100-9625'),
    cart('b', '+506 7100 9625'),
  ]);
  assert.equal(targets.length, 1);
  assert.equal(duplicates.length, 1);
});

test('different people are all messaged', () => {
  const { targets, duplicates } = selectRecoveryTargets([
    cart('a', '50671009625'),
    cart('b', '50688257020'),
    cart('c', '50683449162'),
  ]);
  assert.deepEqual(targets.map(c => c.id), ['a', 'b', 'c']);
  assert.deepEqual(duplicates, []);
});

test('the per-run cap still holds', () => {
  const { targets } = selectRecoveryTargets([
    cart('a', '50611111111'),
    cart('b', '50622222222'),
    cart('c', '50633333333'),
    cart('d', '50644444444'),
  ], 3);
  assert.deepEqual(targets.map(c => c.id), ['a', 'b', 'c']);
});

test('a cart over the cap is not counted as a duplicate', () => {
  // It must stay untouched so the next run picks it up — unlike a duplicate,
  // which gets marked as sent.
  const { targets, duplicates } = selectRecoveryTargets([
    cart('a', '50611111111'),
    cart('b', '50622222222'),
  ], 1);
  assert.deepEqual(targets.map(c => c.id), ['a']);
  assert.deepEqual(duplicates, []);
});

test('carts with no phone are skipped entirely', () => {
  const { targets, duplicates } = selectRecoveryTargets([
    cart('a', null),
    cart('b', ''),
    cart('c', '50683449162'),
  ]);
  assert.deepEqual(targets.map(c => c.id), ['c']);
  assert.deepEqual(duplicates, []);
});

test('an empty or missing list is handled', () => {
  assert.deepEqual(selectRecoveryTargets([]), { targets: [], duplicates: [] });
  assert.deepEqual(selectRecoveryTargets(), { targets: [], duplicates: [] });
});
