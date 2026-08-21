/** Lowercase keys used to match order.sales_agent to a profile. */
// Defined in agentAttribution.mjs so the attribution unit tests can import it
// without pulling in the `@/` alias this file depends on. Re-exported here so
// existing callers keep working.
export { COMMISSION_ELIGIBLE_ORDER_STATUSES } from './agentAttribution.mjs';
import { COMMISSION_ELIGIBLE_ORDER_STATUSES } from './agentAttribution.mjs';

export function isCommissionEligibleOrder(order) {
  const status = String(order?.status || '').trim().toLowerCase();
  return COMMISSION_ELIGIBLE_ORDER_STATUSES.some(
    (eligibleStatus) => eligibleStatus.toLowerCase() === status
  );
}

export function agentMatchKeys(profile) {
  const keys = new Set();
  if (!profile) return keys;
  const name = String(profile.name || '').trim().toLowerCase();
  const email = String(profile.email || '').trim().toLowerCase();
  if (name) keys.add(name);
  if (email) {
    keys.add(email);
    const local = email.split('@')[0];
    if (local) keys.add(local);
  }
  return keys;
}

/** Order is credited to this agent (for pay / commission). */
export function orderBelongsToAgent(order, profile) {
  if (!order || !profile) return false;
  const orderAgent = String(order.sales_agent || '').trim().toLowerCase();
  if (!orderAgent) return false;
  return agentMatchKeys(profile).has(orderAgent);
}

/** Orders tab: shared order ledger for all admin staff. */
export function filterOrdersVisibleToAgent(orders) {
  return orders || [];
}

/** Strict filter — only orders assigned to this agent (My Pay, earnings). */
export function filterOrdersForAgent(orders, profile) {
  if (!profile || profile.is_superadmin) return orders || [];
  return (orders || []).filter((o) => orderBelongsToAgent(o, profile));
}

import { FALLBACK_EXCHANGE_RATE } from '@/lib/pricing';

export function getOrderSalesAmounts(order, exchangeRate = FALLBACK_EXCHANGE_RATE) {
  let usd = Number(order.total_usd || 0);
  let crc = Number(order.total_crc || 0);
  if (!usd && !crc && order.total != null) {
    const total = Number(order.total || 0);
    if (order.currency === 'USD') usd = total;
    else crc = total;
  }

  // Ensure both currencies are populated symmetrically
  if (usd > 0 && crc === 0) {
    crc = usd * exchangeRate;
  } else if (crc > 0 && usd === 0) {
    usd = crc / exchangeRate;
  }

  // Money given back was never a sale. Netted here rather than at each call
  // site because this is the one function every commission figure is built
  // from — the weekly scan, the approval re-price, and the agent's own
  // earnings screen — and a refund has to reach all three or they disagree
  // about what the same order was worth.
  const refundedUsd = Number(order.refunded_amount_usd || 0);
  const refundedCrc = Number(order.refunded_amount_crc || 0);
  if (refundedUsd > 0 || refundedCrc > 0) {
    usd = Math.max(0, usd - refundedUsd);
    crc = Math.max(0, crc - refundedCrc);
  }

  return { usd, crc };
}

export function orderVisibleToAgent() {
  return true;
}
