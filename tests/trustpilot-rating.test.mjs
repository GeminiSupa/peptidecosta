import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { TRUSTPILOT_RATING, TRUSTPILOT_REVIEW_COUNT } from '../src/lib/businessLinks.js';

test('public Trustpilot rating matches the verified profile', () => {
  assert.equal(TRUSTPILOT_RATING, '4.4');
  assert.equal(TRUSTPILOT_REVIEW_COUNT, 11);
});

test('catalog and storefront use the shared Trustpilot rating', async () => {
  const [catalog, chrome] = await Promise.all([
    readFile(new URL('../src/app/catalog/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/StorefrontChrome.js', import.meta.url), 'utf8'),
  ]);

  assert.match(catalog, /\{TRUSTPILOT_RATING\}/);
  assert.match(chrome, /score: TRUSTPILOT_RATING/);
  assert.doesNotMatch(catalog, /Trustpilot[\s\S]{0,500}\b5\.0\b/);
});
