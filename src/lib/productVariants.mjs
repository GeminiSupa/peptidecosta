/**
 * Grouping the shelf by peptide instead of by vial size.
 *
 * The catalog listed every size as its own product, so "GLP-1" filled ten
 * cards and a shopper had to compare ten near-identical tiles before choosing
 * anything. This groups those cards into one per peptide with a dose picker.
 *
 * It is a DISPLAY grouping only. Nothing here renames a product, and the cart
 * still holds the exact row the customer picked ("GLP-1 20mg"), which is what
 * the server prices against. Two products are only ever grouped when their
 * names are identical apart from a trailing dose.
 */

const DOSE_PATTERN = /^(.*\S)\s+([\d]+(?:[.,]\d+)?)\s*(mg|ml|iu|mcg|g)$/i;

/** Units that read better with a space: "30 IU", but "30mg". */
const SPACED_UNITS = new Set(['iu']);

/**
 * Split "GLP-1 20mg" into its peptide and its dose.
 *
 * Returns null when the name does not END with a plain dose, which is what
 * keeps one-off products out of the grouping: "HGH 50 IU (Pfizer Genotropin)",
 * "BPC-157 + TB-500 20mg (Wolverine Stack)" and "AHK-Cu" all stay on their own
 * cards, because a trailing qualifier means it is not simply another size.
 */
export function parseVariant(name) {
  const text = String(name || '').trim();
  if (!text) return null;

  const match = DOSE_PATTERN.exec(text);
  if (!match) return null;

  const [, base, rawAmount, rawUnit] = match;
  const unit = rawUnit.toLowerCase();
  const amount = Number(String(rawAmount).replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const displayUnit = unit === 'iu' ? 'IU' : unit;
  return {
    base: base.trim(),
    amount,
    unit,
    // What the dose chip reads: "20mg", "10ml", "30 IU".
    label: SPACED_UNITS.has(unit) ? `${rawAmount} ${displayUnit}` : `${rawAmount}${displayUnit}`,
  };
}

/** Same peptide, same category, same unit — case-insensitively. */
function groupKeyFor(product, variant) {
  return [
    String(variant.base).toLowerCase(),
    String(product.category || '').toLowerCase(),
    variant.unit,
  ].join('|');
}

/**
 * Turn a list of products into the rows the grid should draw.
 *
 * Order is preserved: a group appears where its first member appeared, so
 * whatever sort the shopper chose still decides the running order.
 *
 * Every entry has the same shape whether or not it grouped anything, so the
 * card only has one thing to render. A single product is a group of one.
 *
 * @param {Array<object>} products  rows as the catalog holds them
 * @param {(product: object) => boolean} [isExcluded]  products that must never
 *   group — bacteriostatic water is priced by its own rules, so its sizes are
 *   not interchangeable the way a peptide's are.
 */
export function groupCatalogProducts(products, isExcluded) {
  const list = Array.isArray(products) ? products : [];
  const rows = [];
  const byKey = new Map();

  for (const product of list) {
    const variant = isExcluded && isExcluded(product) ? null : parseVariant(product?.product);
    if (!variant) {
      rows.push({ key: `single:${product?.product}`, base: product?.product, members: [product], variants: [null] });
      continue;
    }

    const key = groupKeyFor(product, variant);
    const existing = byKey.get(key);
    if (existing) {
      existing.members.push(product);
      existing.variants.push(variant);
      continue;
    }

    const row = { key, base: variant.base, members: [product], variants: [variant] };
    byKey.set(key, row);
    rows.push(row);
  }

  // Doses read smallest first whatever order the grid delivered them in. A row
  // that ended up with one member is presented as an ungrouped product, so the
  // card shows its full name rather than a peptide with a single chip.
  return rows.map((row) => {
    if (row.members.length < 2) {
      return { key: row.key, base: row.members[0]?.product, grouped: false, doses: [{ product: row.members[0], label: null }] };
    }
    const doses = row.members
      .map((product, index) => ({ product, label: row.variants[index].label, amount: row.variants[index].amount }))
      .sort((a, b) => a.amount - b.amount);
    return { key: row.key, base: row.base, grouped: true, doses };
  });
}

/**
 * Which dose a grouped card opens on: the cheapest one a customer can actually
 * buy. Opening on a sold-out size would show a dead Add to cart button on a
 * product that is in stock in four other sizes.
 */
export function defaultDoseIndex(doses, isInStock) {
  if (!Array.isArray(doses) || !doses.length) return 0;
  const available = doses.findIndex((dose) => isInStock(dose.product));
  return available >= 0 ? available : 0;
}
