import test from 'node:test';
import assert from 'node:assert/strict';

import { isDummyTurnstileKey } from '../src/lib/turnstileKey.mjs';

test('Cloudflare dummy keys are not treated as the live check', () => {
  assert.equal(isDummyTurnstileKey(''), true);
  assert.equal(isDummyTurnstileKey('1x00000000000000000000AA'), true);
  assert.equal(isDummyTurnstileKey('1x0000000000000000000000000000000AA'), true);
  assert.equal(isDummyTurnstileKey('0x4AAAAAAArealkey'), false);
});
