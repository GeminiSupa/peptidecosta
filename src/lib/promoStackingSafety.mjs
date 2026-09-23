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

/**
 * Whether a deal discounts by rewriting shelf prices.
 *
 * Only a shelf deal can stack with a promo code, and that is the whole reason
 * this file exists. A shelf deal marks the catalog price down in the products
 * table, so a code applied afterwards takes its percentage off the *already
 * reduced* price - two discounts on one line, which nobody intended to give.
 *
 * Offers and bulk-threshold deals never stack: both the checkout and the order
 * route drop the deal the moment a promo code is present (see
 * `dealOffers = !resolvedPromo && ...` in api/orders/create and
 * `dealOffers && !promo` in authoritativeCheckout). The customer gets the code
 * or the deal, whichever they chose - never both.
 */
function isShelfPricedDeal(deal) {
  const mode = deal?.pricing_mode;
  return mode !== 'offers' && mode !== 'bulk_threshold';
}

/**
 * The shelf-priced live deals a promo code would stack on top of.
 *
 * This used to refuse a code whenever *any* deal was live, whatever it sold:
 * the loop returned a conflict on its first iteration even when the product
 * lists had nothing in common. That blocked every new promo code for the whole
 * run of a weekly deal, and turned customers away at checkout with a message
 * written for staff. Only a genuine double discount is refused now - a shelf
 * deal and a code that covers at least one of the same products.
 */
export async function findLiveDealConflictForPromo(supabase, promo) {
  const { data, error } = await supabase
    .from('deals')
    .select('id, title_en, product_names, status, pricing_mode')
    .eq('status', 'live');
  if (error) throw new Error(`Could not verify Deal of the Week overlap: ${error.message}`);

  for (const deal of data || []) {
    if (!isShelfPricedDeal(deal)) continue;
    const products = overlappingPromoProducts(promo, deal.product_names || []);
    if (products.length) return { deal, products };
  }
  return null;
}

/**
 * Active bulk codes a new deal would stack with.
 *
 * Skipped for offers and bulk-threshold deals, which stand aside for a promo
 * code at checkout and so cannot double up with one. Only a shelf deal, which
 * rewrites the catalog price, is checked.
 */
export async function findBulkPromoConflictForDeal(supabase, productNames, now = new Date(), { pricingMode = 'shelf' } = {}) {
  if (!isShelfPricedDeal({ pricing_mode: pricingMode })) return null;

  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, is_active, valid_from, valid_until, usage_limit, usage_count, min_units, target_product')
    .eq('is_active', true)
    .gt('min_units', 0);
  if (error) throw new Error(`Could not verify bulk promo overlap: ${error.message}`);
  return findActiveBulkPromoConflict(data || [], productNames, now);
}

/** Read by staff in the admin and by customers at checkout, so it names the
 *  reason rather than telling a shopper to end a deal they cannot see. */
export function promoDealConflictMessage(promo, products) {
  return `Promo ${String(promo?.code || '').trim().toUpperCase() || 'code'} cannot be used on ${products.join(', ')} - those products are already marked down for the Deal of the Week, and the two discounts cannot stack.`;
}

export function dealPromoConflictMessage(conflict) {
  return `Promo ${String(conflict?.promo?.code || '').trim().toUpperCase()} is already active for ${conflict?.products?.join(', ')}. Deactivate it before launching a shelf-price deal on those products; the discounts cannot stack.`;
}
