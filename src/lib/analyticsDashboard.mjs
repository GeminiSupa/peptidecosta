import { campaignEngagement } from './campaignEngagement.mjs';

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

export function isSuccessfulAnalyticsOrder(order) {
  return ['paid', 'completed', 'order complete'].includes(lower(order?.status));
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
    row.revenueUsd += Number(order.total_usd || 0);
    row.revenueCrc += Number(order.total_crc || 0);
    row.orders += 1;
    days[key] = row;
  }
  return Object.values(days).sort((left, right) => left.key.localeCompare(right.key));
}
