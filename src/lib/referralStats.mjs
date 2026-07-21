/**
 * Joins referral landings to the orders they produced.
 *
 * Scans come from referral_scans (one row per session per referral); orders
 * already carry sales_agent for team members and promo_code / affiliate_id for
 * affiliates. Matching is by the same lowercased-name rule the payout code
 * uses, so a name that earns commission is a name that shows up here.
 */

const norm = (value) => String(value || '').trim().toLowerCase();

/** Group scans by whichever referral identifier they carried. */
export function groupScans(scans = []) {
  const groups = new Map();

  for (const scan of scans || []) {
    if (!scan) continue;
    const key = norm(scan.sales_agent) || norm(scan.promo_code) || norm(scan.referral);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: scan.sales_agent || scan.promo_code || scan.referral,
        kind: scan.sales_agent ? 'agent' : (scan.promo_code ? 'promo' : 'referral'),
        scans: 0,
        firstVisits: 0,
        devices: {},
        countries: {},
        firstSeen: null,
        lastSeen: null,
      });
    }

    const group = groups.get(key);
    group.scans += 1;
    if (scan.is_first_visit) group.firstVisits += 1;

    const device = scan.device_type || 'unknown';
    group.devices[device] = (group.devices[device] || 0) + 1;

    if (scan.country) group.countries[scan.country] = (group.countries[scan.country] || 0) + 1;

    const at = scan.created_at ? new Date(scan.created_at).getTime() : null;
    if (Number.isFinite(at)) {
      if (group.firstSeen === null || at < group.firstSeen) group.firstSeen = at;
      if (group.lastSeen === null || at > group.lastSeen) group.lastSeen = at;
    }
  }

  return groups;
}

const PAID = new Set(['paid', 'completed', 'order complete', 'processing']);
const orderIsPaid = (order) => PAID.has(norm(order?.status));

/** Order total in USD, tolerating the several shapes orders are stored in. */
export function orderUsd(order, exchangeRate = 454.48) {
  const usd = Number(order?.total_usd || 0);
  if (usd > 0) return usd;
  const crc = Number(order?.total_crc || 0);
  if (crc > 0) return crc / exchangeRate;
  const total = Number(order?.total || 0);
  if (!total) return 0;
  return norm(order?.currency) === 'usd' ? total : total / exchangeRate;
}

/**
 * @returns {Array} one row per referral, scans joined to paid orders,
 *                  sorted by revenue then scans.
 */
export function buildReferralStats(scans = [], orders = [], exchangeRate = 454.48) {
  const groups = groupScans(scans);

  // Seed groups for referrals that produced orders but recorded no scans -
  // e.g. links shared before tracking existed. Otherwise their revenue vanishes.
  for (const order of orders || []) {
    const key = norm(order?.sales_agent) || norm(order?.promo_code);
    if (!key || groups.has(key)) continue;
    groups.set(key, {
      key,
      label: order.sales_agent || order.promo_code,
      kind: order.sales_agent ? 'agent' : 'promo',
      scans: 0, firstVisits: 0, devices: {}, countries: {},
      firstSeen: null, lastSeen: null,
    });
  }

  for (const group of groups.values()) {
    group.orders = 0;
    group.revenueUsd = 0;
  }

  for (const order of orders || []) {
    if (!orderIsPaid(order)) continue;
    const key = norm(order?.sales_agent) || norm(order?.promo_code);
    const group = key && groups.get(key);
    if (!group) continue;
    group.orders += 1;
    group.revenueUsd += orderUsd(order, exchangeRate);
  }

  const topOf = (counts) => {
    const entries = Object.entries(counts || {});
    if (!entries.length) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  };

  return Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      label: group.label,
      kind: group.kind,
      scans: group.scans,
      firstVisits: group.firstVisits,
      orders: group.orders,
      revenueUsd: Math.round(group.revenueUsd * 100) / 100,
      // Undefined rather than 0 when there are no scans: 0% would imply the
      // link was tried and failed, when in fact nothing was measured.
      conversionRate: group.scans > 0 ? Math.round((group.orders / group.scans) * 1000) / 10 : null,
      topDevice: topOf(group.devices),
      topCountry: topOf(group.countries),
      firstSeen: group.firstSeen ? new Date(group.firstSeen).toISOString() : null,
      lastSeen: group.lastSeen ? new Date(group.lastSeen).toISOString() : null,
    }))
    .sort((a, b) => (b.revenueUsd - a.revenueUsd) || (b.scans - a.scans));
}

/** Coarse device bucket from a user-agent. Deliberately not fingerprinting. */
export function deviceTypeFromUserAgent(userAgent) {
  const ua = norm(userAgent);
  if (!ua) return 'unknown';
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}
