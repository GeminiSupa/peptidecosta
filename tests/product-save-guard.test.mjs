import test from 'node:test';
import assert from 'node:assert/strict';
import { isoToCrWall } from '../src/lib/crTime.mjs';
import {
  productToDbRow,
  productFingerprint,
  productBaseline,
  planBulkSave,
  checkSingleSave,
  isExistingProductId,
} from '../src/lib/productSaveGuard.mjs';

// A database row the way Postgres returns it.
const dbRow = (over = {}) => ({
  id: 'a1',
  product: 'GLP-1 5mg',
  category: 'Metabolic & GLP-1 Compounds',
  price_usd: '$100',
  price_crc: '₡44,787',
  original_price_usd: null,
  original_price_crc: null,
  discount: null,
  sale_start_time: '2026-09-10T18:30:45.123+00:00',
  sale_end_time: null,
  status: 'In Stock',
  inventory_count: 89,
  low_stock_threshold: null,
  coa: '',
  image_url: 'https://example.com/a.png',
  description_en: 'Text',
  description_es: 'Texto',
  emoji: '',
  priority: 0,
  created_at: '2026-08-01T00:00:00+00:00',
  free_bac_water: null,
  free_bac_size_ml: 3,
  free_bac_vials_per_item: 1,
  ...over,
});

// The same mapping the admin page applies when it loads products.
const toGridRow = (item) => ({
  id: item.id,
  product: item.product || '',
  category: item.category || '',
  priceUsd: item.price_usd || '',
  priceCrc: item.price_crc || '',
  originalPriceUsd: String(item.original_price_usd || '').trim(),
  originalPriceCrc: String(item.original_price_crc || '').trim(),
  discount: item.discount || '',
  saleStartTime: isoToCrWall(item.sale_start_time),
  saleEndTime: isoToCrWall(item.sale_end_time),
  status: item.status || 'In Stock',
  coa: item.coa || '',
  imageUrl: item.image_url || '',
  descriptionEn: item.description_en || '',
  descriptionEs: item.description_es || '',
  inventoryCount: item.inventory_count !== undefined ? item.inventory_count : null,
  lowStockThreshold: item.low_stock_threshold !== undefined ? item.low_stock_threshold : 5,
  priority: item.priority || 0,
  freeBacWater: typeof item.free_bac_water === 'boolean' ? item.free_bac_water : true,
  freeBacSizeMl: item.free_bac_size_ml != null ? item.free_bac_size_ml : 3,
  freeBacVialsPerItem: item.free_bac_vials_per_item || 1,
});

const roundTrip = (row, priority = 0) => productToDbRow(toGridRow(row), priority);

test('an untouched row reads the same after a trip through the grid', () => {
  // Seconds on the sale time, +00:00 vs Z, a null free-water flag and a null
  // low-stock threshold all change spelling on the way through — none is an edit.
  const row = dbRow();
  assert.equal(productFingerprint(roundTrip(row)), productFingerprint(row));
});

test('CRC prices and priority are not edits', () => {
  const row = dbRow();
  assert.equal(productFingerprint({ ...row, price_crc: '₡45,000', priority: 9 }), productFingerprint(row));
  assert.notEqual(productFingerprint({ ...row, price_usd: '$110' }), productFingerprint(row));
});

test('nobody else changed anything: every row is written', () => {
  const rows = [dbRow({ id: 'a1' }), dbRow({ id: 'b2', product: 'BPC-157 10mg' })];
  const baseline = productBaseline(rows);
  const submitted = [{ ...roundTrip(rows[0], 0), price_usd: '$120' }, roundTrip(rows[1], 1)];
  const plan = planBulkSave({ submittedRows: submitted, currentRows: rows, loadedIds: Object.keys(baseline), baseline });
  assert.equal(plan.refused, false);
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.toUpdate.length, 2);
  assert.deepEqual(plan.toDelete, []);
});

test('a product added elsewhere after this tab loaded is never deleted', () => {
  const loaded = [dbRow({ id: 'a1' })];
  const baseline = productBaseline(loaded);
  const current = [...loaded, dbRow({ id: 'new', product: 'Teammate Product 10mg' })];
  const plan = planBulkSave({ submittedRows: [roundTrip(loaded[0])], currentRows: current, loadedIds: ['a1'], baseline });
  assert.deepEqual(plan.toDelete, []);
  assert.deepEqual(plan.conflicts, []);
});

test('a product removed in this tab is deleted', () => {
  const loaded = [dbRow({ id: 'a1' }), dbRow({ id: 'b2', product: 'BPC-157 10mg' })];
  const baseline = productBaseline(loaded);
  const plan = planBulkSave({ submittedRows: [roundTrip(loaded[0])], currentRows: loaded, loadedIds: ['a1', 'b2'], baseline });
  assert.deepEqual(plan.toDelete, ['b2']);
});

test('a teammate edit to a row this tab did not touch is kept, not overwritten', () => {
  const loaded = [dbRow({ id: 'a1' }), dbRow({ id: 'b2', product: 'BPC-157 10mg' })];
  const baseline = productBaseline(loaded);
  const current = [loaded[0], { ...loaded[1], price_usd: '$55' }];
  const submitted = [{ ...roundTrip(loaded[0]), price_usd: '$120' }, roundTrip(loaded[1], 1)];
  const plan = planBulkSave({ submittedRows: submitted, currentRows: current, loadedIds: ['a1', 'b2'], baseline });
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.skipped, ['BPC-157 10mg']);
  assert.deepEqual(plan.toUpdate.map((r) => r.id), ['a1']);
});

test('both sides editing the same product refuses the save and names it', () => {
  const loaded = [dbRow({ id: 'a1' })];
  const baseline = productBaseline(loaded);
  const current = [{ ...loaded[0], status: 'Out of Stock' }];
  const submitted = [{ ...roundTrip(loaded[0]), price_usd: '$120' }];
  const plan = planBulkSave({ submittedRows: submitted, currentRows: current, loadedIds: ['a1'], baseline });
  assert.deepEqual(plan.conflicts, ['GLP-1 5mg']);
});

test('removing a product someone else just edited is refused', () => {
  const loaded = [dbRow({ id: 'a1' })];
  const baseline = productBaseline(loaded);
  const plan = planBulkSave({ submittedRows: [], currentRows: [{ ...loaded[0], price_usd: '$99' }], loadedIds: ['a1'], baseline });
  assert.deepEqual(plan.conflicts, ['GLP-1 5mg']);
  assert.deepEqual(plan.toDelete, []);
});

test('an untouched row deleted elsewhere is not brought back', () => {
  const loaded = [dbRow({ id: 'a1' })];
  const baseline = productBaseline(loaded);
  const plan = planBulkSave({ submittedRows: [roundTrip(loaded[0])], currentRows: [], loadedIds: ['a1'], baseline });
  assert.deepEqual(plan.toUpdate, []);
  assert.deepEqual(plan.skipped, ['GLP-1 5mg']);
});

test('new grid rows are inserted', () => {
  const plan = planBulkSave({
    submittedRows: [productToDbRow({ id: 'temp-1', product: 'New Peptide Name', priceUsd: '$100' }, 0)],
    currentRows: [],
    loadedIds: [],
    baseline: {},
  });
  assert.equal(plan.toInsert.length, 1);
  assert.equal(isExistingProductId('temp-1'), false);
});

test('a page loaded before this protection existed cannot save', () => {
  const plan = planBulkSave({ submittedRows: [roundTrip(dbRow())], currentRows: [dbRow()] });
  assert.equal(plan.refused, true);
});

test('a single save goes through only if the product is as the tab loaded it', () => {
  const row = dbRow();
  const loaded = productFingerprint(row);
  assert.deepEqual(checkSingleSave({ currentRow: row, baselineFingerprint: loaded }), { ok: true });
  assert.deepEqual(checkSingleSave({ currentRow: { ...row, price_crc: '₡1' }, baselineFingerprint: loaded }), { ok: true });
  assert.equal(checkSingleSave({ currentRow: { ...row, status: 'Out of Stock' }, baselineFingerprint: loaded }).reason, 'changed');
  assert.equal(checkSingleSave({ currentRow: null, baselineFingerprint: loaded }).reason, 'deleted');
  assert.equal(checkSingleSave({ currentRow: row }).reason, 'no_baseline');
});
