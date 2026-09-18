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
    // `?deal=week` narrows the catalog to this week's deal products — the
    // "Build my order" button on /bulk-discounts sends it.
    dealOnly: (params.get('deal') || '').trim().toLowerCase() === 'week',
    // `?cart=open` opens the cart drawer, which holds checkout. The Deal of the
    // Week page's Checkout button sends it, so the customer lands in checkout
    // with the cart they built there instead of on the product list.
    openCart: (params.get('cart') || '').trim().toLowerCase() === 'open',
  };
}

/**
 * Product names compared loosely: some are stored with a non-breaking space
 * ("GLP-1 10mg"), so every kind of space is collapsed before comparing.
 */
export function catalogNameKey(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Whether a catalog product is one of the weekly deal's products. */
export function productInDeal(product = {}, dealProductNames = []) {
  const wanted = new Set((dealProductNames || []).map(catalogNameKey));
  return wanted.has(catalogNameKey(product?.product));
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

export function normalizeCatalogSearchText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactSearchText(value = '') {
  return normalizeCatalogSearchText(value).replace(/\s+/g, '');
}

function searchAcronym(value = '') {
  return normalizeCatalogSearchText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('');
}

function editDistance(left = '', right = '') {
  const a = String(left);
  const b = String(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      previous[column] = a[row - 1] === b[column - 1]
        ? diagonal
        : 1 + Math.min(diagonal, above, previous[column - 1]);
      diagonal = above;
    }
  }

  return previous[b.length];
}

function isCloseSearchToken(left = '', right = '') {
  const a = compactSearchText(left);
  const b = compactSearchText(right);
  if (a.length < 4 || b.length < 4) return false;

  const longest = Math.max(a.length, b.length);
  const tolerance = longest >= 8 ? 2 : 1;
  if (Math.abs(a.length - b.length) > tolerance) return false;
  return editDistance(a, b) <= tolerance;
}

function textMatchRank(value = '', query = '', { allowFuzzy = false } = {}) {
  const text = normalizeCatalogSearchText(value);
  const compact = compactSearchText(value);
  const words = text.split(/\s+/).filter(Boolean);
  const acronym = searchAcronym(value);
  const q = normalizeCatalogSearchText(query);
  const qCompact = compactSearchText(query);

  if (!q || !qCompact) return null;
  if (text.startsWith(q) || compact.startsWith(qCompact)) return 0;
  if (words.some((word) => word.startsWith(q)) || acronym.startsWith(qCompact)) return 1;
  if (text.includes(q) || compact.includes(qCompact)) return 2;
  if (acronym.includes(qCompact)) return 3;
  if (allowFuzzy && (isCloseSearchToken(compact, qCompact) || words.some((word) => isCloseSearchToken(word, q)))) {
    return 4;
  }
  return null;
}

/**
 * Former storefront names and common shorthand customers still type.
 *
 * These aliases stay with search rather than the product data because they are
 * navigation language, not claims or customer-facing product names. Ingredient
 * aliases for named blends let a customer find the blend from a component they
 * already know without making the component the displayed product name.
 */
export function catalogSearchAliases(product = {}) {
  const name = normalizeCatalogSearchText(product?.product);
  const aliases = [];

  if (name.includes('amino acid blend')) {
    aliases.push('SUPER Human', 'SUPER Human Amino Blend');
  }
  if (name.includes('lipotropic blend')) {
    aliases.push('Fat Blaster', 'Fat Blaster Amino Blend');
  }
  if (/(^| )glp 1( |$)/.test(name)) {
    aliases.push('Retatrutide', 'Reta');
  }
  if (name.includes('melanotan ii')) {
    aliases.push('Melanotan 2', 'MT-II', 'MT2');
  }
  if (/(^| )tb 4( |$)/.test(name)) {
    aliases.push('TB-500', 'TB500');
  }
  if (/(^| )cjc( |$)/.test(name) && /(^| )ipa( |$)/.test(name)) {
    aliases.push('Ipamorelin');
  }
  if (/(^| )glow( |$)/.test(name)) {
    aliases.push('GHK-Cu', 'BPC-157', 'TB-500');
  }
  if (/(^| )klow( |$)/.test(name)) {
    aliases.push('KPV', 'GHK-Cu', 'BPC-157', 'TB-500');
  }

  return aliases;
}

export function catalogSearchMatchRank(product = {}, query = '') {
  const q = normalizeCatalogSearchText(query);
  if (!q) return 0;

  const nameRank = textMatchRank(product?.product, q, { allowFuzzy: true });
  if (nameRank !== null) return nameRank;

  const aliasRanks = catalogSearchAliases(product)
    .map((alias) => textMatchRank(alias, q, { allowFuzzy: true }))
    .filter((rank) => rank !== null);
  if (aliasRanks.length > 0) return 5 + Math.min(...aliasRanks);

  const categoryRank = textMatchRank(product?.category, q);
  if (categoryRank !== null) return 10 + categoryRank;

  const detailText = [
    product?.descriptionEn,
    product?.descriptionEs,
    product?.discount,
    product?.bulkDiscountEn,
    product?.bulkDiscountEs,
  ].filter(Boolean).join(' ');
  const detailRank = textMatchRank(detailText, q);
  if (detailRank !== null) return 20 + detailRank;

  return null;
}

export function productMatchesCatalogSearch(product = {}, query = '') {
  return catalogSearchMatchRank(product, query) !== null;
}

export function rankCatalogSearchResults(products = [], query = '', { limit } = {}) {
  const q = normalizeCatalogSearchText(query);
  if (!q) {
    return Number.isFinite(limit) ? products.slice(0, limit) : products;
  }

  const ranked = (products || [])
    .map((product, index) => ({ product, index, rank: catalogSearchMatchRank(product, q) }))
    .filter((item) => item.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.product);

  return Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
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
