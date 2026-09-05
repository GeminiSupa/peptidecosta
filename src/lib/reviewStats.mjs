/**
 * Turning the raw ask history into the numbers the panel shows.
 *
 * Pure, and separate from the route, because the arithmetic is where this can
 * quietly mislead — a click rate that counts Trustpilot in its denominator
 * would look like the emails are failing when in fact those clicks were never
 * observable.
 */

const isTrustpilot = (row) => (Array.isArray(row?.platforms) ? row.platforms : []).includes('trustpilot');
const monthKey = (iso) => String(iso ?? '').slice(0, 7);

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
