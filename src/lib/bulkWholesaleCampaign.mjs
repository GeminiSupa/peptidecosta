import { isPromoCurrentlyActive } from './promoStackingSafety.mjs';

export const BULK_WHOLESALE_CODE = 'WHOLESALE40';
export const BULK_WHOLESALE_DISCOUNT_PCT = 40;
export const BULK_WHOLESALE_MIN_UNITS = 20;
export const BULK_WHOLESALE_PRODUCTS = [
  'GLP-1 10mg',
  'GLP-1 15mg',
  'Tirzepatide 15mg',
  'Tirzepatide 20mg',
  'Tirzepatide 30mg',
  'SS-31 25mg',
  'NAD+ 500mg',
  'NAD+ 1000mg',
  'MOTS-C 40mg',
  'KissPeptin-10 10mg',
  'GHK-CU 100mg',
];

const normalize = (value) => String(value || '').trim().toLowerCase();

export function bulkWholesalePromoState(promo, now = new Date()) {
  const targets = String(promo?.target_product || '')
    .split(',')
    .map(normalize)
    .filter(Boolean);
  const expected = BULK_WHOLESALE_PRODUCTS.map(normalize);
  const configured = normalize(promo?.code) === normalize(BULK_WHOLESALE_CODE)
    && Math.round(Number(promo?.discount_pct || 0) * 100) === BULK_WHOLESALE_DISCOUNT_PCT
    && Number(promo?.min_units || 0) === BULK_WHOLESALE_MIN_UNITS
    && expected.every((name) => targets.includes(name));

  return {
    active: configured && isPromoCurrentlyActive(promo, now),
    configured,
    code: BULK_WHOLESALE_CODE,
    discountPct: BULK_WHOLESALE_DISCOUNT_PCT,
    minUnits: BULK_WHOLESALE_MIN_UNITS,
    maxUnits: Number(promo?.max_units || 0) || null,
    validUntil: promo?.valid_until || null,
    products: BULK_WHOLESALE_PRODUCTS,
  };
}

export function bulkWholesaleCatalogHref({ lang = 'es', variant = 'a', product = '', active = true } = {}) {
  const params = new URLSearchParams({
    lang: lang === 'en' ? 'en' : 'es',
    gate: 'skip',
    utm_source: 'bulk_wholesale',
    utm_medium: 'landing_page',
    utm_campaign: `bulk_wholesale_40_${variant === 'b' ? 'b' : 'a'}`,
  });
  if (active) params.set('promo_code', BULK_WHOLESALE_CODE);
  if (product) params.set('product', product);
  return `/catalog?${params.toString()}`;
}
