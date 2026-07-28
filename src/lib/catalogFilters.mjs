/**
 * Deep-link helpers for the catalog.
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
