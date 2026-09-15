import { promoTargetsProduct } from './promoBadge.mjs';

const normalize = (value) => String(value || '').trim().toLowerCase();

export function isPromoCurrentlyActive(promo, now = new Date()) {
  if (!promo?.is_active) return false;
  const instant = (now instanceof Date ? now : new Date(now)).getTime();
  if (promo.valid_from && instant < Date.parse(promo.valid_from)) return false;
  if (promo.valid_until && instant > Date.parse(promo.valid_until)) return false;
  if (promo.usage_limit != null && Number(promo.usage_count || 0) >= Number(promo.usage_limit)) return false;
  return true;
}

export function overlappingPromoProducts(promo, productNames = []) {
  if (!String(promo?.target_product || '').trim()) return [...new Set(productNames.filter(Boolean))];
  return [...new Set((productNames || [])
    .filter((name) => promoTargetsProduct(promo, name))
    .map((name) => String(name || '').trim())
    .filter(Boolean))];
}

export function findActiveBulkPromoConflict(promos = [], productNames = [], now = new Date()) {
  for (const promo of promos || []) {
    if (!isPromoCurrentlyActive(promo, now)) continue;
    const products = overlappingPromoProducts(promo, productNames);
    if (products.length) return { promo, products };
  }
  return null;
}

export async function findLiveDealConflictForPromo(supabase, promo) {
  const { data, error } = await supabase
    .from('deals')
    .select('id, title_en, product_names, status')
    .eq('status', 'live');
  if (error) throw new Error(`Could not verify Deal of the Week overlap: ${error.message}`);

  for (const deal of data || []) {
    const products = overlappingPromoProducts(promo, deal.product_names || []);
    if (products.length) return { deal, products };
    // Weekly deals are exclusive cart offers. Even a product-targeted code on
    // another line would create two simultaneous discount systems and make the
    // order total difficult for staff and customers to audit.
    return { deal, products: deal.product_names || [] };
  }
  return null;
}

export async function findBulkPromoConflictForDeal(supabase, productNames, now = new Date()) {
  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, is_active, valid_from, valid_until, usage_limit, usage_count, min_units, target_product')
    .eq('is_active', true)
    .gt('min_units', 0);
  if (error) throw new Error(`Could not verify bulk promo overlap: ${error.message}`);
  return findActiveBulkPromoConflict(data || [], productNames, now);
}

export function promoDealConflictMessage(promo, products) {
  return `Promo ${String(promo?.code || '').trim().toUpperCase() || 'code'} overlaps the live Deal of the Week on ${products.join(', ')}. End the weekly deal first so discounts cannot stack.`;
}

export function dealPromoConflictMessage(conflict) {
  return `Promo ${String(conflict?.promo?.code || '').trim().toUpperCase()} is already active for ${conflict?.products?.join(', ')}. Deactivate it before launching a shelf-price deal on those products; the discounts cannot stack.`;
}
