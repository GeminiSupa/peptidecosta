// Single source of truth for the limited-time bulk discount.
//
// This deal has to be stated identically in four unrelated places — the cart
// math, the promo banner, the wholesale tier cards and the "add N more vials"
// nudge. When the date and the percentage were copied by hand into each of
// them they drifted: the copy expired a day before the cart did, and the
// website cart was never moved off 20% at all, so the storefront advertised
// 35% while checkout charged 20%.
//
// Everything that mentions the deal MUST read it from here.

/** Deal ends Sunday 13 Sep 2026, 11:59:59 PM Costa Rica time (UTC-6, no DST). */
export const BULK_DEAL_END_MS = Date.UTC(2026, 8, 14, 5, 59, 59);

/** 10+ vial rate while the deal runs, and the standing rate once it lapses. */
export const BULK_DEAL_TEN_PLUS_PCT = 35;
export const STANDARD_TEN_PLUS_PCT = 20;
export const STANDARD_FIVE_PLUS_PCT = 15;

/** True while the deal is live. Time-based, so it lapses on its own. */
export function isBulkDealActive(now = Date.now()) {
  return now < BULK_DEAL_END_MS;
}

/** The 10+ vial percentage in force right now. */
export function tenPlusDiscountPct(now = Date.now()) {
  return isBulkDealActive(now) ? BULK_DEAL_TEN_PLUS_PCT : STANDARD_TEN_PLUS_PCT;
}

/**
 * The deal's own banner line, or '' when no deal is running.
 *
 * It lives here rather than only in DEFAULT_LANDING_PAGE_SETTINGS because a
 * saved value in site_settings overrides that default -- and a leftover empty
 * string from a previous promo therefore hid the live deal from the storefront
 * entirely. The ticker reads this directly so the deal cannot be switched off
 * by accident, only deliberately (by turning the banner off).
 */
export function bulkDealBannerText(lang = 'es', now = Date.now()) {
  if (!isBulkDealActive(now)) return '';
  const pct = tenPlusDiscountPct(now);
  return lang === 'en'
    ? `Week of BIG bulk discounts! Buy 10 vials or more of ANYTHING, get ${pct}% off. (Excludes Bac water)`
    : `¡Semana de GRANDES descuentos! Compra 10 viales o más de CUALQUIER producto y obtén ${pct}% de descuento. (Excluye agua bacteriostática)`;
}
