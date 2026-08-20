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
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.prospector-stats \{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
});
