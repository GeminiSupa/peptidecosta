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

export function campaignPerformanceRows(campaigns = [], range = 'all', now = new Date()) {
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
    .map(({ campaign, engagement, at }) => ({
      id: campaign.id,
      name: clean(campaign.title || campaign.subject_line || 'Campaign').slice(0, 28),
      sentAt: at,
      sends: engagement.sends,
      uniqueOpens: engagement.uniqueOpens,
      uniqueClicks: engagement.uniqueClicks,
      openRate: engagement.openRate,
      clickRate: engagement.clickRate,
      exact: engagement.exact,
    }));
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
