export const GOOGLE_LOCAL_LISTING_URL = 'https://maps.app.goo.gl/b9YaeUXyuvBuj8vo8';

/**
 * Where "leave us a Google review" points.
 *
 * Deliberately NOT the listing URL above. That one opens the map card, and the
 * customer then has to find "Write a review" for themselves — every step
 * between the ask and the star rating loses people, and this link is the whole
 * point of the review email. The g.page/r/…/review form opens the rating box
 * directly.
 *
 * Supplied by Omer on 2026-09-05 from Google Business Profile -> Ask for
 * reviews. Verified to resolve to listing 0xa1fd683cec6185e1:0x1e3a5dbf8dd4b8d6,
 * the same business as GOOGLE_LOCAL_LISTING_URL, through Google's own
 * review-solicitation flow.
 */
export const GOOGLE_REVIEW_URL = 'https://g.page/r/Cda41I2_XToeEBM/review';

export const FACEBOOK_REVIEW_URL = 'https://www.facebook.com/costaricapeptides/reviews';

// Retired Facebook profiles, same idea as the Google listings below: a stored
// value matching one of these is cleared so the current page wins.
const LEGACY_FACEBOOK_REVIEW_URLS = new Set([
  'https://www.facebook.com/Peptidescostaricaresearch/reviews',
  'https://www.facebook.com/Peptidescostaricaresearch',
]);

export const TRUSTPILOT_REVIEW_URLS = {
  en: 'https://www.trustpilot.com/review/peptidescostarica.net',
  es: 'https://es.trustpilot.com/review/peptidescostarica.net',
};

// Verified against the public Trustpilot profile on 2026-08-13. Keep the
// catalog and storefront chrome on one value so they cannot drift apart.
export const TRUSTPILOT_RATING = '4.4';
export const TRUSTPILOT_REVIEW_COUNT = 11;

// Retired listings. A stored value that matches one of these loses to
// GOOGLE_LOCAL_LISTING_URL in normalizeBusinessLinks, so add the outgoing URL
// here whenever the profile changes or the saved row keeps winning.
const LEGACY_GOOGLE_LISTING_URLS = new Set([
  'https://maps.app.goo.gl/i52poGFKvSdytYnK6',
  'https://maps.app.goo.gl/G4MqFLWW7y9FXvKi9?g_st=ic',
  'https://maps.app.goo.gl/AgpzEd8NNRKYNbJj9',
  'https://maps.app.goo.gl/jJCMHBM8aPXx67G3A',
]);

// Anything in here, saved as the REVIEW link, is a map card rather than a
// rating form and loses to GOOGLE_REVIEW_URL.
const LISTING_URLS_USED_AS_REVIEW_LINKS = new Set([
  GOOGLE_LOCAL_LISTING_URL,
  ...LEGACY_GOOGLE_LISTING_URLS,
]);

export const DEFAULT_BUSINESS_LINKS = {
  whatsappNumber: '50684046973',
  whatsappDisplay: '+506 8404-6973',
  apiWhatsAppNumber: '18314715559',
  apiWhatsAppDisplay: '+1 (831) 471-5559',
  googleMapsUrl: GOOGLE_LOCAL_LISTING_URL,
  facebookUrl: '',
  instagramUrl: '',
  trustpilotUrl: TRUSTPILOT_REVIEW_URLS.en,
  trustpilotUrlEn: TRUSTPILOT_REVIEW_URLS.en,
  trustpilotUrlEs: TRUSTPILOT_REVIEW_URLS.es,
  googleReviewUrl: GOOGLE_REVIEW_URL,
  // Empty on purpose. A non-empty default here outranked facebookUrl in every
  // `facebookReviewUrl || facebookUrl` chain, so setting the profile field in
  // the CMS could never take effect — the default silently won. The canonical
  // URL is FACEBOOK_REVIEW_URL, applied last by getFacebookReviewUrl.
  facebookReviewUrl: '',
  supportEmail: 'support@peptidescostarica.net',
};

export function normalizeBusinessLinks(value) {
  const merged = {
    ...DEFAULT_BUSINESS_LINKS,
    ...(value && typeof value === 'object' ? value : {}),
  };

  if (!merged.googleMapsUrl || LEGACY_GOOGLE_LISTING_URLS.has(merged.googleMapsUrl)) {
    merged.googleMapsUrl = GOOGLE_LOCAL_LISTING_URL;
  }

  // A listing URL saved in the review field is upgraded to the review form.
  // The current listing URL is included: it was the default for this field
  // until 2026-09-05, so it is sitting in saved rows meaning "review link"
  // while only ever opening the map card.
  if (!merged.googleReviewUrl || LISTING_URLS_USED_AS_REVIEW_LINKS.has(merged.googleReviewUrl)) {
    merged.googleReviewUrl = GOOGLE_REVIEW_URL;
  }

  // Cleared rather than replaced, so a profile URL set in the CMS still gets
  // its turn before the built-in default.
  if (LEGACY_FACEBOOK_REVIEW_URLS.has(merged.facebookReviewUrl)) merged.facebookReviewUrl = '';
  if (LEGACY_FACEBOOK_REVIEW_URLS.has(merged.facebookUrl)) merged.facebookUrl = '';

  merged.trustpilotUrlEn = merged.trustpilotUrlEn || merged.trustpilotUrl || TRUSTPILOT_REVIEW_URLS.en;
  merged.trustpilotUrlEs = merged.trustpilotUrlEs || TRUSTPILOT_REVIEW_URLS.es;
  merged.trustpilotUrl = merged.trustpilotUrl || merged.trustpilotUrlEn;

  return merged;
}

export function getTrustpilotReviewUrl(lang = 'es', links = {}) {
  if (lang === 'es') {
    return links.trustpilotUrlEs || TRUSTPILOT_REVIEW_URLS.es;
  }

  return links.trustpilotUrlEn || links.trustpilotUrl || TRUSTPILOT_REVIEW_URLS.en;
}

/**
 * Where the Facebook reviews badge points.
 *
 * The catalog had this URL hardcoded, so changing it in the CMS updated the
 * landing page and the storefront chrome and left the catalog on the old
 * profile. One helper now, so the three cannot drift apart again.
 */
export function getFacebookReviewUrl(links = {}) {
  return links.facebookReviewUrl || links.facebookUrl || FACEBOOK_REVIEW_URL;
}

export function isExternalHttpUrl(href = '') {
  return /^https?:\/\//i.test(String(href));
}
