/**
 * Sale ribbons driven by a promo code.
 *
 * Distinct from a product-level sale, where price_usd is genuinely lower and
 * the ribbon simply reports the difference. Here the shelf price is unchanged
 * until the customer enters the code, so the default wording names the code —
 * a bare "Save 25%" above an unreduced price reads as a bug.
 *
 * Hidden promos never badge. They are private codes; advertising their
 * products on the public catalog would defeat the purpose.
 */

export const BADGE_STYLES = ['code', 'save', 'limited', 'custom'];

/**
 * Wording choices for the picker, showing the discount actually selected.
 *
 * These were once fixed strings using 25% as an example, which read as a bug
 * when the promo was set to something else: choosing 10% still offered
 * "25% off with CODE".
 *
 * @param {number} discountPct fraction (0.10) or whole number (10)
 * @param {string} [code] the code being created, previewed once typed
 */
export function getBadgeStyleOptions(discountPct, code = '') {
  const pct = toPercent(discountPct);
  const shown = pct > 0 ? pct : 25;
  const name = String(code || '').trim().toUpperCase() || 'CODE';

  return [
    { value: 'code', label: `${shown}% off with ${name}`, hint: 'Names the code so the unchanged price makes sense' },
    { value: 'save', label: `Save ${shown}%`, hint: 'Cleaner, but does not explain the full price' },
    { value: 'limited', label: 'Limited offer', hint: 'No numbers — useful for negotiable pricing' },
    { value: 'custom', label: 'Write my own', hint: 'Free text, e.g. "Ask us for bulk pricing"' },
  ];
}

/** discount_pct is stored as a fraction (0.25); promos occasionally carry 25. */
export function toPercent(discountPct) {
  const value = Number(discountPct || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value <= 1 ? value * 100 : value);
}

/** Comma-separated product names, matched the same way checkout matches them. */
export function promoTargetsProduct(promo, productName) {
  const target = String(promo?.target_product || '').trim();
  if (!target) return true; // no target list means every product
  const name = String(productName || '').toLowerCase();
  if (!name) return false;
  return target
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => name.includes(entry));
}

/** Active, in-date, not hidden, badge switched on. */
export function isBadgeEligible(promo, now = new Date()) {
  if (!promo) return false;
  if (!promo.show_sale_badge) return false;
  if (!promo.is_active) return false;
  if (promo.hidden) return false;

  const current = now instanceof Date ? now : new Date(now);
  if (promo.valid_from && current < new Date(promo.valid_from)) return false;
  if (promo.valid_until && current > new Date(promo.valid_until)) return false;

  const limit = promo.usage_limit;
  if (limit !== null && limit !== undefined && Number(promo.usage_count || 0) >= Number(limit)) return false;

  return true;
}

/**
 * Ribbon wording. Returns null when the promo cannot produce sensible text —
 * callers should render no ribbon rather than an empty one.
 */
export function resolvePromoBadgeText(promo, lang = 'es') {
  if (!promo) return null;

  const style = BADGE_STYLES.includes(promo.badge_style) ? promo.badge_style : 'code';
  const isEn = String(lang).toLowerCase().startsWith('en');

  if (style === 'custom') {
    const en = String(promo.badge_text || '').trim();
    const es = String(promo.badge_text_es || '').trim();
    // Each language falls back to the other so a half-filled promo still
    // shows something rather than a blank ribbon.
    const chosen = isEn ? (en || es) : (es || en);
    return chosen || null;
  }

  if (style === 'limited') return isEn ? 'Limited offer' : 'Oferta limitada';

  const pct = toPercent(promo.discount_pct);
  if (pct <= 0) return isEn ? 'Limited offer' : 'Oferta limitada';

  if (style === 'save') return isEn ? `Save ${pct}%` : `Ahorra ${pct}%`;

  const code = String(promo.code || '').trim().toUpperCase();
  if (!code) return isEn ? `Save ${pct}%` : `Ahorra ${pct}%`;
  return isEn ? `${pct}% off with ${code}` : `${pct}% con ${code}`;
}

/**
 * Best badge for one product. Where several promos qualify, the largest
 * discount wins so the catalog advertises the strongest offer.
 */
export function getPromoBadgeForProduct(promos, productName, lang = 'es', now = new Date()) {
  const candidates = (promos || [])
    .filter((promo) => isBadgeEligible(promo, now) && promoTargetsProduct(promo, productName))
    .sort((a, b) => toPercent(b.discount_pct) - toPercent(a.discount_pct));

  for (const promo of candidates) {
    const text = resolvePromoBadgeText(promo, lang);
    if (text) return { text, code: promo.code, discountPct: toPercent(promo.discount_pct) };
  }
  return null;
}
