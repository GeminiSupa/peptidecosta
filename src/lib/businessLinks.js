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
 * Updated by Omer on 2026-09-24 after the prior Google local listing was lost.
 */
export const GOOGLE_REVIEW_URL = 'https://g.page/r/CfFdfEu7WZOHEBM/review';

// Public profiles. Tracking params stripped. Footer, Facebook badges, and
// Organization sameAs all use these. The old /reviews page is retired below.
export const INSTAGRAM_PROFILE_URL = 'https://www.instagram.com/researchpeptidescr';
export const FACEBOOK_PROFILE_URL = 'https://www.facebook.com/share/1JQPdcc89z/';
export const LINKEDIN_PROFILE_URL = 'https://www.linkedin.com/company/peptides-costa-rica/';

export const FACEBOOK_REVIEW_URL = FACEBOOK_PROFILE_URL;

export const ORGANIZATION_PROFILES = [
  { label: 'Instagram', url: INSTAGRAM_PROFILE_URL },
  { label: 'Facebook', url: FACEBOOK_PROFILE_URL },
  { label: 'LinkedIn', url: LINKEDIN_PROFILE_URL },
];

export const ORGANIZATION_SAME_AS = ORGANIZATION_PROFILES.map((profile) => profile.url);

// Retired Facebook profiles, same idea as the Google listings below: a stored
// value matching one of these is cleared so the current page wins.
const LEGACY_FACEBOOK_REVIEW_URLS = new Set([
  'https://www.facebook.com/Peptidescostaricaresearch/reviews',
  'https://www.facebook.com/Peptidescostaricaresearch',
  'https://www.facebook.com/costaricapeptides/reviews',
]);

export const TRUSTPILOT_REVIEW_URLS = {
  en: 'https://www.trustpilot.com/review/peptidescostarica.net',
  es: 'https://es.trustpilot.com/review/peptidescostarica.net',
};

// Fallback values used when the live /api/trustpilot-rating fetch fails.
// Updated 2026-09-09 to match the current Trustpilot profile (4.6 / 12 reviews).
// The live values are fetched dynamically via useTrustpilotRating hook.
export const TRUSTPILOT_RATING = '4.6';
export const TRUSTPILOT_REVIEW_COUNT = 12;

// Retired listings. A stored value that matches one of these loses to
// GOOGLE_LOCAL_LISTING_URL in normalizeBusinessLinks, so add the outgoing URL
// here whenever the profile changes or the saved row keeps winning.
const LEGACY_GOOGLE_LISTING_URLS = new Set([
  'https://maps.app.goo.gl/i52poGFKvSdytYnK6',
  'https://maps.app.goo.gl/G4MqFLWW7y9FXvKi9?g_st=ic',
  'https://maps.app.goo.gl/AgpzEd8NNRKYNbJj9',
  'https://maps.app.goo.gl/jJCMHBM8aPXx67G3A',
]);

// Retired direct review forms. A CMS row can carry one of these even after the
// default changes, so normalizeBusinessLinks upgrades it to the current form.
const LEGACY_GOOGLE_REVIEW_URLS = new Set([
  'https://g.page/r/Cda41I2_XToeEBM/review',
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
  // Empty, not GOOGLE_LOCAL_LISTING_URL. A hardcoded URL here is what the
  // badges actually render from before the CMS fetch returns, and whenever that
  // fetch fails or the row is missing the key, so clearing the admin field could
  // never remove the link on its own. The constant above is kept for the legacy
  // upgrade in normalizeBusinessLinks.
  googleMapsUrl: '',
  facebookUrl: '',
  instagramUrl: '',
  trustpilotUrl: TRUSTPILOT_REVIEW_URLS.en,
  trustpilotUrlEn: TRUSTPILOT_REVIEW_URLS.en,
  trustpilotUrlEs: TRUSTPILOT_REVIEW_URLS.es,
  // Empty for the same reason as googleMapsUrl above. The review EMAILS keep
  // their own GOOGLE_REVIEW_URL fallback in reviewRequestEmail.mjs, so asking a
  // customer for a review is unaffected by unlinking the storefront badges.
  googleReviewUrl: '',
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

  // An emptied box means "stop linking Google", and is kept empty. It used to
  // be refilled with the default here, so clearing either field in the admin
  // could never take effect: the save runs through this function, which wrote
  // the URL straight back into the row. A row with the key missing entirely
  // still gets the default from the spread above, so an unconfigured install
  // is unchanged.
  merged.googleMapsUrl = String(merged.googleMapsUrl || '').trim();
  merged.googleReviewUrl = String(merged.googleReviewUrl || '').trim();

  if (LEGACY_GOOGLE_LISTING_URLS.has(merged.googleMapsUrl)) {
    merged.googleMapsUrl = GOOGLE_LOCAL_LISTING_URL;
  }

  // A listing URL saved in the review field is upgraded to the review form.
  // The current listing URL is included: it was the default for this field
  // until 2026-09-05, so it is sitting in saved rows meaning "review link"
  // while only ever opening the map card.
  if (
    LISTING_URLS_USED_AS_REVIEW_LINKS.has(merged.googleReviewUrl) ||
    LEGACY_GOOGLE_REVIEW_URLS.has(merged.googleReviewUrl)
  ) {
    merged.googleReviewUrl = GOOGLE_REVIEW_URL;
  }

  // Cleared rather than replaced, so a profile URL set in the CMS still gets
  // its turn before the built-in default.
  merged.facebookReviewUrl = String(merged.facebookReviewUrl || '').trim();
  merged.facebookUrl = String(merged.facebookUrl || '').trim();
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
 * Where every Facebook badge points.
 *
 * The old reviews page is still saved on the business-links row. It is ignored
 * so the badge, the footer, and the schema open the current Facebook page.
 * A different address typed in the admin still wins.
 */
function usableFacebookUrl(value) {
  const url = String(value || '').trim();
  if (!url || LEGACY_FACEBOOK_REVIEW_URLS.has(url)) return '';
  return url;
}

export function getFacebookReviewUrl(links = {}) {
  return usableFacebookUrl(links.facebookReviewUrl)
    || usableFacebookUrl(links.facebookUrl)
    || FACEBOOK_REVIEW_URL;
}

export function isExternalHttpUrl(href = '') {
  return /^https?:\/\//i.test(String(href));
}
