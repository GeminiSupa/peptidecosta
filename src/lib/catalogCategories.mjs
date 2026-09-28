/**
 * Catalog categories, product compositions and the A–Z compound list.
 *
 * The category labels are compound classes, not what a compound is "for".
 * "Peptides For Weight Loss" is a therapeutic claim used as navigation; naming
 * the class instead is factual, still searchable, and removes the claim. The
 * slugs are the main site's, kept alongside for reference so the two stay
 * recognisably the same list.
 *
 * Categories live on each product row and are edited in the admin, so the old
 * names keep their translations here. A product still carrying an old category
 * must keep reading correctly until someone moves it — the rename happens in
 * the admin, one product at a time, while this code is already live.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

/** The category list, in the order it is offered. */
export const CATALOG_CATEGORIES = Object.freeze([
  { slug: 'peptides-for-weight-loss', en: 'Metabolic & GLP-1 Compounds', es: 'Compuestos metabólicos y GLP-1' },
  { slug: 'peptides-for-muscle-growth', en: 'Growth Hormone Secretagogues', es: 'Secretagogos de hormona de crecimiento' },
  { slug: 'peptides-for-healing', en: 'Tissue Repair Compounds', es: 'Compuestos de reparación de tejidos' },
  { slug: 'peptides-for-anti-aging', en: 'Bioregulator Peptides', es: 'Péptidos biorreguladores' },
  { slug: 'peptides-for-skin', en: 'Copper & Dermatological Peptides', es: 'Péptidos de cobre y dermatológicos' },
  { slug: 'peptides-for-energy', en: 'Mitochondrial Compounds', es: 'Compuestos mitocondriales' },
  { slug: 'peptide-for-cognitive-function', en: 'Nootropic & Neuropeptides', es: 'Nootrópicos y neuropéptidos' },
  { slug: 'peptides-for-fertility', en: 'Reproductive Signalling Peptides', es: 'Péptidos de señalización reproductiva' },
  { slug: 'peptides-for-sleep', en: 'Sleep-Related Neuropeptides', es: 'Neuropéptidos relacionados con el sueño' },
  { slug: 'peptide-for-cardiovascular-costa-rica', en: 'Cardiovascular Research Compounds', es: 'Compuestos de investigación cardiovascular' },
  { slug: 'hgh-human-growth-hormone', en: 'Somatropin & Related Compounds', es: 'Somatropina y compuestos relacionados' },
  { slug: 'copper-peptides', en: 'Copper Peptides', es: 'Péptidos de cobre' },
  { slug: 'collagen-peptides-costa-rica', en: 'Collagen Peptides', es: 'Péptidos de colágeno' },
  { slug: 'peptides-for-bac-water', en: 'Bacteriostatic Water', es: 'Agua bacteriostática' },
]);

/**
 * The categories products carried before the rename, with their Spanish.
 *
 * Not offered for new use, but still translated: a product nobody has moved yet
 * must not show its English label to a Spanish reader.
 */
export const LEGACY_CATEGORY_TRANSLATIONS = Object.freeze({
  'Weight Loss & Metabolism': 'Pérdida de peso y metabolismo',
  'Exercise Mimetic & Metabolic Modulator': 'Exercise Mimetic & Metabolic Modulator',
  'Recovery & Healing': 'Recuperación y curación',
  'Anti-Inflammatory': 'Antiinflamatorio',
  'Performance & Hormones': 'Rendimiento y hormonas',
  'Anti-Aging & Longevity': 'Antienvejecimiento y longevidad',
  'Immune System Modulation': 'Modulación del sistema inmunitario',
  'Cognitive & Mood': 'Cognitivo y estado de ánimo',
  'Sleep': 'Dormir',
  'Sexual Health': 'Salud sexual',
  'Tanning & Sexual Function': 'Bronceado y función sexual',
  'Skin & Hair': 'Piel y cabello',
  'Immune & Antioxidant': 'Sistema inmunitario y antioxidante',
  'Reconstitution Supply': 'Suministro de reconstitución',
});

/** English label -> Spanish label, for every category, new and old. */
export const CATEGORY_TRANSLATIONS = Object.freeze({
  ...LEGACY_CATEGORY_TRANSLATIONS,
  ...Object.fromEntries(CATALOG_CATEGORIES.map((c) => [c.en, c.es])),
});

/** The new category names, in order — what the admin dropdown offers first. */
export const CATALOG_CATEGORY_NAMES = Object.freeze(CATALOG_CATEGORIES.map((c) => c.en));

/**
 * A category as a reader in this language should see it.
 *
 * A custom category written "English / Español" is split on the slash, which is
 * how the admin has always let a new category carry both languages.
 */
export function translateCategoryLabel(category, lang = 'es') {
  const text = String(category ?? '').trim();
  if (!text) return '';
  if (text.includes('/')) {
    const parts = text.split('/').map((part) => part.trim());
    if (parts.length >= 2) return lang === 'en' ? parts[0] : parts[1];
  }
  if (lang === 'es' && CATEGORY_TRANSLATIONS[text]) return CATEGORY_TRANSLATIONS[text];
  return text;
}

/**
 * The metabolic category, under either its old or its new name.
 *
 * The catalog pins it first in the filter chips because it is the largest
 * group. That has to keep working on both sides of the rename.
 */
export function isMetabolicCategory(category) {
  const n = String(category ?? '').toLowerCase();
  return n.includes('metabolic & glp-1')
    || n.includes('metabólicos y glp-1')
    || n.includes('weight loss')
    || n.includes('perder peso')
    || n.includes('perdida de peso')
    || n.includes('pérdida de peso');
}

/**
 * What a blend or stack is made of.
 *
 * GLOW, KLOW and Wolverine Stack keep their names, so the composition is shown
 * beside them and the name is not left doing the identifying. The two liquid
 * blends are described by what they are. Matched on the name, so a size in the
 * name (GLOW 70mg) or a rename in the admin (SUPER Human -> Amino Acid Blend)
 * still finds its entry. KLOW is checked before GLOW is irrelevant here: the
 * word boundaries keep "klow" from matching "glow".
 */
const COMPOSITIONS = [
  { test: /\bklow\b/i, en: 'KPV + GHK-Cu + BPC-157 + TB-500', es: 'KPV + GHK-Cu + BPC-157 + TB-500' },
  { test: /\bglow\b/i, en: 'GHK-Cu + BPC-157 + TB-500', es: 'GHK-Cu + BPC-157 + TB-500' },
  { test: /wolverine/i, en: 'BPC-157 + TB-500', es: 'BPC-157 + TB-500' },
  { test: /amino acid blend|super human/i, en: 'Amino acid blend, 10 ml solution', es: 'Mezcla de aminoácidos, solución de 10 ml' },
  { test: /lipotropic|fat blaster/i, en: 'Lipotropic blend, 10 ml solution', es: 'Mezcla lipotrópica, solución de 10 ml' },
];

const GLP1_DISPLAY = {
  en: 'GLP-1 – Triple Agonist',
  es: 'GLP-1 – Agonista Triple',
};
const RETATRUTIDE_LEAD = {
  en: 'Research peptide with agonist activity at the GIP, GLP-1, and glucagon receptors.',
  es: 'Péptido de investigación con actividad agonista sobre los receptores GIP, GLP-1 y glucagón.',
};

function isGlp1(name) {
  return /^glp-1$/i.test(String(name ?? '').trim());
}

function glp1Display(lang) {
  return String(lang).toLowerCase().startsWith('en') ? GLP1_DISPLAY.en : GLP1_DISPLAY.es;
}

/** The name on the catalog card. Orders still use the stored name, GLP-1. */
export function catalogFacingCompound(compound, lang = 'es') {
  return isGlp1(compound) ? glp1Display(lang) : String(compound ?? '');
}

/** Full customer-facing name, size included: "GLP-1 – Triple Agonist 5mg". */
export function catalogFacingName(storedName, lang = 'es') {
  const { compound, size } = splitCompoundAndSize(storedName);
  if (!isGlp1(compound)) return String(storedName ?? '');
  const label = glp1Display(lang);
  return size ? `${label} ${size}` : label;
}

/** Puts the triple-agonist sentence in front of a GLP-1 description. */
export function withRetatrutideLead(storedName, description, lang = 'es') {
  const text = String(description ?? '').trim();
  if (!isGlp1(splitCompoundAndSize(storedName).compound)) return text;
  const lead = String(lang).toLowerCase().startsWith('en') ? RETATRUTIDE_LEAD.en : RETATRUTIDE_LEAD.es;
  if (!text) return lead;
  if (text.toLowerCase().startsWith(lead.toLowerCase())) return text;
  return `${lead} ${text}`;
}

/** The composition line for a product, or '' when it is a single compound. */
export function productComposition(name, lang = 'es') {
  const entry = COMPOSITIONS.find((c) => c.test.test(String(name ?? '')));
  if (!entry) return '';
  return lang === 'en' ? entry.en : entry.es;
}

/** Blends and stacks, listed apart from single compounds in the A–Z view. */
export function isBlendOrStack(name) {
  return Boolean(productComposition(name, 'en'));
}

const SIZE_PATTERN = /(\d[\d,.]*\s*(?:mg|mcg|ml|iu))\b/i;

/**
 * A product name split into the compound and its vial size.
 *
 * "GLP-1 12mg" -> { compound: "GLP-1", size: "12mg" }. Only the first size is
 * taken, so "HGH 50 IU (Pfizer Genotropin)" keeps its brand note with the name.
 */
export function splitCompoundAndSize(name) {
  const text = String(name ?? '').trim();
  const match = text.match(SIZE_PATTERN);
  if (!match) return { compound: text, size: '' };
  const compound = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\s+/g, ' ')
    .replace(/\(\s*\)/g, '')
    .trim();
  return { compound: compound || text, size: match[1].replace(/\s+/g, ' ').trim() };
}

function sizeSortValue(size) {
  return parseFloat(String(size).replace(/,/g, '')) || 0;
}

/**
 * One catalog card per compound, in the order the first size appeared.
 *
 * Sizes inside the card run smallest first. `lead` is that first size, so a
 * card promoted because one vial is on sale can open on that vial.
 */
function sizesMatch(a, b) {
  return String(a || '').replace(/\s+/g, '').toLowerCase() === String(b || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * The compound and the chip size for one product.
 *
 * A vial size typed in its own field wins. When that field is empty, the size
 * is still read out of the name, so "AHK-CU 50mg" keeps working.
 */
export function catalogCompoundAndSize(product) {
  const name = String(product?.product ?? '').trim();
  const explicit = String(product?.vialSize ?? product?.vial_size ?? '').trim();
  if (!explicit) return splitCompoundAndSize(name);
  const parsed = splitCompoundAndSize(name);
  if (parsed.size) return { compound: parsed.compound, size: explicit };
  return { compound: name, size: explicit };
}

/**
 * The name stored on the product row.
 *
 * The cart, orders and stock still match the full name ("AHK-CU 50mg"). The
 * size field is joined on when it is not already written in the name.
 */
export function composeStoredProductName(name, vialSize) {
  const raw = String(name ?? '').trim().replace(/\s+/g, ' ');
  const size = String(vialSize ?? '').trim().replace(/\s+/g, ' ');
  if (!size) return raw;
  const parsed = splitCompoundAndSize(raw);
  if (parsed.size && sizesMatch(parsed.size, size)) return `${parsed.compound} ${parsed.size}`.trim();
  if (parsed.size) return `${parsed.compound} ${size}`.trim();
  return `${raw} ${size}`.trim();
}

/** What the product grid shows when a size has been saved in its own field. */
export function splitStoredProductForAdmin(storedName, vialSize) {
  const size = String(vialSize ?? '').trim();
  const name = String(storedName ?? '');
  if (!size) return { product: name, vialSize: '' };
  const parsed = splitCompoundAndSize(name);
  if (parsed.size && sizesMatch(parsed.size, size)) return { product: parsed.compound, vialSize: size };
  return { product: name, vialSize: size };
}

export function groupCatalogCards(products = []) {
  const groups = new Map();
  const order = [];
  for (const product of products || []) {
    const name = product?.product;
    if (!name) continue;
    const { compound, size } = catalogCompoundAndSize(product);
    const key = compound.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { key, compound, lead: name, items: [] };
      groups.set(key, group);
      order.push(group);
    }
    group.items.push({ product, size, sizeValue: sizeSortValue(size) });
  }
  for (const group of order) {
    group.items.sort((a, b) => a.sizeValue - b.sizeValue
      || String(a.product.product).localeCompare(String(b.product.product)));
  }
  return order;
}

/** How many sizes stay as chips. The rest go in the size dropdown. */
const SIZE_CHIP_LIMIT = 4;

/**
 * The first four sizes stay as chips. Anything past that is listed in the
 * dropdown, so a compound with many strengths does not fill the card.
 */
export function visibleSizeChips(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= SIZE_CHIP_LIMIT) {
    return { visible: list, overflow: [], hiddenCount: 0 };
  }
  const visible = list.slice(0, SIZE_CHIP_LIMIT);
  const overflow = list.slice(SIZE_CHIP_LIMIT);
  return { visible, overflow, hiddenCount: overflow.length };
}

/** The jump-bar letter a compound files under; digits share '#'. */
export function azLetter(compound) {
  const first = String(compound ?? '').trim().charAt(0).toUpperCase();
  if (/[A-Z]/.test(first)) return first;
  return '#';
}

/**
 * The A–Z view's rows, grouped by letter.
 *
 * Single compounds only: blends and stacks are listed separately so their
 * composition is clear, and BAC water is a supply, not a compound. Within a
 * compound the sizes run smallest first, so "GLP-1 5mg" precedes "GLP-1 12mg"
 * rather than following it alphabetically.
 *
 * @param {Array<{product: string}>} products already filtered to what may be listed
 * @param {(name: string) => boolean} [isSupply] excludes supplies such as BAC water
 * @returns {{groups: Array<{letter: string, rows: Array}>, blends: Array}}
 */
export function buildAzList(products = [], isSupply = () => false) {
  const singles = [];
  const blends = [];
  for (const product of products || []) {
    const name = product?.product;
    if (!name || isSupply(name)) continue;
    const { compound, size } = catalogCompoundAndSize(product);
    const row = { product, compound, size, sizeValue: parseFloat(String(size).replace(/,/g, '')) || 0 };
    (isBlendOrStack(name) ? blends : singles).push(row);
  }

  const byName = (a, b) => a.compound.localeCompare(b.compound, 'en', { sensitivity: 'base', numeric: true })
    || a.sizeValue - b.sizeValue;
  singles.sort(byName);
  blends.sort(byName);

  const groups = [];
  for (const row of singles) {
    const letter = azLetter(row.compound);
    let group = groups[groups.length - 1];
    if (!group || group.letter !== letter) {
      group = { letter, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return { groups, blends };
}
