import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = await readFile(
  new URL('../src/app/catalog/page.js', import.meta.url),
  'utf8',
);
const styles = await readFile(
  new URL('../src/app/globals.css', import.meta.url),
  'utf8',
);

test('autocomplete previews the same filtered products as the catalog grid', () => {
  assert.match(catalog, /const baseFilteredProducts = products\.filter\(matchesActiveCatalogFilters\)/);
  assert.match(catalog, /const searchSuggestions = filteredProducts\.slice/);
  assert.match(catalog, /rankCatalogSearchResults\(baseFilteredProducts, searchQuery\)/);
});

test('Enter submits to the visible results and arrow keys select suggestions', () => {
  assert.match(catalog, /onKeyDown=\{handleSearchKeyDown\}/);
  assert.match(catalog, /event\.key === 'ArrowDown'/);
  assert.match(catalog, /event\.key === 'ArrowUp'/);
  assert.match(catalog, /event\.key === 'Enter'[\s\S]{0,400}revealSearchResults\(\)/);
  assert.match(catalog, /resultsRef\.current\?\.scrollIntoView/);
});

test('search exposes result count, clear action, and combobox semantics', () => {
  assert.match(catalog, /role="combobox"/);
  assert.match(catalog, /role="listbox"/);
  assert.match(catalog, /role="option"/);
  assert.match(catalog, /className="search-clear-btn"/);
  assert.match(catalog, /className="catalog-result-summary"/);
});

test('stock is not silently restricted on first load', () => {
  assert.match(catalog, /const \[inStockOnly, setInStockOnly\] = useState\(false\)/);
});

test('filters include the same category selection as the horizontal scroller', () => {
  assert.match(catalog, /id="catalogCategoryFilter"/);
  assert.match(catalog, /value=\{activeCategory\}[\s\S]{0,120}setActiveCategory\(e\.target\.value\)/);
  assert.match(catalog, /categoriesList\.map\(\(cat\) => \(/);
});

test('WhatsApp stays available but becomes a corner action during search', () => {
  assert.match(catalog, /catalog-search-open/);
  assert.match(catalog, /catalog-page-shell\.catalog-search-open \.cart-container-wrapper:not\(\.has-items\)/);
  assert.match(catalog, /className="catalog-whatsapp-sticky-label"/);
  assert.match(styles, /catalog-page-shell\.catalog-search-open \.header-sticky-section[\s\S]{0,100}z-index: 10000/);
});
