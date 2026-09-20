/**
 * Keeping a Products save from destroying work the saving tab never saw.
 *
 * The Products grid used to send every row on every save, and the server
 * deleted any product missing from that list and overwrote the rest. So a tab
 * left open since the morning, saving one price at noon, deleted the product a
 * teammate had added in between and put its own older copy back over every row
 * they had edited. The drawer's "Save product" button went through the same
 * path, so saving one product also saved every other unsaved edit in the grid.
 *
 * The products table has no updated_at column to compare, so each tab keeps a
 * fingerprint of every row as it was loaded. A save compares three things per
 * row — what the tab loaded, what it is sending, what the database holds now —
 * and only writes where that is safe:
 *
 *   nobody else changed it           -> write it (the tab's copy is current)
 *   someone else changed it, I didn't -> skip it (keep their newer version)
 *   both of us changed it             -> refuse the whole save, name the product
 *
 * Deletion follows the same rule: only a product this tab loaded and then
 * removed is deleted, never one it simply did not know about.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

import { crWallToIso } from './crTime.mjs';
import { defaultFreeBacConfig } from './bacWater.mjs';

/** A row that exists in the database, as opposed to one added in the grid. */
export function isExistingProductId(id) {
  const value = String(id || '');
  return Boolean(value) && !value.startsWith('temp-') && !value.startsWith('local-');
}

export function emojiForCategory(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('weight') || c.includes('peso') || c.includes('metabolic') || c.includes('metabólic')) return '⚖️';
  if (c.includes('sleep') || c.includes('sueño')) return '🌙';
  if (c.includes('sexual') || c.includes('reproductive') || c.includes('reproductiv')) return '🔥';
  if (c.includes('skin') || c.includes('piel') || c.includes('dermatolog')) return '✨';
  if (c.includes('immune') || c.includes('inmune')) return '🛡️';
  if (c.includes('supply') || c.includes('suministro') || c.includes('bacteriostatic') || c.includes('bacteriostática')) return '💧';
  if (c.includes('brain') || c.includes('cerebro') || c.includes('nootropic') || c.includes('neuro')) return '🧠';
  if (c.includes('muscle') || c.includes('músculo') || c.includes('secretagog')) return '💪';
  return '🧪';
}

/** A grid row (camelCase) as the database row (snake_case) it is saved as. */
export function productToDbRow(product, priority) {
  const row = {
    product: product.product,
    category: product.category,
    price_usd: product.priceUsd,
    price_crc: product.priceCrc,
    original_price_usd: String(product.originalPriceUsd || '').trim() || null,
    original_price_crc: String(product.originalPriceCrc || '').trim() || null,
    discount: product.discount || null,
    sale_start_time: crWallToIso(product.saleStartTime),
    sale_end_time: crWallToIso(product.saleEndTime),
    status: product.status,
    inventory_count: product.inventoryCount === '' ? null : product.inventoryCount,
    low_stock_threshold: product.lowStockThreshold === '' ? 5 : product.lowStockThreshold,
    coa: product.coa,
    image_url: product.imageUrl,
    description_en: product.descriptionEn || '',
    description_es: product.descriptionEs || '',
    emoji: product.imageUrl ? '' : emojiForCategory(product.category),
    priority,
    free_bac_water: typeof product.freeBacWater === 'boolean' ? product.freeBacWater : null,
    free_bac_size_ml: Number(product.freeBacSizeMl) === 10 ? 10 : 3,
    free_bac_vials_per_item: Number.isFinite(Number(product.freeBacVialsPerItem)) && Number(product.freeBacVialsPerItem) > 0
      ? Math.floor(Number(product.freeBacVialsPerItem))
      : 1,
    cost_usd: product.costUsd === '' || product.costUsd === null ? 0 : (Number(product.costUsd) || 0),
    supplier_name: String(product.supplierName || '').trim() || null,
    supplier_lead_time_days: Number.isFinite(Number(product.supplierLeadTimeDays)) && Number(product.supplierLeadTimeDays) > 0
      ? Math.floor(Number(product.supplierLeadTimeDays))
      : 14,
    batch_number: String(product.batchNumber || '').trim() || null,
    batch_expiry_date: product.batchExpiryDate ? crWallToIso(product.batchExpiryDate) : null,
  };

  if (isExistingProductId(product.id)) row.id = product.id;
  return row;
}

/**
 * The fields a person edits. Left out on purpose:
 *   priority            a reorder is not a content change worth refusing over
 *   price_crc columns   re-derived from USD at today's rate on every save, so
 *                       they move without anyone touching them
 *   emoji, created_at   derived or fixed
 */
const FINGERPRINT_FIELDS = Object.freeze([
  'product',
  'category',
  'price_usd',
  'original_price_usd',
  'discount',
  'sale_start_time',
  'sale_end_time',
  'status',
  'inventory_count',
  'low_stock_threshold',
  'coa',
  'image_url',
  'description_en',
  'description_es',
  'free_bac_water',
  'free_bac_size_ml',
  'free_bac_vials_per_item',
  'cost_usd',
  'supplier_name',
  'supplier_lead_time_days',
  'batch_number',
  'batch_expiry_date',
]);

const blank = (value) => value === null || value === undefined || value === '';

/**
 * One field, reduced to what it means rather than how it happens to be written.
 *
 * The same row reaches here two ways — straight from the database, and after a
 * round trip through the grid — and the two spellings differ without anyone
 * editing anything: "+00:00" vs "Z" and seconds vs minutes on the sale times, a
 * null free-water flag the grid fills from the name rule, "" vs null. Each of
 * those would read as a conflicting edit and refuse saves nobody raced on.
 */
function normalizeField(field, value, row) {
  switch (field) {
    case 'sale_start_time':
    case 'sale_end_time': {
      if (blank(value)) return null;
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) ? Math.floor(timestamp / 60000) : String(value);
    }
    case 'free_bac_water':
      return typeof value === 'boolean' ? value : defaultFreeBacConfig(row?.product).freeBacWater;
    case 'free_bac_size_ml':
      return Number(value) === 10 ? 10 : 3;
    case 'free_bac_vials_per_item': {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    }
    case 'low_stock_threshold': {
      if (blank(value)) return 5;
      const n = Number(value);
      return Number.isFinite(n) ? n : String(value).trim();
    }
    case 'inventory_count': {
      if (blank(value)) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : String(value).trim();
    }
    case 'status':
      return String(value ?? '').trim() || 'In Stock';
    default: {
      const text = String(value ?? '').trim();
      return text === '' ? null : text;
    }
  }
}

/** A database-shaped row as a comparable string. */
export function productFingerprint(row) {
  return JSON.stringify(FINGERPRINT_FIELDS.map((field) => normalizeField(field, row?.[field], row)));
}

/** Fingerprints for a set of database rows, keyed by id — what a tab keeps. */
export function productBaseline(rows = []) {
  return Object.fromEntries((rows || []).filter((row) => row?.id).map((row) => [String(row.id), productFingerprint(row)]));
}

const unique = (list) => [...new Set(list.filter(Boolean))];

/**
 * What a bulk save may do.
 *
 * @param {object} input
 * @param {object[]} input.submittedRows database-shaped rows the tab is sending
 * @param {object[]} input.currentRows   every product row in the database now
 * @param {string[]} input.loadedIds     ids the tab loaded
 * @param {object}   input.baseline      id -> fingerprint, as the tab loaded them
 * @returns {{refused: boolean, conflicts: string[], skipped: string[], toDelete: string[], toUpdate: object[], toInsert: object[]}}
 *          refused: the tab sent no baseline (a page loaded before this
 *          existed), so nothing it sends can be trusted not to overwrite.
 */
export function planBulkSave({ submittedRows = [], currentRows = [], loadedIds, baseline } = {}) {
  const empty = { refused: false, conflicts: [], skipped: [], toDelete: [], toUpdate: [], toInsert: [] };
  if (!Array.isArray(loadedIds) || !baseline || typeof baseline !== 'object') {
    return { ...empty, refused: true };
  }

  const current = new Map((currentRows || []).map((row) => [String(row.id), row]));
  const submittedIds = new Set((submittedRows || []).filter((row) => row?.id).map((row) => String(row.id)));
  const conflicts = [];
  const skipped = [];
  const toDelete = [];
  const toUpdate = [];
  const toInsert = [];

  // Removed in this tab. Deleted only if nobody else has touched it since.
  for (const id of loadedIds.map(String)) {
    if (submittedIds.has(id)) continue;
    const existing = current.get(id);
    if (!existing) continue; // already gone
    if (productFingerprint(existing) !== baseline[id]) conflicts.push(existing.product || id);
    else toDelete.push(id);
  }

  for (const row of submittedRows || []) {
    if (!row?.id) {
      toInsert.push(row);
      continue;
    }
    const id = String(row.id);
    const loaded = baseline[id];
    const existing = current.get(id);

    // An id this tab never loaded: there is nothing to compare against, so no
    // way to tell whether sending it would overwrite someone.
    if (loaded === undefined) {
      conflicts.push(row.product || id);
      continue;
    }

    const changedHere = productFingerprint(row) !== loaded;
    const changedElsewhere = !existing || productFingerprint(existing) !== loaded;

    if (!changedElsewhere) toUpdate.push(row);
    else if (!changedHere) skipped.push(existing?.product || row.product || id); // theirs is newer; a deleted row stays deleted
    else conflicts.push(row.product || id);
  }

  return {
    refused: false,
    conflicts: unique(conflicts),
    skipped: unique(skipped),
    toDelete,
    toUpdate,
    toInsert,
  };
}

/**
 * Whether one product may be saved on its own.
 *
 * @returns {{ok: true} | {ok: false, reason: 'deleted' | 'changed' | 'no_baseline'}}
 */
export function checkSingleSave({ currentRow, baselineFingerprint } = {}) {
  if (!currentRow) return { ok: false, reason: 'deleted' };
  if (!baselineFingerprint) return { ok: false, reason: 'no_baseline' };
  if (productFingerprint(currentRow) !== baselineFingerprint) return { ok: false, reason: 'changed' };
  return { ok: true };
}
