import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SEARCH_AREA_DEGREES } from '../src/lib/prospectMap.mjs';
import {
  COSTA_RICA_BBOX,
  SWEEP_TASK_COUNT,
  SWEEP_TERMS,
  nextSweepBatch,
  sweepCells,
  sweepOverpassQuery,
  sweepTasks,
} from '../src/lib/prospectSweep.mjs';
import { prospectSearchProfile } from '../src/lib/prospects.mjs';

test('the grid covers Costa Rica exactly once, with no gaps', () => {
  const cells = sweepCells();
  assert.equal(cells.length, 16);
  assert.equal(Math.min(...cells.map((c) => c.south)), COSTA_RICA_BBOX.south);
  assert.equal(Math.max(...cells.map((c) => c.north)), COSTA_RICA_BBOX.north);
  assert.equal(Math.min(...cells.map((c) => c.west)), COSTA_RICA_BBOX.west);
  assert.equal(Math.max(...cells.map((c) => c.east)), COSTA_RICA_BBOX.east);
  // Rows join edge to edge: each row's north is the next row's south.
  const souths = [...new Set(cells.map((c) => c.south))].sort((a, b) => a - b);
  const norths = [...new Set(cells.map((c) => c.north))].sort((a, b) => a - b);
  assert.deepEqual(souths.slice(1), norths.slice(0, -1));
});

test('every cell stays under the area limit that keeps name matching on', () => {
  // Above MAX_SEARCH_AREA_DEGREES the name clause is dropped, and the name
  // clause is what finds a pharmacy whose mapper never tagged it as one.
  for (const cell of sweepCells()) {
    const area = (cell.north - cell.south) * (cell.east - cell.west);
    assert.ok(area < MAX_SEARCH_AREA_DEGREES, `cell ${cell.row},${cell.col} is too large`);
  }
});

test('the country is tiled for volume, not for the area limit', () => {
  // Costa Rica fits inside one legal query. It is split anyway because Overpass
  // returns at most 80 results however large the box, so a country-wide sweep
  // for pharmacies would return 80 and look finished.
  const whole = (COSTA_RICA_BBOX.north - COSTA_RICA_BBOX.south)
    * (COSTA_RICA_BBOX.east - COSTA_RICA_BBOX.west);
  assert.ok(whole < MAX_SEARCH_AREA_DEGREES);
  assert.ok(sweepCells().length > 1);
});

test('the sweep finishes a business type across the country before starting the next', () => {
  // A part-finished pass should have all of one category, not one corner of
  // every category.
  const tasks = sweepTasks();
  assert.equal(tasks.length, SWEEP_TASK_COUNT);
  assert.equal(tasks[0].term, SWEEP_TERMS[0]);
  for (let i = 0; i < 16; i += 1) assert.equal(tasks[i].term, SWEEP_TERMS[0]);
  assert.equal(tasks[16].term, SWEEP_TERMS[1]);
});

test('the hardest businesses to find are swept first', () => {
  // Pharmacies and distributors were unreachable before these profiles
  // existed; gyms were always findable, so they wait.
  assert.equal(SWEEP_TERMS[0], 'pharmacy');
  assert.ok(SWEEP_TERMS.indexOf('distributor') < SWEEP_TERMS.indexOf('gym'));
  assert.equal(SWEEP_TERMS.at(-1), 'gym');
});

test('the cursor wraps so the sweep never finishes', () => {
  // Businesses open, and OpenStreetMap gains detail on the ones already mapped.
  const first = nextSweepBatch(0, 2);
  assert.deepEqual(first.tasks.map((t) => t.index), [0, 1]);
  assert.equal(first.nextCursor, 2);
  assert.equal(first.wrapped, false);

  const last = nextSweepBatch(SWEEP_TASK_COUNT - 1, 2);
  assert.deepEqual(last.tasks.map((t) => t.index), [SWEEP_TASK_COUNT - 1, 0]);
  assert.equal(last.wrapped, true);
  assert.equal(last.nextCursor, 1);
});

test('a corrupt or missing cursor starts the pass over rather than crashing', () => {
  for (const bad of [undefined, null, NaN, -5, 'nonsense', 99999]) {
    const batch = nextSweepBatch(bad, 1);
    assert.equal(batch.tasks.length, 1);
    assert.ok(batch.tasks[0].index >= 0 && batch.tasks[0].index < SWEEP_TASK_COUNT);
  }
});

test('every swept term has real tag filters behind it', () => {
  // A term with no tags falls back to a bare name match, which on OSM finds
  // almost nothing — it would burn a mirror request for no result.
  for (const term of SWEEP_TERMS) {
    assert.ok(prospectSearchProfile(term).tagFilters.length > 0, `${term} has no tag filters`);
  }
});

test('the pharmacy query asks for the tag, the name, and the cell', () => {
  const cell = sweepCells()[0];
  const query = sweepOverpassQuery('pharmacy', cell);
  assert.match(query, /\["amenity"="pharmacy"\]/);
  assert.match(query, /farmacia/);
  assert.match(query, new RegExp(`\\(${cell.south},${cell.west},${cell.north},${cell.east}\\)`));
  assert.match(query, /out tags center 80;$/);
});
