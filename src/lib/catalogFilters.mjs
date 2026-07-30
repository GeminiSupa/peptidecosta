/**
 * Deep-link and ordering helpers for the catalog.
 *
 * The catalog accepts `?search=` and `?category=` so the site header search box
 * and the category links in the nav, footer and landing page land on a filtered
 * view instead of the full list.
 */

/** Read the deep-link params off a URL query string. */
export function readCatalogParams(search = '') {
  const params = new URLSearchParams(search);
  return {
    search: (params.get('search') || '').trim() || null,
    category: (params.get('category') || '').trim() || null,
  };
}

/**
 * Resolve a `?category=` value against the categories that actually exist on
 * the loaded products.
 *
 * Matching is case- and whitespace-insensitive so links survive casing drift,
 * and the exact stored spelling is returned because that is what the product
 * filter compares against. An unrecognised category resolves to 'all' — a stale
 * link should show the whole catalog, never an empty page.
 */
export function resolveCategoryParam(products = [], param = '') {
  const wanted = String(param || '').trim().toLowerCase();
  if (!wanted) return 'all';
  const match = (products || []).find(
    (product) => String(product?.category || '').trim().toLowerCase() === wanted
  );
  return match ? match.category : 'all';
}

/**
 * Where a product sits in the grid, lowest rank first:
 *
 *   0  in stock and on sale     — the promotion is the reason someone is here
 *   1  in stock
 *   3  out of stock
 *
 * Being on sale lifts a product above its in-stock peers but never above the
 * in-stock line itself: advertising a discount on something nobody can buy
 * wastes the best position on the page, so out-of-stock rows stay at the bottom
 * and are not ranked among themselves by sale status.
 *
 * The two predicates are supplied by the caller rather than derived here. The
 * catalog decides what "on sale" means — a genuine markdown or an advertised
 * promo code — and passing that in keeps this helper from holding a second,
 * drifting copy of that rule.
 */
export function productSortRank(product, { isInStock, isOnSale }) {
  const outOfStock = isInStock(product) ? 0 : 1;
  const notOnSale = outOfStock === 0 && isOnSale(product) ? 0 : 1;
  return outOfStock * 2 + notOnSale;
}

/**
 * Comparator for the primary grouping of the grid. Returns 0 for products in
 * the same band so the caller can apply its own tie-break (price, or the
 * database's `priority` order for the default view).
 */
export function compareBySaleAndStock(a, b, predicates) {
  return productSortRank(a, predicates) - productSortRank(b, predicates);
}
