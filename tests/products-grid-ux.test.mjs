/**
 * The product grid is where the catalog is edited, and both behaviours pinned
 * here are ones that fail quietly rather than loudly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const grid = await readFile(
  new URL('../src/components/admin/ProductsManager.js', import.meta.url),
  'utf8',
);
const admin = await readFile(
  new URL('../src/app/admin/page.js', import.meta.url),
  'utf8',
);

test('clicking a row opens the description editor', () => {
  // Edit Info sat ten columns to the right, past a horizontal scrollbar, which
  // is a long way to travel for the thing most people open the grid to change.
  assert.match(grid, /onClick=\{\(e\) => \{[\s\S]{0,400}setEditDescModalOpen\(true\)/);
  assert.match(grid, /setEditDescEn\(p\.descriptionEn \|\| ''\)/);
  assert.match(grid, /setEditDescEs\(p\.descriptionEs \|\| ''\)/);
});

test('a click on any live control does not open the editor', () => {
  // Every other cell in the row is an input, a select or a button. Without this
  // guard, choosing a category or correcting a price throws a modal over the
  // grid and the operator loses their place.
  const guard = grid.match(/if \(e\.target\.closest\(([^)]+)\)\) return;/);
  assert.ok(guard, 'the row click has no guard against live controls');
  for (const control of ['input', 'select', 'textarea', 'button', 'a', 'label', 'contenteditable']) {
    assert.ok(guard[1].includes(control), `the guard does not cover ${control}`);
  }
  // Dragging across a cell to read or copy it is not a click.
  assert.match(grid, /window\.getSelection\(\)\)\.length > 0\) return;/);
});

test('Save Changes asks before it writes', () => {
  // It wrote to the live catalog on a single click, with no statement of what
  // was about to change and no undo afterwards.
  assert.match(grid, /onClick=\{\(\) => setSaveConfirmOpen\(true\)\}/);
  assert.doesNotMatch(grid, /onClick=\{\(\) => handleSaveChanges\(\)\}/);
  // The confirm button is the only path left to the actual save.
  assert.match(grid, /setSaveConfirmOpen\(false\); handleSaveChanges\(\);/);
  assert.match(grid, /There is no undo/);
});

test('the confirmation names the products it is about to write', () => {
  assert.match(grid, /changedProducts\.slice\(0, 12\)\.map/);
  // Saving with nothing pending is harmless but should say so rather than
  // implying work is about to happen.
  assert.match(grid, /No edits are pending/);
});

test('an edited row is remembered, and forgotten once it is saved', () => {
  // The grid writes every row on save regardless; this set exists only so the
  // operator can be told what they touched.
  assert.match(admin, /const \[changedProductIds, setChangedProductIds\] = useState\(\(\) => new Set\(\)\)/);
  assert.match(admin, /setChangedProductIds\(prev => \{[\s\S]{0,200}next\.add\(productId\)/);
  assert.match(admin, /setChangedProductIds\(new Set\(\)\); \/\/ the pending list is now written/);
  assert.match(admin, /changedProductIds=\{changedProductIds\}/);
});
