/**
 * Turning the raw ask history into the numbers the panel shows.
 *
 * Pure, and separate from the route, because the arithmetic is where this can
 * quietly mislead — a click rate that counts Trustpilot in its denominator
 * would look like the emails are failing when in fact those clicks were never
 * observable.
 */

import { isoToCrWall } from './crTime.mjs';

const isTrustpilot = (row) => (Array.isArray(row?.platforms) ? row.platforms : []).includes('trustpilot');
const monthKey = (iso) => String(iso ?? '').slice(0, 7);

/**
 * The Costa Rica calendar day an instant falls on, as `YYYY-MM-DD`.
 *
 * Costa Rica, not the reader's clock. Omer reads these charts from Pakistan,
 * eleven hours ahead: a request sent at 8pm in San José is already tomorrow
 * where he is sitting, and a chart drawn on his clock would move a third of
 * every evening's requests into the next bar.
 */
const crDayOf = (iso) => isoToCrWall(iso).slice(0, 10);

/** How many days of daily history the charts show by default. */
export const DEFAULT_DAILY_WINDOW = 30;

/**
 * Review requests and clicks per day, for the charts.
 *
 * Every day in the window gets a row, including the days nothing happened. A
 * series built only from the days that have rows draws a flat line through a
 * three-week gap and hides exactly the thing worth seeing — and there was such
 * a gap, 6-27 Sep 2026, when the monthly cap had already been spent and no
 * Trustpilot invitation went out at all.
 *
 * Clicks are counted on the day of the CLICK, not the day of the ask, because
 * the question the chart answers is "did anything happen that day".
 *
 * @param {Array} rows - review_asks rows
 * @param {object} [opts]
 * @param {number} [opts.days] - length of the window
 * @param {number|Date} [opts.now]
 * @returns {Array<{date: string, label: string, trustpilot: number, google: number, facebook: number, asks: number, clicks: number}>}
 */
export function dailyReviewSeries(rows = [], { days = DEFAULT_DAILY_WINDOW, now = Date.now() } = {}) {
  const window = Math.max(1, Math.floor(Number(days) || DEFAULT_DAILY_WINDOW));
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const today = crDayOf(new Date(nowMs).toISOString());

  const empty = () => ({ trustpilot: 0, google: 0, facebook: 0, asks: 0, clicks: 0 });
  const byDay = new Map();

  // Walk back from today so the window is exact whatever is in the data.
  const dayMs = 86400000;
  for (let i = window - 1; i >= 0; i -= 1) {
    byDay.set(crDayOf(new Date(nowMs - (i * dayMs)).toISOString()), empty());
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;

    const askDay = row.asked_at ? crDayOf(row.asked_at) : '';
    const bucket = byDay.get(askDay);
    if (bucket) {
      bucket.asks += 1;
      for (const p of Array.isArray(row.platforms) ? row.platforms : []) {
        if (p in bucket) bucket[p] += 1;
      }
    }

    // A click can land days after the ask, so it is placed on its own day and
    // falls outside the window with no ask to match, which is correct.
    if (row.clicked_platform) {
      const clickDay = crDayOf(row.clicked_at || row.asked_at);
      const clickBucket = byDay.get(clickDay);
      if (clickBucket) clickBucket.clicks += 1;
    }
  }

  return [...byDay.entries()].map(([date, counts]) => ({
    date,
    // "28 Sep" — short enough that a month of them fits across a phone.
    label: `${Number(date.slice(8, 10))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(date.slice(5, 7)) - 1] || ''}`,
    isToday: date === today,
    ...counts,
  }));
}

/**
 * @param {Array} rows - review_asks rows, any order
 * @param {object} [opts]
 * @param {number} [opts.maxAsksWithoutClick] - asks before a customer is flagged
 * @param {number|Date} [opts.now]
 * @returns {object} the shape the Social Reviews results section renders
 */
export function summariseReviewAsks(rows = [], { maxAsksWithoutClick = 3, now = Date.now() } = {}) {
  const asks = (Array.isArray(rows) ? rows : []).filter((r) => r && r.asked_at);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const thisMonth = monthKey(new Date(nowMs).toISOString());

  const trackable = asks.filter((r) => !isTrustpilot(r));
  const clicked = asks.filter((r) => r.clicked_platform);

  // Per site. Trustpilot's click count is null rather than 0 on purpose: zero
  // reads as "nobody clicked", and the truth is that nobody can know.
  const bySite = { google: { asked: 0, clicked: 0 }, facebook: { asked: 0, clicked: 0 }, trustpilot: { asked: 0, clicked: null } };
  for (const row of asks) {
    for (const p of (Array.isArray(row.platforms) ? row.platforms : [])) {
      if (bySite[p]) bySite[p].asked += 1;
    }
    if (row.clicked_platform && bySite[row.clicked_platform]) {
      bySite[row.clicked_platform].clicked += 1;
    }
  }

  // Per customer, for the flag and for repeat behaviour.
  const byCustomer = new Map();
  for (const row of asks) {
    const key = String(row.customer_email || '').toLowerCase();
    if (!key) continue;
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key).push(row);
  }

  const flagged = [];
  for (const [email, list] of byCustomer.entries()) {
    if (list.some((r) => r.clicked_platform)) continue;
    // Trustpilot asks are excluded: a click there was never visible to us, so
    // counting it as ignored counts our own blind spot against the customer.
    const ignored = list.filter((r) => !isTrustpilot(r)).length;
    if (ignored >= maxAsksWithoutClick) {
      const lastAt = list.map((r) => r.asked_at).sort().pop();
      flagged.push({ email, ignored, lastAskedAt: lastAt });
    }
  }
  flagged.sort((a, b) => b.ignored - a.ignored);

  const trustpilotThisMonth = asks.filter(
    (r) => isTrustpilot(r) && monthKey(r.asked_at) === thisMonth,
  ).length;

  return {
    totals: {
      asks: asks.length,
      customers: byCustomer.size,
      // The denominator is deliberately the trackable asks only.
      trackableAsks: trackable.length,
      clicks: clicked.length,
      clickRatePct: trackable.length
        ? Math.round((clicked.length / trackable.length) * 1000) / 10
        : null,
      trustpilotAsks: asks.filter(isTrustpilot).length,
    },
    bySite,
    trustpilotThisMonth,
    flagged: flagged.slice(0, 50),
    flaggedTotal: flagged.length,
    recent: asks
      .slice()
      .sort((a, b) => String(b.asked_at).localeCompare(String(a.asked_at)))
      .slice(0, 25)
      .map((r) => ({
        email: r.customer_email,
        orderNumber: r.order_number || '',
        platforms: r.platforms || [],
        clicked: r.clicked_platform || null,
        askedAt: r.asked_at,
        clickedAt: r.clicked_at || null,
      })),
  };
}
