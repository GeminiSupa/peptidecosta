import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { FACEBOOK_REVIEW_URL, GOOGLE_LOCAL_LISTING_URL } from '../src/lib/businessLinks.js';
import { buildReviewRequestEmail, escapeHtml, reviewDestinations } from '../src/lib/reviewRequestEmail.mjs';

test('both review pages are linked with nothing configured', () => {
  // The email used to carry one button pointing at /customer-feedback, a page
  // of other people's testimonials with no way to leave one of your own.
  const d = reviewDestinations({}, {});
  assert.equal(d.google, GOOGLE_LOCAL_LISTING_URL);
  assert.equal(d.facebook, FACEBOOK_REVIEW_URL);
});

test('the admin CMS drives the links, as it does for the site badges', () => {
  const d = reviewDestinations({
    googleReviewUrl: 'https://maps.app.goo.gl/newlisting',
    facebookReviewUrl: 'https://www.facebook.com/costaricapeptides/reviews',
  }, {});
  assert.equal(d.google, 'https://maps.app.goo.gl/newlisting');
  assert.equal(d.facebook, 'https://www.facebook.com/costaricapeptides/reviews');
});

test('a REVIEW_LINK_* already set in Vercel still wins', () => {
  // These were the only control before the CMS was wired in. Ignoring one that
  // is already configured would quietly redirect a live email.
  const d = reviewDestinations(
    { googleReviewUrl: 'https://maps.app.goo.gl/fromcms' },
    { REVIEW_LINK_GOOGLE: 'https://g.page/r/override', REVIEW_LINK_FACEBOOK: 'https://fb.com/override' },
  );
  assert.equal(d.google, 'https://g.page/r/override');
  assert.equal(d.facebook, 'https://fb.com/override');
});

test('Trustpilot appears only when someone asks for it', () => {
  assert.equal(reviewDestinations({}, {}).trustpilot, '');
  assert.equal(
    reviewDestinations({}, { REVIEW_LINK_TRUSTPILOT: 'https://trustpilot.com/review/x' }).trustpilot,
    'https://trustpilot.com/review/x',
  );
});

test('the email carries a Google button and a Facebook button, in that order', () => {
  const d = reviewDestinations({}, {});
  for (const lang of ['es', 'en']) {
    const { html } = buildReviewRequestEmail({ customerName: 'Ana', lang, destinations: d });
    assert.ok(html.includes(GOOGLE_LOCAL_LISTING_URL), `${lang} should link Google`);
    assert.ok(html.includes(FACEBOOK_REVIEW_URL), `${lang} should link Facebook`);
    assert.ok(html.indexOf(GOOGLE_LOCAL_LISTING_URL) < html.indexOf(FACEBOOK_REVIEW_URL), `${lang} should lead with Google`);
    // No third call to action unless Trustpilot is configured.
    assert.doesNotMatch(html, /trustpilot/i, `${lang} should not mention Trustpilot`);
    assert.doesNotMatch(html, /customer-feedback/, `${lang} should not send anyone to the testimonials page`);
  }
});

test('each language gets its own subject and its own button labels', () => {
  const d = reviewDestinations({}, {});
  const es = buildReviewRequestEmail({ customerName: 'Ana', lang: 'es', destinations: d });
  const en = buildReviewRequestEmail({ customerName: 'Ana', lang: 'en', destinations: d });

  assert.match(es.subject, /investigación/);
  assert.match(en.subject, /research/);
  assert.ok(es.html.includes('Reseñar en Google') && es.html.includes('Reseñar en Facebook'));
  assert.ok(en.html.includes('Review us on Google') && en.html.includes('Review us on Facebook'));
  // An unknown language is Spanish, the site default and the market's language.
  assert.equal(buildReviewRequestEmail({ lang: 'fr', destinations: d }).subject, es.subject);
});

test('a nameless order still reads as a sentence', () => {
  // Not every order carries a name. The Spanish greeting interpolated it
  // straight in, so those customers were addressed as "Hola ,".
  const d = reviewDestinations({}, {});
  const es = buildReviewRequestEmail({ lang: 'es', destinations: d }).html;
  const en = buildReviewRequestEmail({ lang: 'en', destinations: d }).html;
  assert.doesNotMatch(es, /Hola\s+,/);
  assert.ok(es.includes('¡Hola!'));
  assert.ok(en.includes('Hi there,'));
  // And a name that is there is still used.
  assert.ok(buildReviewRequestEmail({ customerName: 'Ana', lang: 'es', destinations: d }).html.includes('Hola Ana,'));
});

test('a customer name cannot break the email or inject markup', () => {
  const { html } = buildReviewRequestEmail({
    customerName: '<script>alert(1)</script> & Co',
    lang: 'en',
    destinations: reviewDestinations({}, {}),
  });
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp; Co'));
  assert.equal(escapeHtml('"a"'), '&quot;a&quot;');
});

test('the cron sends what the builder produced and nothing hardcoded', async () => {
  const source = await readFile(new URL('../src/app/api/cron/review-requests/route.js', import.meta.url), 'utf8');
  assert.match(source, /buildReviewRequestEmail\(/);
  assert.match(source, /reviewDestinations\(await getBusinessLinks\(\)\)/);
  // The dead-end fallback and both inline HTML bodies are gone.
  assert.doesNotMatch(source, /customer-feedback/);
  assert.doesNotMatch(source, /Dejar una Reseña/);
});
