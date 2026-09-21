import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { TRUSTPILOT_RATING, TRUSTPILOT_REVIEW_COUNT } from '../src/lib/businessLinks.js';

// The rating shown on the site is fetched live (useTrustpilotRating). These
// constants are only the fallback while that fetch is in flight or failing,
// so they are checked for being a sane value rather than pinned to a number
// that goes stale with every new review.
test('fallback Trustpilot rating is a plausible value', () => {
  assert.match(TRUSTPILOT_RATING, /^[1-5]\.\d$/);
  assert.ok(Number(TRUSTPILOT_RATING) <= 5);
  assert.ok(Number.isInteger(TRUSTPILOT_REVIEW_COUNT) && TRUSTPILOT_REVIEW_COUNT > 0);
});

test('live rating hook falls back to the shared constants', async () => {
  const hook = await readFile(new URL('../src/hooks/useTrustpilotRating.js', import.meta.url), 'utf8');
  assert.match(hook, /useState\(TRUSTPILOT_RATING\)/);
  assert.match(hook, /useState\(TRUSTPILOT_REVIEW_COUNT\)/);
});

test('catalog and storefront show the live Trustpilot rating', async () => {
  const [catalog, chrome] = await Promise.all([
    readFile(new URL('../src/app/catalog/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/StorefrontChrome.js', import.meta.url), 'utf8'),
  ]);

  assert.match(catalog, /useTrustpilotRating\(\)/);
  assert.match(catalog, /\{liveTrustpilotRating\}/);
  assert.match(chrome, /score: liveTrustpilotRating/);
  // Never a hardcoded perfect score next to the Trustpilot badge.
  assert.doesNotMatch(catalog, /Trustpilot[\s\S]{0,500}\b5\.0\b/);
});
