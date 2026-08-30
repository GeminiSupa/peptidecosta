/**
 * One palette for the analytics tab.
 *
 * The tab had 314 inline style blocks against 8 shared rules, and every panel
 * picked its own hex at the point of use. That produced three greens, three
 * ambers and three blues doing the same job, and it is why the tab could not be
 * restyled: there was no central place for a change to land.
 *
 * Two copies of these values exist, and they have different jobs:
 *
 *   - The `--an-*` custom properties in admin.css style everything that is CSS.
 *   - This object supplies the chart colours, because Recharts writes them as
 *     SVG presentation attributes, where `var()` does not resolve.
 *
 * `analytics-theme.test.mjs` asserts the two agree, so the split cannot drift
 * into the problem it was meant to fix.
 */

/**
 * Series colours, in the order a chart should reach for them.
 *
 * Ordered so the first two are furthest apart: most charts here have two
 * series, and those two need to separate for a reader who does not see the
 * hues. Every pair in this list also differs in lightness, so the difference
 * survives being printed, projected, or read by roughly one man in twelve.
 */
export const CHART_SERIES = Object.freeze([
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#34d399', // green
  '#fbbf24', // amber
  '#f87171', // red
  '#ec4899', // pink
]);

export const ANALYTICS_COLORS = Object.freeze({
  ink: '#f8fafc',
  inkSoft: '#cbd5e1',
  inkMuted: '#94a3b8',
  inkFaint: '#64748b',
  inkDim: '#475569',
  surface: '#0f172a',
  surfaceRaised: '#172237',
  rule: '#334155',
  accent: '#38bdf8',
  accentAlt: '#a78bfa',
  positive: '#34d399',
  negative: '#f87171',
  warning: '#fbbf24',
});

/** The series colour for the nth line, bar or slice, wrapping if there are more. */
export const chartColor = (index) => CHART_SERIES[((index % CHART_SERIES.length) + CHART_SERIES.length) % CHART_SERIES.length];
