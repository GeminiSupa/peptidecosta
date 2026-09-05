import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BUSINESS_LINKS,
  GOOGLE_LOCAL_LISTING_URL,
  GOOGLE_REVIEW_URL,
  normalizeBusinessLinks,
} from '../src/lib/businessLinks.js';
import { reviewDestinations } from '../src/lib/reviewRequestEmail.mjs';

test('the review link is the rating form, not the map listing', () => {
  assert.match(GOOGLE_REVIEW_URL, /\/review$/);
  assert.notEqual(GOOGLE_REVIEW_URL, GOOGLE_LOCAL_LISTING_URL);
  assert.equal(DEFAULT_BUSINESS_LINKS.googleReviewUrl, GOOGLE_REVIEW_URL);
});

test('the map link is left alone, it is a different job', () => {
  assert.equal(DEFAULT_BUSINESS_LINKS.googleMapsUrl, GOOGLE_LOCAL_LISTING_URL);
  assert.equal(normalizeBusinessLinks({}).googleMapsUrl, GOOGLE_LOCAL_LISTING_URL);
});

test('a listing url saved as the review link is upgraded', () => {
  // This is what is sitting in the saved row: the listing was the default for
  // the review field until 2026-09-05.
  const fixed = normalizeBusinessLinks({ googleReviewUrl: GOOGLE_LOCAL_LISTING_URL });
  assert.equal(fixed.googleReviewUrl, GOOGLE_REVIEW_URL);

  const legacy = normalizeBusinessLinks({ googleReviewUrl: 'https://maps.app.goo.gl/AgpzEd8NNRKYNbJj9' });
  assert.equal(legacy.googleReviewUrl, GOOGLE_REVIEW_URL);

  const empty = normalizeBusinessLinks({ googleReviewUrl: '' });
  assert.equal(empty.googleReviewUrl, GOOGLE_REVIEW_URL);
});

test('a real review link set in the CMS still wins', () => {
  const custom = 'https://g.page/r/SomethingElse/review';
  assert.equal(normalizeBusinessLinks({ googleReviewUrl: custom }).googleReviewUrl, custom);
});

test('the review email points at the rating form', () => {
  const d = reviewDestinations({}, {});
  assert.equal(d.google, GOOGLE_REVIEW_URL);
  assert.doesNotMatch(d.google, /maps\.app\.goo\.gl/);
});

test('the CMS and the env var still outrank the default', () => {
  assert.equal(
    reviewDestinations({ googleReviewUrl: 'https://g.page/r/FromCms/review' }, {}).google,
    'https://g.page/r/FromCms/review',
  );
  assert.equal(
    reviewDestinations({ googleReviewUrl: 'https://g.page/r/FromCms/review' }, { REVIEW_LINK_GOOGLE: 'https://g.page/r/FromEnv/review' }).google,
    'https://g.page/r/FromEnv/review',
  );
});
