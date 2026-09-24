/**
 * A sales rep's personal catalog link.
 *
 * sales_agent carries their team-profile NAME, because that is the exact value
 * the catalog reads out of the query string, keeps in localStorage and finally
 * writes to orders.sales_agent at checkout. So a scan of a printed QR and the
 * order it eventually produces are attributed to the same key, and the weekly
 * commission scan matches it via agentMatchKeys.
 *
 * That also means a rep's name is load-bearing: rename someone and links on
 * business cards already in the wild stop matching them. admin_profiles carries
 * a unique index on lower(trim(name)) so two people can never collide, but
 * renaming after cards are printed is still a decision, not a typo fix.
 */

const DEFAULT_CATALOG_BASE_URL = 'https://catalog.peptidescostarica.net/catalog?lang=es';

export function catalogBaseUrl(env = {}) {
  return env.NEXT_PUBLIC_AFFILIATE_CATALOG_URL || DEFAULT_CATALOG_BASE_URL;
}

/**
 * Accents are stripped rather than replaced, because this feeds both the
 * utm_campaign and the downloaded filename. Without the NFD pass "María
 * Jiménez" becomes "mar-a-jim-nez" — a campaign name nobody can read in
 * analytics, and a filename a print shop has to guess at. Spanish names are the
 * norm here, so this is the common case, not an edge one.
 *
 * Only the slug changes. sales_agent still carries the exact name, accents
 * intact, because that is what checkout writes to the order and what the
 * commission scan matches on.
 */
export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * @param {string} name the rep's admin_profiles name
 * @param {string} [baseUrl]
 * @param {object} [options]
 * @param {string} [options.promoCode] the rep's own discount code, when they
 *        have one.
 *
 * `sales_agent` decides who gets paid. It does NOT change the price — nothing
 * in the pricing path reads it — so a link with a name and no code credits the
 * rep while their customer pays full price. That gap is what made a rep's link
 * look broken: it was attributing correctly and discounting nothing.
 *
 * Adding the code puts both on one link, so there is no longer a "wrong" link
 * to hand out by mistake. Whether a rep's link discounts is therefore decided
 * by whether a code is linked to them in the Affiliates tab — a setting, not a
 * value in this file.
 */
export function buildReferralLink(name, baseUrl = DEFAULT_CATALOG_BASE_URL, { promoCode } = {}) {
  const url = new URL(baseUrl);
  if (!url.searchParams.get('lang')) url.searchParams.set('lang', 'es');
  url.searchParams.set('sales_agent', name);
  url.searchParams.set('utm_source', 'sales_rep');
  url.searchParams.set('utm_medium', 'qr');
  url.searchParams.set('utm_campaign', slugify(name) || 'rep');
  url.searchParams.set('referral', name);
  url.searchParams.set('gate', 'skip');

  const code = String(promoCode || '').trim();
  if (code) url.searchParams.set('promo_code', code);

  return url.toString();
}

/** Filename for a downloaded QR, e.g. "maria-jimenez-qr.png". */
export function referralQrFilename(name) {
  return `${slugify(name) || 'rep'}-qr.png`;
}
