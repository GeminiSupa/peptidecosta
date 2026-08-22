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

/** Did this order ever become money? Unpaid, declined and cancelled did not. */
export function orderCountsAsSale(order) {
  return REVENUE_ORDER_STATUSES.has(lower(order?.status));
}

/**
 * What the business kept on this order, in both currencies.
 *
 * Zero for anything that never became a sale, and never negative.
 */
export function orderNetRevenue(order) {
  // Covers the fully refunded order too: it is not a sale, so it is worth zero
  // here without depending on refunded_amount having been filled in — which an
  // order marked Refunded by hand would not have.
  if (!orderCountsAsSale(order)) return { usd: 0, crc: 0 };

  const paid = orderPaidAmounts(order);
  const back = orderRefundedAmounts(order);
  return {
    usd: Math.max(0, round2(paid.usd - back.usd)),
    crc: Math.max(0, roundCrc(paid.crc - back.crc)),
  };
}

/** Net revenue in USD alone — the figure most screens show. */
export function orderNetRevenueUsd(order) {
  return orderNetRevenue(order).usd;
}

/** Net revenue across many orders. */
export function totalNetRevenue(orders = []) {
  let usd = 0;
  let crc = 0;
  for (const order of orders || []) {
    const net = orderNetRevenue(order);
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
