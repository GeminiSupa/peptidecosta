/**
 * The Deal of the Week page A/B test.
 *
 * Two versions of /deal-of-the-week compete. Both use the same colours
 * (green to buy, orange for the offer); they differ in three things at once:
 *   A — the offer first, savings in money ("Save $55"), no countdown
 *   B — the products first, savings in percent ("42% off"), a live countdown
 * Because more than one thing changes, a result says which PAGE sells more,
 * not which single change did it (Omer's choice, 2026-09-18).
 *
 * v1 (2026-09-18, orange vs green) was replaced the same day; its events stay
 * under 'deal_of_week_page' and are not counted in this test.
 *
 * Each visitor is put in one version and kept there. Page views and button
 * clicks are recorded from the page; an order is credited to the version only
 * if that shopper saw the deal page within the last 14 days.
 *
 * Free of `@/` imports so tests/ can load it under `node --test`.
 */

import { COMMISSION_ELIGIBLE_ORDER_STATUSES } from './agentAttribution.mjs';

export const DEAL_PAGE_EXPERIMENT = 'deal_of_week_page_v2';
export const DEAL_PAGE_VARIANTS = Object.freeze(['a', 'b']);
export const DEAL_PAGE_VARIANT_KEY = 'dow_page_variant';
// v2: a visit to the v1 page must not credit an order to this test.
export const DEAL_PAGE_SEEN_KEY = 'dow_page_seen_at_v2';
export const DEAL_PAGE_ATTRIBUTION_MS = 14 * 24 * 60 * 60 * 1000;
// Below this, one lucky order swings the result; the dashboard says "too early".
export const MIN_VISITORS_TO_CALL = 100;
export const WINNER_CONFIDENCE = 0.95;

export const DEAL_PAGE_VARIANT_LABELS = Object.freeze({
  a: 'A — offer first, $ saved, no timer',
  b: 'B — products first, % off, countdown',
});

const PAID_STATUSES = new Set(COMMISSION_ELIGIBLE_ORDER_STATUSES.map((status) => status.toLowerCase()));

export function normalizeVariant(value) {
  const variant = String(value ?? '').trim().toLowerCase();
  return DEAL_PAGE_VARIANTS.includes(variant) ? variant : '';
}

/**
 * A `?variant=` in the link wins (for checking each version by hand), then the
 * version this visitor already has, then a coin flip.
 */
export function pickVariant({ requested, stored, random = Math.random } = {}) {
  return normalizeVariant(requested) || normalizeVariant(stored) || (random() < 0.5 ? 'a' : 'b');
}

/** The tag sent with an order, or null when the deal page was not seen recently. */
export function experimentOrderTag({ variant, seenAt, now = Date.now() } = {}) {
  const chosen = normalizeVariant(variant);
  const seen = Number(seenAt);
  if (!chosen || !Number.isFinite(seen) || seen <= 0) return null;
  if (seen > now + 60 * 1000 || now - seen > DEAL_PAGE_ATTRIBUTION_MS) return null;
  return { experiment: DEAL_PAGE_EXPERIMENT, variant: chosen };
}

/** Standard normal cumulative distribution (Abramowitz–Stegun 7.1.26). */
function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Two-sided confidence that the two conversion rates really differ, and the
 * sign of the difference (positive = B higher).
 */
export function compareRates(successesA, trialsA, successesB, trialsB) {
  if (!trialsA || !trialsB) return null;
  const pooled = (successesA + successesB) / (trialsA + trialsB);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / trialsA + 1 / trialsB));
  if (!standardError) return null;
  const z = (successesB / trialsB - successesA / trialsA) / standardError;
  return { z, confidence: 2 * normalCdf(Math.abs(z)) - 1 };
}

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

/**
 * Fold the recorded events and the matching orders into an A-vs-B scorecard.
 *
 * "Conversion" is paid orders per unique visitor: a placed-but-unpaid order is
 * shown, but only money received decides the winner.
 */
export function summarizeDealPageExperiment(events = [], orders = []) {
  const orderById = new Map((orders || []).map((order) => [order.id, order]));
  const tallies = Object.fromEntries(DEAL_PAGE_VARIANTS.map((variant) => [variant, {
    views: 0,
    visitors: new Set(),
    ctaClicks: 0,
    clickVisitors: new Set(),
    orders: 0,
    paidOrders: 0,
    revenueUsd: 0,
    countedOrders: new Set(),
  }]));

  for (const event of events || []) {
    const tally = tallies[normalizeVariant(event?.variant)];
    if (!tally) continue;
    if (event.event === 'view') {
      tally.views += 1;
      if (event.visitor_id) tally.visitors.add(event.visitor_id);
    } else if (event.event === 'cta_click') {
      tally.ctaClicks += 1;
      if (event.visitor_id) tally.clickVisitors.add(event.visitor_id);
    } else if (event.event === 'order') {
      const key = event.order_id || event.order_number;
      if (!key || tally.countedOrders.has(key)) continue;
      tally.countedOrders.add(key);
      tally.orders += 1;
      const order = orderById.get(event.order_id);
      if (order && PAID_STATUSES.has(String(order.status || '').trim().toLowerCase())) {
        tally.paidOrders += 1;
        tally.revenueUsd += Math.max(0, Number(order.total_usd || 0) - Number(order.refunded_amount_usd || 0));
      }
    }
  }

  const variants = DEAL_PAGE_VARIANTS.map((variant) => {
    const tally = tallies[variant];
    const visitors = tally.visitors.size;
    return {
      variant,
      label: DEAL_PAGE_VARIANT_LABELS[variant],
      views: tally.views,
      visitors,
      ctaClicks: tally.ctaClicks,
      clickVisitors: tally.clickVisitors.size,
      clickRate: visitors ? tally.clickVisitors.size / visitors : 0,
      orders: tally.orders,
      paidOrders: tally.paidOrders,
      conversionRate: visitors ? tally.paidOrders / visitors : 0,
      revenueUsd: money(tally.revenueUsd),
      revenuePerVisitor: visitors ? money(tally.revenueUsd / visitors) : 0,
    };
  });

  const [a, b] = variants;
  let verdict;
  if (a.visitors < MIN_VISITORS_TO_CALL || b.visitors < MIN_VISITORS_TO_CALL) {
    verdict = { status: 'too_early', minVisitors: MIN_VISITORS_TO_CALL };
  } else {
    const comparison = compareRates(a.paidOrders, a.visitors, b.paidOrders, b.visitors);
    if (comparison && comparison.confidence >= WINNER_CONFIDENCE) {
      verdict = { status: 'winner', winner: comparison.z > 0 ? 'b' : 'a', confidence: comparison.confidence };
    } else {
      verdict = { status: 'no_difference_yet', confidence: comparison ? comparison.confidence : 0 };
    }
  }

  return { experiment: DEAL_PAGE_EXPERIMENT, variants, verdict };
}
