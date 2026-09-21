import { dealPricingMode } from './dealOfWeek.mjs';
import { OFFERS_PRICING_MODE, dealOfferProductNames, dealOfferSummaries } from './dealOffers.mjs';

/** Remaining whole countdown units for a deal end time. */
export function dealCountdownParts(validUntil, now = new Date()) {
  const end = Date.parse(validUntil || '');
  const current = now instanceof Date
    ? now.getTime()
    : (typeof now === 'number' ? now : Date.parse(now || ''));
  if (!Number.isFinite(end) || !Number.isFinite(current)) return null;

  const totalSeconds = Math.max(0, Math.ceil((end - current) / 1000));
  return {
    expired: totalSeconds === 0,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function bulkWholesaleDealState(deal, now = new Date()) {
  const instant = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const pricingMode = dealPricingMode(deal);
  // This endpoint originally powered only the old bulk-threshold campaign.
  // The catalog and home page also use it for their Deal of the Week callout,
  // so the newer two-offer mode must remain visible here too.
  const supportedMode = pricingMode === 'bulk_threshold' || pricingMode === OFFERS_PRICING_MODE;
  const active = Boolean(deal && deal.status === 'live' && supportedMode
    && (!deal.starts_at || instant >= Date.parse(deal.starts_at))
    && (!deal.ends_at || instant <= Date.parse(deal.ends_at)));
  const offerProducts = pricingMode === OFFERS_PRICING_MODE
    ? dealOfferProductNames(deal?.offers)
    : [];
  return {
    active, configured: active, code: '',
    pricingMode,
    discountPct: Math.round(Number(deal?.discount_pct || 0) * 100),
    minUnits: Math.max(0, Math.floor(Number(deal?.min_units || 0))),
    maxUnits: Number(deal?.max_units || 0) || null,
    validUntil: deal?.ends_at || null,
    products: Array.isArray(deal?.product_names) && deal.product_names.length
      ? deal.product_names
      : offerProducts,
    summariesEn: pricingMode === OFFERS_PRICING_MODE ? dealOfferSummaries(deal?.offers, 'en') : [],
    summariesEs: pricingMode === OFFERS_PRICING_MODE ? dealOfferSummaries(deal?.offers, 'es') : [],
    titleEn: String(deal?.title_en || ''), titleEs: String(deal?.title_es || ''),
  };
}

export function bulkWholesaleCatalogHref({ lang = 'es', variant = 'a', product = '', dealOnly = false } = {}) {
  const params = new URLSearchParams({ lang: lang === 'en' ? 'en' : 'es', gate: 'skip', utm_source: 'bulk_wholesale', utm_medium: 'landing_page', utm_campaign: `bulk_wholesale_${variant === 'b' ? 'b' : 'a'}` });
  if (product) params.set('product', product);
  // Opens the catalog narrowed to the weekly deal's products (see readCatalogParams).
  if (dealOnly && !product) params.set('deal', 'week');
  return `/catalog?${params.toString()}`;
}
