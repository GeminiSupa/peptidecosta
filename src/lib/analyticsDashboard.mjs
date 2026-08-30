import { campaignEngagement } from './campaignEngagement.mjs';
import { orderCountsAsSale, orderNetRevenue } from './orderRevenue.mjs';

const RANGE_MS = Object.freeze({
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
});

const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();

export function analyticsRangeStart(range, now = new Date()) {
  const duration = RANGE_MS[range];
  return duration ? new Date(now.getTime() - duration).toISOString() : null;
}

/**
 * A sale that produced money we kept.
 *
 * Handed to the shared rule rather than listing statuses again. This list used
 * to omit "Partly Refunded", so an order with a part refund vanished from the
 * analytics revenue chart entirely while the Today tiles still counted it at
 * full price — the two screens contradicting each other about one order.
 */
export function isSuccessfulAnalyticsOrder(order) {
  return orderCountsAsSale(order);
}

export function isPendingAnalyticsOrder(order) {
  const status = lower(order?.status);
  return status.startsWith('pending') || status === 'payment pending' || status === 'processing';
}

function withinRange(value, range, now) {
  const start = analyticsRangeStart(range, now);
  if (!start) return true;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp >= new Date(start).getTime();
}

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

/**
 * What each campaign earned, keyed by campaign id.
 *
 * `orders.campaign_id` has been travelling in the analytics payload since this
 * screen was built, and was read for exactly one thing: filing an order under a
 * generic "Marketing Studio campaigns" label. So the tab could report that a
 * subject line was opened and never that it was worth sending.
 *
 * Only orders that count as a sale contribute, and refunds come off, because
 * this figure sits beside Revenue elsewhere on the page and two revenue numbers
 * that disagree are worse than one.
 *
 * Kept separate from campaignPerformanceRows so the caller can memoise one pass
 * over the orders rather than rescanning them on every render.
 */
export function campaignRevenueIndex(orders = [], rate) {
  const index = new Map();
  for (const order of orders || []) {
    const campaignId = clean(order?.campaign_id);
    if (!campaignId || !isSuccessfulAnalyticsOrder(order)) continue;
    const row = index.get(campaignId) || { orders: 0, revenueUsd: 0, revenueCrc: 0 };
    const net = orderNetRevenue(order, rate);
    row.orders += 1;
    row.revenueUsd += net.usd;
    row.revenueCrc += net.crc;
    index.set(campaignId, row);
  }
  return index;
}

export function campaignPerformanceRows(campaigns = [], range = 'all', now = new Date(), revenueIndex = new Map()) {
  return (campaigns || [])
    .map((campaign) => ({
      campaign,
      engagement: campaignEngagement(campaign),
      at: campaign.sent_at || campaign.created_at || null,
    }))
    .filter(({ campaign, engagement, at }) => (
      (lower(campaign.status) === 'sent' || engagement.sends > 0)
      && withinRange(at, range, now)
    ))
    .sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0))
    .slice(0, 5)
    .map(({ campaign, engagement, at }) => {
      const revenue = revenueIndex?.get?.(campaign.id) || { orders: 0, revenueUsd: 0, revenueCrc: 0 };
      return {
        id: campaign.id,
        name: clean(campaign.title || campaign.subject_line || 'Campaign').slice(0, 28),
        sentAt: at,
        sends: engagement.sends,
        uniqueOpens: engagement.uniqueOpens,
        uniqueClicks: engagement.uniqueClicks,
        openRate: engagement.openRate,
        clickRate: engagement.clickRate,
        exact: engagement.exact,
        orders: revenue.orders,
        revenueUsd: round2(revenue.revenueUsd),
        revenueCrc: Math.round(revenue.revenueCrc),
        // What one recipient was worth. This is the number that decides whether
        // to send it again: a 40% open rate on a list of 500 that earned
        // nothing is not a win, and the open rate alone cannot say so.
        revenuePerRecipient: engagement.sends > 0 ? round2(revenue.revenueUsd / engagement.sends) : 0,
      };
    });
}

function canonicalSource(value) {
  const source = lower(value);
  if (!source) return 'Direct / unknown';
  if (['fb', 'facebook', 'ig', 'instagram', 'meta'].includes(source)) return 'Meta';
  if (source === 'email') return 'Email';
  if (source === 'sales_rep') return 'Sales reps';
  if (source === 'affiliate') return 'Affiliates';
  if (source === 'whatsapp') return 'WhatsApp';
  return clean(value);
}

function isProductionEvent(event) {
  const hostname = lower(event?.hostname);
  return hostname !== 'localhost' && !hostname.endsWith('.vercel.app');
}

function analyticsIdentity(event) {
  return clean(event?.visitor_id || event?.session_id || event?.id);
}

function analyticsPath(value) {
  const path = clean(value).split(/[?#]/, 1)[0] || '/';
  return path.startsWith('/') ? path : '/';
}

function historicalTrafficRows(events, groupForEvent) {
  const groups = new Map();

  for (const event of events || []) {
    if (!isProductionEvent(event) || lower(event?.event_type) !== 'page_view') continue;
    const group = groupForEvent(event);
    if (!group?.key) continue;
    const row = groups.get(group.key) || {
      ...group,
      pageViews: 0,
      visitorIds: new Set(),
      paidVisitorIds: new Set(),
    };
    const identity = analyticsIdentity(event);
    row.pageViews += 1;
    if (identity) row.visitorIds.add(identity);
    if (identity && (clean(event.gclid) || clean(event.fbclid))) row.paidVisitorIds.add(identity);
    groups.set(group.key, row);
  }

  return [...groups.values()]
    .map(({ visitorIds, paidVisitorIds, ...row }) => ({
      ...row,
      visitors: visitorIds.size,
      paidVisitors: paidVisitorIds.size,
    }))
    .sort((left, right) => right.visitors - left.visitors || right.pageViews - left.pageViews);
}

export function domainTrafficRows(events = []) {
  return historicalTrafficRows(events, (event) => {
    const hostname = lower(event?.hostname);
    return hostname ? { key: hostname, hostname } : null;
  });
}

export function pageTrafficRows(events = []) {
  return historicalTrafficRows(events, (event) => {
    const hostname = lower(event?.hostname);
    const path = analyticsPath(event?.path);
    return hostname ? { key: `${hostname}${path}`, hostname, path } : null;
  });
}

export function uniquePageVisitorCount(events = [], pathPrefix = '/') {
  const prefix = analyticsPath(pathPrefix).replace(/\/$/, '') || '/';
  const identities = new Set();
  let anonymous = 0;

  for (const event of events || []) {
    if (!isProductionEvent(event) || lower(event?.event_type) !== 'page_view') continue;
    const path = analyticsPath(event?.path);
    const matches = prefix === '/' ? true : path === prefix || path.startsWith(`${prefix}/`);
    if (!matches) continue;
    const identity = analyticsIdentity(event);
    if (identity) identities.add(identity);
    else anonymous += 1;
  }

  return identities.size + anonymous;
}

export function acquisitionChannelRows(events = []) {
  const visitors = new Map();

  for (const event of events || []) {
    if (!isProductionEvent(event)) continue;
    const identity = clean(event.visitor_id || event.session_id || event.id);
    if (!identity || visitors.has(identity)) continue;
    visitors.set(identity, canonicalSource(event.utm_source));
  }

  const counts = {};
  for (const source of visitors.values()) counts[source] = (counts[source] || 0) + 1;
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
}

export function uniqueTrackedCount(rows = [], keys = ['session_id', 'visitor_id', 'id']) {
  const identities = new Set();
  let anonymous = 0;
  for (const row of rows || []) {
    const identity = keys.map((key) => clean(row?.[key])).find(Boolean);
    if (identity) identities.add(identity);
    else anonymous += 1;
  }
  return identities.size + anonymous;
}

export function revenueTrendRows(orders = []) {
  const days = {};
  for (const order of orders || []) {
    if (!order.created_at || !isSuccessfulAnalyticsOrder(order)) continue;
    const date = new Date(order.created_at);
    if (!Number.isFinite(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    const row = days[key] || { key, name: key, revenueUsd: 0, revenueCrc: 0, orders: 0 };
    const net = orderNetRevenue(order);
    row.revenueUsd += net.usd;
    row.revenueCrc += net.crc;
    row.orders += 1;
    days[key] = row;
  }
  return Object.values(days).sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * What people clicked, per campaign.
 *
 * `campaign_link_clicks` is already grouped in Postgres, so this only sorts,
 * labels and works out each link's share of the campaign's clicks. The share is
 * the point: a campaign with one link earning every click is a different
 * problem from one where the clicks spread evenly across five.
 */
export function campaignLinkRows(links = [], campaignId, limit = 5) {
  const rows = (links || []).filter((link) => clean(link?.campaign_id) === clean(campaignId));
  const total = rows.reduce((sum, link) => sum + Number(link.clicks || 0), 0);

  return rows
    .map((link) => ({
      url: clean(link.target_url),
      label: linkLabel(link.target_url),
      clicks: Number(link.clicks || 0),
      uniqueClicks: Number(link.unique_clicks || 0),
      lastClickedAt: link.last_clicked_at || null,
      share: total > 0 ? Math.round((Number(link.clicks || 0) / total) * 1000) / 10 : 0,
    }))
    .sort((left, right) => right.clicks - left.clicks || left.label.localeCompare(right.label))
    .slice(0, limit);
}

/**
 * A link, short enough to read in a table cell.
 *
 * The host stays because a campaign linking off-site is worth noticing at a
 * glance; the scheme and the tracking query string do not survive.
 */
export function linkLabel(url) {
  const raw = clean(url);
  if (!raw) return '—';
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    const label = `${parsed.host}${path}`;
    return label.length > 46 ? `${label.slice(0, 45)}…` : label;
  } catch {
    return raw.length > 46 ? `${raw.slice(0, 45)}…` : raw;
  }
}

const dayKey = (value) => {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};

const MAX_TREND_DAYS = 180;

/**
 * Sign-ups against opt-outs, by day.
 *
 * Gaps are filled rather than skipped: a churn chart that silently omits the
 * days nobody left draws a flat line through them, which reads as steady
 * bleeding instead of as quiet.
 */
export function listHealthTrend(addedAt = [], optedOutAt = []) {
  const days = new Map();
  const bump = (value, field) => {
    const key = dayKey(value);
    if (!key) return;
    const row = days.get(key) || { key, name: key, added: 0, optedOut: 0 };
    row[field] += 1;
    days.set(key, row);
  };

  for (const value of addedAt || []) bump(value, 'added');
  for (const value of optedOutAt || []) bump(value, 'optedOut');
  if (days.size === 0) return [];

  const keys = [...days.keys()].sort();
  const first = new Date(`${keys[0]}T00:00:00.000Z`);
  const last = new Date(`${keys[keys.length - 1]}T00:00:00.000Z`);
  const span = Math.round((last - first) / 86400000) + 1;
  if (span > MAX_TREND_DAYS) {
    return keys.map((key) => days.get(key));
  }

  const filled = [];
  for (let offset = 0; offset < span; offset += 1) {
    const key = new Date(first.getTime() + offset * 86400000).toISOString().slice(0, 10);
    filled.push(days.get(key) || { key, name: key, added: 0, optedOut: 0 });
  }
  return filled;
}

/**
 * The list's health as four figures and the one rate that matters.
 *
 * Net growth is what a "subscribers" total alone cannot tell you: a list that
 * added 200 and lost 190 is not a list that grew.
 */
export function listHealthSummary(health) {
  const added = Number(health?.added || 0);
  const optedOut = Number(health?.optedOut || 0);
  const bounced = Number(health?.bounced || 0);
  const subscribed = Number(health?.subscribed || 0);

  return {
    subscribed,
    unsubscribed: Number(health?.unsubscribed || 0),
    added,
    optedOut,
    bounced,
    net: added - optedOut,
    // Against the list they left, not against the people who joined — an
    // opt-out rate that moves when you run a signup campaign is not an opt-out
    // rate.
    churnRate: subscribed + optedOut > 0 ? round2((optedOut / (subscribed + optedOut)) * 100) : 0,
    capped: Boolean(health?.capped),
  };
}
