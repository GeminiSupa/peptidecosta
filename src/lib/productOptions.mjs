export function sortProductsAlphabetically(products = []) {
  return [...products].sort((left, right) => String(left?.product || '').localeCompare(
    String(right?.product || ''),
    undefined,
    { sensitivity: 'base', numeric: true }
  ));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "50mg", "10ml", "30 IU". Anything else is returned trimmed. */
function normalizeVialSize(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(mg|ml|iu)$/i);
  if (!match) return text;
  const unit = match[2].toLowerCase() === 'iu' ? ' IU' : match[2].toLowerCase();
  return `${match[1]}${unit}`;
}

function trailingVialSize(name) {
  const match = String(name || '').trim().match(/(\d+(?:\.\d+)?)\s*(mg|ml|iu)\s*$/i);
  if (!match) return '';
  return normalizeVialSize(`${match[1]} ${match[2]}`);
}

/**
 * The vial size for a catalog row. The products table keeps this in its own
 * column now; older rows only have it on the end of the name.
 */
export function vialSizeOf(product) {
  const stored = String(product?.vialSize ?? product?.vial_size ?? '').trim();
  if (stored) return normalizeVialSize(stored);
  return trailingVialSize(product?.product);
}

/**
 * The peptide name without the trailing size, so a picker can show
 * "AHK-CU" beside a "50mg" chip instead of burying the size in the name.
 * The stored product name is left alone — this is display only.
 */
function sizeAtEndPattern(size) {
  const match = String(size).match(/^(\d+(?:\.\d+)?)\s*(mg|ml|iu)$/i);
  if (!match) return escapeRegExp(size);
  // The size has to be its own number. Otherwise "5mg" matches the end of "15mg"
  // and the name is left as "GLP-1 1".
  return `(?<!\\d)${match[1]}\\s*${match[2]}`;
}

export function productPickerName(product) {
  const name = String(product?.product || '').trim();
  const size = vialSizeOf(product);
  if (!name || !size) return name;
  // "50IU" and "50 IU" are the same size. The chip shows it, so it must come
  // off the end of the name even when the spacing does not match.
  const stripped = name.replace(new RegExp(`\\s*${sizeAtEndPattern(size)}\\s*$`, 'i'), '').trim();
  return stripped || name;
}
