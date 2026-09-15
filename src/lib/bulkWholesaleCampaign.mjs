import { dealPricingMode } from './dealOfWeek.mjs';

export function bulkWholesaleDealState(deal, now = new Date()) {
  const instant = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const active = Boolean(deal && deal.status === 'live' && dealPricingMode(deal) === 'bulk_threshold'
    && (!deal.starts_at || instant >= Date.parse(deal.starts_at))
    && (!deal.ends_at || instant <= Date.parse(deal.ends_at)));
  return {
    active, configured: active, code: '',
    discountPct: Math.round(Number(deal?.discount_pct || 0) * 100),
    minUnits: Math.max(0, Math.floor(Number(deal?.min_units || 0))),
    maxUnits: Number(deal?.max_units || 0) || null,
    validUntil: deal?.ends_at || null,
    products: Array.isArray(deal?.product_names) ? deal.product_names : [],
    titleEn: String(deal?.title_en || ''), titleEs: String(deal?.title_es || ''),
  };
}

export function bulkWholesaleCatalogHref({ lang = 'es', variant = 'a', product = '' } = {}) {
  const params = new URLSearchParams({ lang: lang === 'en' ? 'en' : 'es', gate: 'skip', utm_source: 'bulk_wholesale', utm_medium: 'landing_page', utm_campaign: `bulk_wholesale_${variant === 'b' ? 'b' : 'a'}` });
  if (product) params.set('product', product);
  return `/catalog?${params.toString()}`;
}
