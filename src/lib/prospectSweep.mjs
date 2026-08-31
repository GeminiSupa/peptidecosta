/**
 * The standing sweep that keeps the Prospector finding businesses on its own.
 *
 * Every piece needed to discover a prospect already existed — an OpenStreetMap
 * search that needs no API key, a save path that dedupes, an enrichment crawler
 * that reads contact details off a website and records where it found them.
 * Nothing ran any of it. The search endpoint only ever answered a person
 * typing into a box, and nothing was scheduled, so the pipeline held one row.
 *
 * This is the missing part: a fixed list of (map cell x business type) queries
 * covering Costa Rica, walked a couple at a time by a cron so the free Overpass
 * mirrors are never asked for a country in one breath.
 *
 * There is no queue table. The task list is completely determined by the
 * constants below, so all that has to persist is how far through it we are —
 * one integer, kept in site_settings. A cursor that wraps also means the sweep
 * never finishes: it comes back around and picks up businesses mapped since the
 * last pass.
 */

import { expandAnchoredTagPattern, prospectSearchProfile } from './prospects.mjs';

/**
 * Mainland Costa Rica.
 *
 * Isla del Coco is deliberately outside it. Including the island stretches the
 * box some 550km southwest over open ocean, which costs every query real time
 * on a shared mirror to search water nobody sells to.
 */
export const COSTA_RICA_BBOX = { south: 8.02, west: -85.96, north: 11.22, east: -82.55 };

/**
 * The grid keeps every cell under the area limit, above which name matching is
 * switched off — and name matching is what finds "Farmacia La Bomba" when the
 * mapper never tagged it as a pharmacy.
 *
 * It is not there to work around the result cap. See SWEEP_RESULT_LIMIT.
 */
export const SWEEP_ROWS = 4;
export const SWEEP_COLS = 4;

/**
 * How many businesses one query may return.
 *
 * The interactive search asks for 80, which is right for a person reading a
 * list and waiting on it. Copying that number into a background job was a
 * mistake worth writing down: the San José cell holds 514 pharmacies, so 80
 * silently discarded 84% of them and the sweep would have looked like it had
 * covered the country.
 *
 * 800 is set against a measured worst case of 514 in the densest cell for the
 * densest category, and costs about 100KB of response. A cell that ever comes
 * back with exactly this many is reported as saturated by the cron rather than
 * quietly truncated, because that is the signal the grid needs splitting.
 */
export const SWEEP_RESULT_LIMIT = 800;

/**
 * What to sweep for, hardest-to-find first.
 *
 * Ordered so a pass that is interrupted has still done the valuable half. The
 * first four are the businesses that buy to resell and were unreachable before
 * these profiles existed; gyms and wellness are last because they were already
 * the only things this tool could find.
 */
export const SWEEP_TERMS = [
  'pharmacy',
  'distributor',
  'veterinary',
  'supplements',
  'medical center',
  'dermatology',
  'laboratory',
  'clinic',
  'aesthetic clinic',
  'sports clinic',
  'nutritionist',
  'wellness',
  'gym',
];

/** The map cells, left to right and top to bottom. */
export function sweepCells(bbox = COSTA_RICA_BBOX, rows = SWEEP_ROWS, cols = SWEEP_COLS) {
  const latStep = (bbox.north - bbox.south) / rows;
  const lonStep = (bbox.east - bbox.west) / cols;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        row,
        col,
        south: Number((bbox.south + row * latStep).toFixed(5)),
        north: Number((bbox.south + (row + 1) * latStep).toFixed(5)),
        west: Number((bbox.west + col * lonStep).toFixed(5)),
        east: Number((bbox.west + (col + 1) * lonStep).toFixed(5)),
      });
    }
  }
  return cells;
}

/**
 * Every (business type, cell) pair, in a fixed order.
 *
 * Business type is the outer loop, so the sweep finishes all of Costa Rica's
 * pharmacies before it starts on distributors. Cell-first ordering would
 * instead finish one corner of the country in every category, which is the
 * less useful half to have when a pass is only part-way through.
 */
export function sweepTasks() {
  const cells = sweepCells();
  return SWEEP_TERMS.flatMap((term) => cells.map((cell) => ({ term, cell })));
}

export const SWEEP_TASK_COUNT = SWEEP_TERMS.length * SWEEP_ROWS * SWEEP_COLS;

/**
 * The next few tasks, and where to resume.
 *
 * The cursor wraps rather than stopping, because a finished pass is not a
 * finished job — businesses open, and OpenStreetMap gains detail on the ones
 * already there.
 */
export function nextSweepBatch(cursor = 0, size = 2) {
  const tasks = sweepTasks();
  const start = Number.isFinite(Number(cursor)) ? Math.max(0, Math.trunc(Number(cursor))) % tasks.length : 0;
  const batch = [];
  for (let i = 0; i < Math.max(1, size); i += 1) {
    batch.push({ ...tasks[(start + i) % tasks.length], index: (start + i) % tasks.length });
  }
  const nextCursor = (start + batch.length) % tasks.length;
  return { tasks: batch, nextCursor, wrapped: start + batch.length >= tasks.length, total: tasks.length };
}

/**
 * The Overpass query for one task.
 *
 * Deliberately its own function rather than a shared one with the interactive
 * search: that one carries a country-area branch, a cache and a streaming
 * contract this has no use for, and it is tuned for a person waiting on a
 * result. Both build the same clause shape from the same profile.
 */
export function sweepOverpassQuery(term, cell) {
  const profile = prospectSearchProfile(term);
  const scope = `(${cell.south},${cell.west},${cell.north},${cell.east})`;

  const clauses = profile.tagFilters.flatMap(([key, pattern]) => {
    const literals = expandAnchoredTagPattern(pattern);
    return literals
      ? literals.map((value) => `nwr["${key}"="${value}"]${scope};`)
      : [`nwr["${key}"~"${pattern}"]${scope};`];
  });

  // Every cell is small enough for the name clause, which is what finds a
  // business whose mapper never tagged what it is — the common case for a
  // Costa Rican pharmacy.
  if (profile.namePattern) clauses.push(`nwr["name"~"${profile.namePattern}",i]${scope};`);
  if (!clauses.length) return null;

  // The same generous declared timeout the interactive search uses: Overpass
  // schedules on the number it is given, so asking for too little is refused
  // rather than served quickly.
  return `[out:json][timeout:40];(${clauses.join('')});out tags center ${SWEEP_RESULT_LIMIT};`;
}
