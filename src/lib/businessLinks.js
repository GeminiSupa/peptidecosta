export const GOOGLE_LOCAL_LISTING_URL = 'https://maps.app.goo.gl/b9YaeUXyuvBuj8vo8';

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
  googleReviewUrl: GOOGLE_LOCAL_LISTING_URL,
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

  if (!merged.googleReviewUrl || LEGACY_GOOGLE_LISTING_URLS.has(merged.googleReviewUrl)) {
    merged.googleReviewUrl = GOOGLE_LOCAL_LISTING_URL;
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
