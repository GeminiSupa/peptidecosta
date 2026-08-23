// public/master_sheet.csv is the catalog's emergency fallback.
//
// When Supabase cannot be reached, src/app/catalog/page.js parses this file
// instead of showing an empty shop. It went 13 days stale once while the org
// was over its egress quota and at risk of being throttled read-only — exactly
// when the fallback would have been needed — carrying 61 of 72 products and
// stale stock flags. These tests check the file the app actually ships.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Papa from 'papaparse';

const CSV = 'public/master_sheet.csv';

/** Parse exactly the way the catalog's CSV fallback does. */
function parseLikeCatalog() {
  const results = Papa.parse(fs.readFileSync(CSV, 'utf8'), { header: false, skipEmptyLines: true });
  const lines = results.data;
  const headerIndex = lines.findIndex((l) => l.some((cell) => cell && cell.toLowerCase().includes('product')));
  if (headerIndex === -1) return { headerIndex, headers: [], rows: [] };

  const headers = lines[headerIndex].map((h) => h.toLowerCase().trim());
  const rows = lines.slice(headerIndex + 1).filter((line) => line[0]).map((line) => {
    const p = {};
    headers.forEach((h, i) => {
      const key = h.replace(/\s+/g, '');
      if (key.includes('product')) p.product = line[i];
      else if (key.includes('category')) p.category = line[i];
      else if (key.includes('price')) p.priceUsd = line[i];
      else if (key.includes('status')) p.status = line[i];
      else if (key.includes('discount(en)')) p.bulkDiscountEn = line[i];
      else if (key.includes('discount(es)')) p.bulkDiscountEs = line[i];
      else if (key.includes('coa')) p.coa = line[i];
      else if (key.includes('image')) p.imageUrl = line[i];
    });
    return p;
  });
  return { headerIndex, headers, rows };
}

test('the fallback file exists and the catalog can find its header', () => {
  assert.ok(fs.existsSync(CSV), `${CSV} is the only thing standing between a Supabase outage and an empty shop`);
  const { headerIndex } = parseLikeCatalog();
  assert.notEqual(headerIndex, -1, 'no row containing "product" — the catalog would render nothing');
});

test('every row the catalog keeps has a name, a category and a status', () => {
  const { rows } = parseLikeCatalog();
  assert.ok(rows.length > 0, 'no product rows at all');

  for (const row of rows) {
    assert.ok(row.product && row.product.trim(), 'a row survived the name filter without a name');
    assert.ok(row.category && row.category.trim(), `${row.product} has no category, so it lands in no filter tab`);
    assert.ok(['In Stock', 'Out of Stock'].includes(String(row.status).trim()),
      `${row.product} has status "${row.status}" — the catalog only understands In Stock / Out of Stock`);
  }
});

test('prices parse to a number the catalog can convert to colones', () => {
  const { rows } = parseLikeCatalog();
  // BAC Water 2ml is deliberately "FREE with any purchase" rather than an amount.
  const priced = rows.filter((r) => !/^free\b/i.test(String(r.priceUsd || '').trim()));

  for (const row of priced) {
    const usd = parseFloat(String(row.priceUsd || '').replace(/[^0-9.]/g, ''));
    assert.ok(Number.isFinite(usd) && usd > 0,
      `${row.product} has price "${row.priceUsd}", which converts to ${usd} colones`);
  }
});

test('the image column is present and carries real urls', () => {
  const { headers, rows } = parseLikeCatalog();
  assert.ok(headers.some((h) => h.replace(/\s+/g, '').includes('image')),
    'without an image column every fallback product shows the same generic vial');

  const withImage = rows.filter((r) => r.imageUrl && r.imageUrl.trim());
  assert.ok(withImage.length > rows.length / 2, 'most products should carry an image url');
  for (const row of withImage) {
    assert.match(row.imageUrl, /^https:\/\//, `${row.product} has a non-https image url`);
  }
});

test('no duplicate products, which would show the same item twice', () => {
  const { rows } = parseLikeCatalog();
  const seen = new Set();
  for (const row of rows) {
    const name = String(row.product).trim().toLowerCase();
    assert.ok(!seen.has(name), `"${row.product}" appears more than once`);
    seen.add(name);
  }
});

test('the header row still names every column the parser looks for', () => {
  const { headers } = parseLikeCatalog();
  const flat = headers.map((h) => h.replace(/\s+/g, ''));
  // These are the keys src/app/catalog/page.js matches on. Renaming a column
  // in the spreadsheet silently drops that field for every fallback product.
  for (const key of ['product', 'category', 'price', 'status', 'coa']) {
    assert.ok(flat.some((h) => h.includes(key)), `no column matching "${key}"`);
  }
  assert.ok(flat.some((h) => h.includes('discount(es)')), 'the catalog reads the ES discount column first');
});
