import { isPromoCurrentlyActive } from './promoStackingSafety.mjs';

export const BULK_WHOLESALE_SETTINGS_ID = 'bulk_wholesale_campaign';

export const DEFAULT_BULK_WHOLESALE_SETTINGS = {
  enabled: false,
  promoCode: '',
  abTestEnabled: true,
  eyebrowEn: 'Bulk wholesale peptides',
  eyebrowEs: 'Péptidos al por mayor',
  titleAEn: 'Save more when you build a bulk vial order',
  titleAEs: 'Ahorra más al armar un pedido de viales al por mayor',
  titleBEn: 'Build your own bulk wholesale peptide order',
  titleBEs: 'Arma tu propio pedido mayorista de péptidos',
  leadEn: 'Mix and match qualifying vials from the selected products below.',
  leadEs: 'Combina viales elegibles de los productos seleccionados.',
  stockDisclaimerEn: 'Stock is limited. Availability is subject to confirmation and quantities may be limited.',
  stockDisclaimerEs: 'El inventario es limitado. La disponibilidad está sujeta a confirmación y las cantidades pueden limitarse.',
  ctaEn: 'Build my bulk order',
  ctaEs: 'Armar mi pedido al por mayor',
};

const clean = (value, fallback = '', max = 300) => String(value ?? fallback).trim().slice(0, max);

export function normalizeBulkWholesaleSettings(value) {
  const row = value && typeof value === 'object' ? value : {};
  const d = DEFAULT_BULK_WHOLESALE_SETTINGS;
  const text = (key, max = 300) => clean(row[key], d[key], max) || d[key];
  return {
    enabled: row.enabled === true,
    promoCode: clean(row.promoCode, '', 80).toUpperCase(),
    abTestEnabled: row.abTestEnabled !== false,
    eyebrowEn: text('eyebrowEn', 100), eyebrowEs: text('eyebrowEs', 100),
    titleAEn: text('titleAEn'), titleAEs: text('titleAEs'),
    titleBEn: text('titleBEn'), titleBEs: text('titleBEs'),
    leadEn: text('leadEn', 500), leadEs: text('leadEs', 500),
    stockDisclaimerEn: text('stockDisclaimerEn', 500), stockDisclaimerEs: text('stockDisclaimerEs', 500),
    ctaEn: text('ctaEn', 100), ctaEs: text('ctaEs', 100),
  };
}

export function bulkWholesalePromoState(promo, settingsValue, now = new Date()) {
  const settings = normalizeBulkWholesaleSettings(settingsValue);
  const codeMatches = settings.promoCode && String(promo?.code || '').trim().toUpperCase() === settings.promoCode;
  const discountPct = Math.round(Number(promo?.discount_pct || 0) * 100);
  const minUnits = Math.max(0, Math.floor(Number(promo?.min_units || 0)));
  const products = String(promo?.target_product || '').split(',').map((v) => v.trim()).filter(Boolean);
  const configured = Boolean(settings.enabled && codeMatches && discountPct > 0 && minUnits > 0 && products.length);
  return {
    active: configured && isPromoCurrentlyActive(promo, now),
    configured,
    settings,
    code: settings.promoCode,
    discountPct,
    minUnits,
    maxUnits: Number(promo?.max_units || 0) || null,
    validUntil: promo?.valid_until || null,
    products,
  };
}

export function bulkWholesaleCatalogHref({ lang = 'es', variant = 'a', product = '', active = true, code = '' } = {}) {
  const params = new URLSearchParams({
    lang: lang === 'en' ? 'en' : 'es', gate: 'skip', utm_source: 'bulk_wholesale',
    utm_medium: 'landing_page', utm_campaign: `bulk_wholesale_${variant === 'b' ? 'b' : 'a'}`,
  });
  if (active && code) params.set('promo_code', String(code).trim().toUpperCase());
  if (product) params.set('product', product);
  return `/catalog?${params.toString()}`;
}
