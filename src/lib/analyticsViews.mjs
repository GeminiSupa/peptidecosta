/**
 * Saved views for the analytics tab.
 *
 * The filters a reader sets — range, custom dates, what to compare against —
 * were gone on reload, so "how did launch week go" had to be re-picked every
 * time anyone wanted to look at it again. A view is that set of filters with a
 * name on it.
 *
 * These live in the browser rather than the database on purpose: they are a
 * reader's own shortcuts, not shared configuration, and putting them in
 * localStorage means no migration stands between the feature and being usable.
 * Every read is defensive because storage can be disabled, full, or hold
 * something another version of this code wrote.
 */

export const VIEWS_KEY = 'costapeptides.analytics.views';
export const LAST_VIEW_KEY = 'costapeptides.analytics.lastFilters';

const MAX_VIEWS = 12;
const RANGES = new Set(['24h', '7d', '30d', 'all', 'custom']);
const COMPARE = new Set(['previous', 'year', 'off']);

const cleanName = (value) => String(value ?? '').trim().slice(0, 40);

/** A filter set, with anything unrecognised replaced by the default. */
export function normaliseFilters(filters) {
  const range = RANGES.has(filters?.range) ? filters.range : 'all';
  const compare = COMPARE.has(filters?.compare) ? filters.compare : 'previous';
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));
  return {
    range,
    compare,
    start: range === 'custom' && isDate(filters?.start) ? filters.start : '',
    end: range === 'custom' && isDate(filters?.end) ? filters.end : '',
  };
}

export function parseViews(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const views = [];
  for (const entry of parsed) {
    const name = cleanName(entry?.name);
    // A duplicate name would give the reader two identical-looking rows and no
    // way to tell which one they are deleting.
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    views.push({ name, filters: normaliseFilters(entry?.filters) });
    if (views.length >= MAX_VIEWS) break;
  }
  return views;
}

/** Add or replace a view by name, newest first. */
export function upsertView(views, name, filters) {
  const cleaned = cleanName(name);
  if (!cleaned) return views;
  const rest = (views || []).filter((view) => view.name.toLowerCase() !== cleaned.toLowerCase());
  return [{ name: cleaned, filters: normaliseFilters(filters) }, ...rest].slice(0, MAX_VIEWS);
}

export function removeView(views, name) {
  const cleaned = cleanName(name).toLowerCase();
  return (views || []).filter((view) => view.name.toLowerCase() !== cleaned);
}

/** Storage that never throws: a private window should cost a shortcut, not the tab. */
export function readStored(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    return raw === null || raw === undefined ? fallback : raw;
  } catch {
    return fallback;
  }
}

export function writeStored(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
