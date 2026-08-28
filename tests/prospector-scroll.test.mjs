import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mapSource = await readFile(
  new URL('../src/components/admin/prospector/ProspectMap.js', import.meta.url),
  'utf8',
);
const styles = await readFile(
  new URL('../src/components/admin/prospector/prospectorStyles.js', import.meta.url),
  'utf8',
);

test('ordinary wheel gestures scroll the Prospector page instead of zooming the map', () => {
  const passThrough = mapSource.indexOf("if (!event.ctrlKey && !event.metaKey) return;");
  const preventDefault = mapSource.indexOf('event.preventDefault();', passThrough);

  assert.ok(passThrough >= 0, 'plain wheel gestures need a pass-through guard');
  assert.ok(preventDefault > passThrough, 'preventDefault must only run after the modifier guard');
});

test('Prospector panes and touch gestures retain independent scrolling', () => {
  assert.match(styles, /\.prospector-result-list \{[^}]*overflow:auto;[^}]*min-height:0;/);
  assert.match(styles, /\.prospector-detail \{[^}]*overflow:auto;/);
  assert.match(styles, /\.pmap \{[^}]*touch-action:pan-y pinch-zoom;/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.prospector-result-list \{ max-height:46dvh; \}/);
  assert.match(styles, /\.prospector-tabs \{[^}]*overflow-x:auto;/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.prospector-stats \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.prospector-pipeline-columns \{ display:none; \}/);
});

const managerSource = await readFile(
  new URL('../src/components/admin/ProspectorManager.js', import.meta.url),
  'utf8',
);

test('the workspace row is capped to the workspace height so the panes scroll', () => {
  // Without an explicit row track the single implicit row is auto-sized: it
  // grows to the tallest pane, overflows the fixed-height workspace, and is
  // clipped by its overflow:hidden — so neither pane ever gets a scrollbar.
  assert.match(styles, /\.prospector-workspace \{[^}]*grid-template-rows:minmax\(0,1fr\);/);
  // A grid item defaults to min-height:auto and refuses to shrink below its
  // content, which defeats the row cap above.
  assert.match(styles, /\.prospector-results \{[^}]*min-height:0;/);
  assert.match(styles, /\.prospector-detail \{[^}]*min-height:0;/);
});

test('the stacked breakpoints override the saved workspace too', () => {
  // A media query adds no specificity, so `.prospector-workspace` on its own
  // loses to `.prospector-workspace.saved` and the pipeline tab keeps its
  // 660px height and 950px minimum width on a phone.
  assert.match(
    styles,
    /@media\(max-width:1180px\)\{[\s\S]*?\.prospector-workspace, \.prospector-workspace\.saved \{[^}]*grid-template-rows:auto;[^}]*height:auto;/,
  );
  assert.match(
    styles,
    /@media\(max-width:760px\)\{[\s\S]*?\.prospector-workspace, \.prospector-workspace\.saved \{[^}]*flex-direction:column;[^}]*height:auto;/,
  );
});

test('a new search clears the previous results before the first wave lands', () => {
  // A category-only search emits no partial wave, so stale rows used to sit
  // under a searchCenter that had already moved to the new city.
  const runSearch = managerSource.indexOf('const runSearch = useCallback(');
  const cleared = managerSource.indexOf('applySearchResults([]);', runSearch);
  const centerReset = managerSource.indexOf('if (!bbox) setSearchCenter(null);', runSearch);
  assert.ok(runSearch >= 0);
  assert.ok(cleared > runSearch && cleared < centerReset, 'results must be cleared before the centre moves');
});

test('the partial search wave checks which results are already saved', () => {
  const partial = managerSource.indexOf("if (event.type === 'partial')");
  const synced = managerSource.indexOf('syncSavedMatches', partial);
  const nextBranch = managerSource.indexOf("if (event.type === 'complete')", partial);
  assert.ok(partial >= 0 && synced > partial && synced < nextBranch);
});

test('rating filters are held shut while no result carries rating data', () => {
  // Every OpenStreetMap result has rating null, so an enabled rating filter
  // empties the list on every search.
  assert.match(managerSource, /const hasRatingData = useMemo\(/);
  assert.match(managerSource, /value=\{discoveryMinRating\} disabled=\{!hasRatingData\}/);
  assert.match(managerSource, /value=\{discoveryMinReviews\} disabled=\{!hasRatingData\}/);
});
