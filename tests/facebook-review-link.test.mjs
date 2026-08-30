import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  FACEBOOK_REVIEW_URL,
  getFacebookReviewUrl,
  normalizeBusinessLinks,
} from '../src/lib/businessLinks.js';

test('the CMS review URL wins', () => {
  const links = normalizeBusinessLinks({ facebookReviewUrl: 'https://www.facebook.com/costaricapeptides/reviews' });
  assert.equal(getFacebookReviewUrl(links), 'https://www.facebook.com/costaricapeptides/reviews');
});

test('setting only the profile field takes effect', () => {
  // It could not before: facebookReviewUrl carried a non-empty default that
  // outranked facebookUrl in every `a || b` chain, so this field was dead.
  const links = normalizeBusinessLinks({ facebookUrl: 'https://www.facebook.com/costaricapeptides' });
  assert.equal(getFacebookReviewUrl(links), 'https://www.facebook.com/costaricapeptides');
});

test('a stored retired profile loses to the current one', () => {
  const links = normalizeBusinessLinks({ facebookReviewUrl: 'https://www.facebook.com/Peptidescostaricaresearch/reviews' });
  assert.equal(getFacebookReviewUrl(links), FACEBOOK_REVIEW_URL);
});

test('nothing configured falls back to the current profile', () => {
  assert.equal(getFacebookReviewUrl(normalizeBusinessLinks({})), FACEBOOK_REVIEW_URL);
  assert.equal(getFacebookReviewUrl({}), FACEBOOK_REVIEW_URL);
  assert.equal(getFacebookReviewUrl(), FACEBOOK_REVIEW_URL);
});

test('every Facebook review badge reads the CMS, none hardcode a profile', async () => {
  const files = ['../src/app/catalog/page.js', '../src/app/landing/page.js', '../src/components/StorefrontChrome.js'];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /getFacebookReviewUrl\(links\)/, `${file} should read the link from the CMS`);
    assert.doesNotMatch(
      source,
      /href[=:]\s*["']https:\/\/www\.facebook\.com/,
      `${file} still hardcodes a Facebook URL`,
    );
  }
});
