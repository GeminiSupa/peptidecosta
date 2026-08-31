/**
 * The Google Customer Reviews opt-in shown on the order confirmation page.
 *
 * Google asks the customer, right after they order, whether it may email them a
 * survey once the package should have arrived. That means the snippet needs
 * four things the confirmation page does not otherwise have: the order number,
 * the customer's email, where it is going, and when it should get there.
 *
 * None of those travel in the URL. The email in particular is personal data and
 * a query string is the one place it must never be — it lands in history, in
 * referrers and in server logs. So checkout stashes a small record in session
 * storage on its way out, and the confirmation page reads it once and clears
 * it.
 *
 * The rules live here rather than in the component so the date arithmetic and
 * the "do we have enough to ask Google" decision can be tested without a
 * browser.
 */

import { isoToCrWall } from './crTime.mjs';

/** Public identifier; it is visible in the page source by design. */
export const GCR_MERCHANT_ID = Number(process.env.NEXT_PUBLIC_GCR_MERCHANT_ID) || 5772972120;

/** One-shot handoff from checkout to the confirmation page. */
export const GCR_STORAGE_KEY = 'gcr_review_optin';

/**
 * Checkout only collects Costa Rican addresses — province, cantón, district —
 * and ships with Correos de Costa Rica and Moovin. A record that predates a
 * country field is therefore Costa Rican, not unknown.
 */
export const GCR_DEFAULT_COUNTRY = 'CR';

/**
 * Working days from order to doormat.
 *
 * The shipping policy promises processing within 24 hours and delivery in one
 * to three business days inside Costa Rica. Four is that promise at its outer
 * edge, which is the honest number to give Google: the survey goes out after
 * this date, so an optimistic estimate asks the customer to review a package
 * they are still waiting for.
 */
export const GCR_DELIVERY_BUSINESS_DAYS = 4;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value, limit = 240) => String(value ?? '').trim().slice(0, limit);

/**
 * A country code, never a truncated country name.
 *
 * Cutting the value to two characters looked like normalising and was actually
 * a way to be confidently wrong: "Costa Rica" came out as "CO", which is
 * Colombia, and passed every check downstream. Anything that is not already a
 * two-letter code is left intact so the payload builder can reject it.
 */
const normalizeCountry = (value) => String(value ?? '').trim().toUpperCase();

/** Today in Costa Rica as YYYY-MM-DD, whatever timezone the browser is in. */
export function crToday(now = new Date()) {
  return isoToCrWall(new Date(now).toISOString()).slice(0, 10);
}

/**
 * `startDate` plus a number of business days, as YYYY-MM-DD.
 *
 * Weekends are skipped because the couriers do not run on them, and a Friday
 * order promised "three days" that lands on Monday is a complaint, not a
 * delivery. Public holidays are not modelled: they would push the estimate
 * later, and a later estimate only delays the survey rather than mistiming it.
 */
export function addBusinessDays(startDate, days = GCR_DELIVERY_BUSINESS_DAYS) {
  const parsed = Date.parse(`${clean(startDate, 10)}T12:00:00Z`);
  if (!Number.isFinite(parsed)) return null;

  const date = new Date(parsed);
  let remaining = Math.max(0, Math.floor(Number(days) || 0));
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/** When an order placed now should have arrived. */
export function estimatedDeliveryDate(now = new Date(), days = GCR_DELIVERY_BUSINESS_DAYS) {
  return addBusinessDays(crToday(now), days);
}

/**
 * What checkout hands to the confirmation page.
 *
 * Built at the moment the order is placed, because that is the only point where
 * all of it is in hand — two of the three checkout paths clear the customer's
 * details before redirecting, and one of them never had an order number in the
 * URL to begin with.
 */
export function buildReviewOptInRecord({ orderId, email, country, now = new Date() } = {}) {
  return {
    orderId: clean(orderId, 120),
    email: clean(email, 240).toLowerCase(),
    country: normalizeCountry(country) || GCR_DEFAULT_COUNTRY,
    estimatedDeliveryDate: estimatedDeliveryDate(now),
  };
}

/**
 * The object Google's `surveyoptin.render` expects, or null when this order
 * cannot support the ask.
 *
 * Returning null rather than a half-filled object is deliberate. Google rejects
 * a submission missing any required field, and a rejected one is invisible —
 * the opt-in simply never appears, with nothing on the page to say why. Better
 * to not ask than to ask wrongly.
 */
export function reviewOptInPayload(record = {}, merchantId = GCR_MERCHANT_ID) {
  const orderId = clean(record.orderId, 120);
  const email = clean(record.email, 240).toLowerCase();
  const country = normalizeCountry(record.country) || GCR_DEFAULT_COUNTRY;
  const deliveryDate = clean(record.estimatedDeliveryDate, 10);

  if (!merchantId) return null;
  if (!orderId) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return null;
  if (!/^[A-Z]{2}$/.test(country)) return null;

  return {
    merchant_id: merchantId,
    order_id: orderId,
    email,
    delivery_country: country,
    estimated_delivery_date: deliveryDate,
  };
}

/* -------------------------------------------------------------------------
 * The seller-rating badge
 *
 * A different Google widget from the opt-in above, and a different decision.
 * The opt-in is transactional: it appears once, to a customer who has just
 * bought something. The badge is marketing — a small floating panel on every
 * public page, showing the seller rating those surveys eventually earn.
 * ------------------------------------------------------------------------- */

/**
 * Bottom-left, and not as a matter of taste.
 *
 * Google fixes its wrapper at z-index 2147483647, above everything this site
 * draws, so whichever corner it takes it takes outright. The bottom-right
 * corner is already spoken for on every page that matters: the catalog's cart
 * button (right 24px), the landing page's floating CTA (right 22px) and the
 * toast stack (right 24px). A badge there would cover the one control a
 * customer needs in order to pay.
 *
 * Bottom-left is free. The live-chat launcher is written for that corner but
 * is not mounted anywhere; if it is ever mounted, the two need separating, and
 * this is the comment that says why.
 */
export const GCR_BADGE_POSITION = 'LEFT_BOTTOM';

/**
 * An off switch, because the badge can say the wrong thing.
 *
 * Until enough surveys come back, Google draws "no rating available" rather
 * than drawing nothing — a standing "this shop has no reviews" notice in the
 * corner of every page, which is worse than no badge at all. Setting
 * NEXT_PUBLIC_GCR_BADGE=off takes it down without a deploy of new code.
 */
export const GCR_BADGE_ENABLED =
  String(process.env.NEXT_PUBLIC_GCR_BADGE ?? '').trim().toLowerCase() !== 'off';

/** The two languages the storefront is written in. */
const BADGE_LANGUAGES = new Set(['es', 'en']);

/**
 * The badge speaks whatever language the rest of the page is speaking.
 *
 * Spanish is the fallback rather than English: it is the document default
 * (`<html lang="es">`) and the language of the one market this shop ships to.
 */
export function badgeLanguage(value) {
  const code = String(value ?? '').trim().toLowerCase().slice(0, 2);
  return BADGE_LANGUAGES.has(code) ? code : 'es';
}

/**
 * What `merchantwidget.start` expects, or null when the badge should not run.
 *
 * The region is pinned rather than left to Google's own locale guessing.
 * Seller ratings are held per country, this shop ships to exactly one, and a
 * guess that lands on the wrong country renders "no rating available" over a
 * rating that exists.
 */
export function reviewBadgeConfig({
  merchantId = GCR_MERCHANT_ID,
  enabled = GCR_BADGE_ENABLED,
  language,
  region = GCR_DEFAULT_COUNTRY,
} = {}) {
  if (!enabled) return null;
  if (!merchantId) return null;

  const country = normalizeCountry(region);

  return {
    merchant_id: merchantId,
    position: GCR_BADGE_POSITION,
    language: badgeLanguage(language),
    // An unreadable region code is dropped rather than forwarded: Google then
    // falls back to its own logic, which beats handing it something invalid.
    ...(/^[A-Z]{2}$/.test(country) ? { region: country } : {}),
  };
}
