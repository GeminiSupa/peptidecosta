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
  // Where it still has to be the rating form is the review email, which is the
  // only thing that asks a customer for a review.
  assert.equal(reviewDestinations({}, {}).google, GOOGLE_REVIEW_URL);
});

test('neither Google field is defaulted to a URL any more', () => {
  // These used to hold the real URLs, which is what the badges rendered before
  // the CMS fetch returned and whenever it failed, so clearing the admin field
  // could not remove the link. Nothing invents a Google link now.
  assert.equal(DEFAULT_BUSINESS_LINKS.googleReviewUrl, '');
  assert.equal(DEFAULT_BUSINESS_LINKS.googleMapsUrl, '');
  assert.equal(normalizeBusinessLinks({}).googleReviewUrl, '');
  assert.equal(normalizeBusinessLinks({}).googleMapsUrl, '');
});

test('a listing url saved as the review link is upgraded', () => {
  // This is what is sitting in the saved row: the listing was the default for
  // the review field until 2026-09-05.
  const fixed = normalizeBusinessLinks({ googleReviewUrl: GOOGLE_LOCAL_LISTING_URL });
  assert.equal(fixed.googleReviewUrl, GOOGLE_REVIEW_URL);

  const legacy = normalizeBusinessLinks({ googleReviewUrl: 'https://maps.app.goo.gl/AgpzEd8NNRKYNbJj9' });
  assert.equal(legacy.googleReviewUrl, GOOGLE_REVIEW_URL);

});

test('an emptied field stays empty, so the admin can unlink Google', () => {
  // Both fields used to be refilled with the default when blank, which meant
  // clearing them in the admin saved the URL straight back and the badges kept
  // linking out. Blank now means "show the badge, do not link it".
  const cleared = normalizeBusinessLinks({ googleReviewUrl: '', googleMapsUrl: '' });
  assert.equal(cleared.googleReviewUrl, '');
  assert.equal(cleared.googleMapsUrl, '');

  // Whitespace is the same as blank: the admin box is a text input.
  const spaces = normalizeBusinessLinks({ googleReviewUrl: '  ', googleMapsUrl: ' ' });
  assert.equal(spaces.googleReviewUrl, '');
  assert.equal(spaces.googleMapsUrl, '');

  // A URL typed back into either box still wins, so this is reversible from the
  // admin without a deploy.
  const back = normalizeBusinessLinks({ googleReviewUrl: GOOGLE_REVIEW_URL, googleMapsUrl: GOOGLE_LOCAL_LISTING_URL });
  assert.equal(back.googleReviewUrl, GOOGLE_REVIEW_URL);
  assert.equal(back.googleMapsUrl, GOOGLE_LOCAL_LISTING_URL);
});

test('clearing the site fields does not stop the review emails linking Google', () => {
  // The emails are an ask for a review, not a badge on a page. They keep their
  // own fallback so unlinking the storefront does not silently kill them.
  const cleared = normalizeBusinessLinks({ googleReviewUrl: '', googleMapsUrl: '' });
  assert.equal(reviewDestinations(cleared, {}).google, GOOGLE_REVIEW_URL);
});

test('the retired direct review link is upgraded too', () => {
  const fixed = normalizeBusinessLinks({ googleReviewUrl: 'https://g.page/r/Cda41I2_XToeEBM/review' });
  assert.equal(fixed.googleReviewUrl, 'https://g.page/r/CfFdfEu7WZOHEBM/review');
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
