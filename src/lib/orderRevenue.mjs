/**
 * What an order is actually worth, once money given back is taken off.
 *
 * Eight screens report money — the Today tiles, the analytics chart, a
 * customer's total spent, their timeline, the WhatsApp lifetime value, the
 * marketing revenue score and two campaign figures — and each used to do its
 * own arithmetic. They disagreed. A $100 order with $30 refunded read as $100
 * on the Today tiles, vanished entirely from the analytics chart, and still
 * counted as $100 spent against the customer — enough to tag them VIP and then
 * write to them as a priority customer.
 *
 * So the sum lives here once, the way commission already lives in agentOrders.
 * A screen that wants revenue asks this file; none of them subtract for
 * themselves.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

import { COMMISSION_ELIGIBLE_ORDER_STATUSES } from './agentAttribution.mjs';
import { orderPaidAmounts, orderRefundedAmounts } from './orderRefund.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundCrc = (value) => Math.round(Number(value || 0));
const lower = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Rate used to read a colón-only order in dollars.
 *
 * The same figure the catalog, the admin panel and the pricing helper already
 * fall back to, so an order converted here is not worth a different amount than
 * the same order priced anywhere else. Callers holding the live rate should
 * pass it; this is the floor, not the intended value.
 */
export const FALLBACK_USD_CRC_RATE = 454.48;

/** The caller's rate when it is usable, the shared fallback when it is not. */
function safeRate(rate) {
  const parsed = Number(rate);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_USD_CRC_RATE;
}

/**
 * A dollar figure for a row that only carries colones.
 *
 * total_usd and total_crc are the same money written twice, so a row holding
 * just one of them is incomplete, not cheap. The WooCommerce sync behind the
 * main site fills total_crc and leaves total_usd empty, and because every money
 * screen reads the dollar column, those orders counted as a real sale worth
 * $0.00 — listed in Orders at their colón price, but absent from Revenue Today,
 * the analytics chart and the customer's lifetime total. Four completed orders
 * had gone missing that way before anyone noticed.
 *
 * Only ever fills a gap. A row that already has a dollar figure keeps it
 * untouched, so this can never re-price an order that was charged in USD.
 */
function usdWithCrcFallback(usd, crc, rate) {
  if (usd > 0) return usd;
  if (crc > 0) return round2(crc / safeRate(rate));
  return usd;
}

/**
 * Statuses whose money is ours to count.
 *
 * The commission list itself, not a second list that mirrors it — a status must
 * never be worth a commission but not revenue, and two lists drift.
 *
 * 'Partly Refunded' is in it, because the customer kept something. 'Refunded'
 * is not: nothing was kept, so it is not a sale, and saying so here means the
 * refund figures never depend on refunded_amount being filled in correctly.
 */
export const REVENUE_ORDER_STATUSES = new Set(
  COMMISSION_ELIGIBLE_ORDER_STATUSES.map(lower),
);

/**
 * A per-order answer to "does this count as money?", set by hand from the
 * Today tiles and outranking the status rules below.
 *
 * A test order in any normally reportable status, including Paid, can be held
 * out without deleting it. Marking it 'exclude' here takes it out of every
 * revenue and commission view at once, because every money report comes
 * through this file.
 *
 * Reversible: clearing the column returns the order to the normal rules.
 */
export const STATS_OVERRIDE_INCLUDE = 'include';
export const STATS_OVERRIDE_EXCLUDE = 'exclude';
export const STATS_OVERRIDE_VALUES = [STATS_OVERRIDE_INCLUDE, STATS_OVERRIDE_EXCLUDE];

/** The override on an order, or null when it follows the status rules. */
export function orderStatsOverride(order) {
  const value = lower(order?.stats_override);
  return STATS_OVERRIDE_VALUES.includes(value) ? value : null;
}

/**
 * Did this order ever become money? Unpaid, declined and cancelled did not.
 *
 * A hand-set override wins: it is the whole point of the column, and it is the
 * only way to keep a test order out of the figures without deleting it.
 */
export function orderCountsAsSale(order) {
  const override = orderStatsOverride(order);
  if (override === STATS_OVERRIDE_EXCLUDE) return false;
  if (override === STATS_OVERRIDE_INCLUDE) return true;
  return REVENUE_ORDER_STATUSES.has(lower(order?.status));
}

/**
 * Why this order does or does not count, for the drill-down list.
 *
 * @returns {{counts: boolean, override: string|null, reason: string}}
 */
export function orderRevenueBasis(order) {
  const override = orderStatsOverride(order);
  const status = String(order?.status ?? '').trim() || 'Pending';

  if (override === STATS_OVERRIDE_EXCLUDE) {
    return { counts: false, override, reason: `Excluded by hand (status is ${status})` };
  }
  if (override === STATS_OVERRIDE_INCLUDE) {
    return { counts: true, override, reason: `Included by hand (status is ${status})` };
  }
  return REVENUE_ORDER_STATUSES.has(lower(status))
    ? { counts: true, override: null, reason: `Counts because status is ${status}` }
    : { counts: false, override: null, reason: `Status ${status} is not a sale` };
}

/**
 * What the business kept on this order, in both currencies.
 *
 * Zero for anything that never became a sale, and never negative.
 */
export function orderNetRevenue(order, rate) {
  // Covers the fully refunded order too: it is not a sale, so it is worth zero
  // here without depending on refunded_amount having been filled in — which an
  // order marked Refunded by hand would not have.
  if (!orderCountsAsSale(order)) return { usd: 0, crc: 0 };

  const paid = orderPaidAmounts(order);
  const back = orderRefundedAmounts(order);
  // Both sides of the subtraction get the same treatment. Converting only what
  // was paid would let a colón-only order that was refunded in colones keep its
  // full dollar total against a refund of zero — worse than the $0 it replaced.
  const paidUsd = usdWithCrcFallback(paid.usd, paid.crc, rate);
  const backUsd = usdWithCrcFallback(back.usd, back.crc, rate);
  return {
    usd: Math.max(0, round2(paidUsd - backUsd)),
    crc: Math.max(0, roundCrc(paid.crc - back.crc)),
  };
}

/** Net revenue in USD alone — the figure most screens show. */
export function orderNetRevenueUsd(order, rate) {
  return orderNetRevenue(order, rate).usd;
}

/**
 * What was paid on an order in dollars, whether or not it counts as revenue.
 *
 * The tile drill-down lists the orders inside the window that are NOT counting
 * next to the ones that are, because the point is to be able to force one in as
 * well as hold one out — and nobody can decide that about an order showing
 * $0.00. orderNetRevenue owes those orders zero by design, so the list asks
 * here instead, and gets the colón fallback with it.
 */
export function orderGrossUsd(order, rate) {
  const paid = orderPaidAmounts(order);
  return usdWithCrcFallback(paid.usd, paid.crc, rate);
}

/**
 * Drop orders held out of the figures by hand.
 *
 * For the commission and agent paths, which narrow by status in SQL rather than
 * asking orderCountsAsSale — `.in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES)`
 * happily returns an excluded order, and nothing downstream re-checks it, so it
 * would be paid on. Filtering here in JS rather than in the query is
 * deliberate: migrations are pasted in by hand, so a deploy can land before the
 * column exists, and a query naming a missing column fails outright and takes
 * the whole payout scan with it. A missing column simply reads as undefined
 * here, which is no override, which is the old behaviour.
 */
export function withoutExcludedOrders(orders = []) {
  return (orders || []).filter((order) => orderStatsOverride(order) !== STATS_OVERRIDE_EXCLUDE);
}

/** Net revenue across many orders. */
export function totalNetRevenue(orders = [], rate) {
  let usd = 0;
  let crc = 0;
  for (const order of orders || []) {
    const net = orderNetRevenue(order, rate);
    usd += net.usd;
    crc += net.crc;
  }
  return { usd: round2(usd), crc: roundCrc(crc) };
}

/**
 * Each refund on an order as its own dated entry.
 *
 * A day's refund figure has to be the refunds made that day, and an order can
 * be refunded more than once. refunded_at holds only the latest one while
 * refunded_amount holds the running total, so pairing those two would drop a
 * fortnight of partial refunds onto whichever day the last one landed.
 * refund_events keeps them separate, so it is used whenever it is there.
 */
export function orderRefundEvents(order) {
  const events = Array.isArray(order?.refund_events) ? order.refund_events : [];
  const dated = events
    .map((event) => ({
      at: event?.at || order?.refunded_at || order?.created_at || null,
      usd: Number(event?.amount_usd || 0),
      crc: Number(event?.amount_crc || 0),
    }))
    .filter((event) => event.usd > 0 || event.crc > 0);

  if (dated.length) return dated;

  // Refunded before refund_events existed, or written straight into the row.
  const back = orderRefundedAmounts(order);
  if (back.usd <= 0 && back.crc <= 0) return [];
  return [{
    at: order?.refunded_at || order?.created_at || null,
    usd: back.usd,
    crc: back.crc,
  }];
}

/**
 * Money given back between two dates.
 *
 * @param {object[]} orders
 * @param {Date|string|number} [start] inclusive; open-ended when omitted
 * @param {Date|string|number} [end] exclusive; open-ended when omitted
 * @returns {{usd: number, crc: number, count: number}} count is refunds, not orders
 */
export function refundedInRange(orders = [], start, end) {
  const from = start == null ? null : new Date(start).getTime();
  const to = end == null ? null : new Date(end).getTime();

  let usd = 0;
  let crc = 0;
  let count = 0;

  for (const order of orders || []) {
    for (const event of orderRefundEvents(order)) {
      const at = new Date(event.at || 0).getTime();
      if (!Number.isFinite(at) || at === 0) continue;
      if (from != null && at < from) continue;
      if (to != null && at >= to) continue;
      usd += event.usd;
      crc += event.crc;
      count += 1;
    }
  }

  return { usd: round2(usd), crc: roundCrc(crc), count };
}
