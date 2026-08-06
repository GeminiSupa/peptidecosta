export const GOOGLE_LOCAL_LISTING_URL = 'https://maps.app.goo.gl/jJCMHBM8aPXx67G3A';

export const TRUSTPILOT_REVIEW_URLS = {
  en: 'https://www.trustpilot.com/review/peptidescostarica.net',
  es: 'https://es.trustpilot.com/review/peptidescostarica.net',
};

const LEGACY_GOOGLE_LISTING_URLS = new Set([
  'https://maps.app.goo.gl/i52poGFKvSdytYnK6',
  'https://maps.app.goo.gl/G4MqFLWW7y9FXvKi9?g_st=ic',
  'https://maps.app.goo.gl/AgpzEd8NNRKYNbJj9',
]);

export const DEFAULT_BUSINESS_LINKS = {
  whatsappNumber: '50660626224',
  whatsappDisplay: '+506 6062 6224',
  apiWhatsAppNumber: '18314715559',
  apiWhatsAppDisplay: '+1 (831) 471-5559',
  googleMapsUrl: GOOGLE_LOCAL_LISTING_URL,
  facebookUrl: '',
  instagramUrl: '',
  trustpilotUrl: TRUSTPILOT_REVIEW_URLS.en,
  trustpilotUrlEn: TRUSTPILOT_REVIEW_URLS.en,
  trustpilotUrlEs: TRUSTPILOT_REVIEW_URLS.es,
  googleReviewUrl: GOOGLE_LOCAL_LISTING_URL,
  facebookReviewUrl: 'https://www.facebook.com/Peptidescostaricaresearch/reviews',
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

export function isExternalHttpUrl(href = '') {
  return /^https?:\/\//i.test(String(href));
}
