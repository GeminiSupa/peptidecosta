/**
 * The 8 / 2 split, and the bookkeeping that keeps it honest.
 *
 * A sub-user earns 8% of an order they bring in. Their staff member earns a 2%
 * override on the same order. Total commission cost stays at 10% — the override
 * comes out of the 10%, it is not added on top.
 *
 * A staff member never also earns her own rate on a sub-user's order. That falls
 * out of how attribution already works rather than needing a rule: orders carry
 * one sales_agent, and orderBelongsToAgent matches it against one profile. A
 * sub-user's order matches the sub-user, never the parent, so the parent's own
 * commission_rate is never applied to it. The override below is the only way a
 * parent earns from her people.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

import {
  DEFAULT_OVERRIDE_RATE,
  DEFAULT_SUB_USER_RATE,
  isActiveProfile,
  isSubUser,
} from './subUserTier.mjs';

export { DEFAULT_OVERRIDE_RATE, DEFAULT_SUB_USER_RATE };

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Money is compared and paid in cents, so don't carry float dust around. */
const round2 = (value) => Math.round(num(value) * 100) / 100;

export function subUserRateFor(profile) {
  const rate = Number(profile?.commission_rate);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SUB_USER_RATE;
}

export function overrideRateFor(profile) {
  const rate = Number(profile?.override_rate);
  return Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_OVERRIDE_RATE;
}

export function parentCommissionBudgetFor(profile) {
  const rate = Number(profile?.commission_rate);
  return Number.isFinite(rate) && rate > 0
    ? rate
    : DEFAULT_SUB_USER_RATE + overrideRateFor(profile);
}

export function overrideRateForChild(parentProfile, childProfile) {
  return Math.max(0, parentCommissionBudgetFor(parentProfile) - subUserRateFor(childProfile));
}

/**
 * One order, split three ways. `total` is what the order costs the business in
 * commission — the invariant worth protecting is subUser + override === total.
 *
 * An inactive sub-user (pending approval, or suspended) earns nothing, and
 * their parent earns no override either. An invite that has not been approved
 * therefore costs nothing at all.
 */
export function splitOrderCommission({
  amount,
  subUserRate = DEFAULT_SUB_USER_RATE,
  overrideRate = DEFAULT_OVERRIDE_RATE,
  active = true,
} = {}) {
  const sales = num(amount);
  if (!active || sales <= 0) {
    return { subUser: 0, override: 0, total: 0 };
  }

  const override = round2(sales * (num(overrideRate) / 100));
  const subUser = round2(sales * (num(subUserRate) / 100));

  return { subUser, override, total: round2(subUser + override) };
}

/** The override half only, in both currencies, for a week of children's sales. */
export function computeOverrideAmounts({ usdSales = 0, crcSales = 0, overrideRate = DEFAULT_OVERRIDE_RATE } = {}) {
  const rate = num(overrideRate) / 100;
  return {
    overrideUsd: round2(num(usdSales) * rate),
    overrideCrc: round2(num(crcSales) * rate),
  };
}

/**
 * The rate this extra cut was scored at, kept on the payout's copy of the
 * order. Approval re-reads the live order (a refund must drop off) and would
 * otherwise lose the rate. A sub-user line is usually 2%. An affiliate the
 * staff member handles is 5%. Those are not the same number.
 */
export function stampOverrideOrder(order, { rate, name, kind } = {}) {
  const parsed = Number(rate);
  return {
    ...order,
    commission_override_rate: Number.isFinite(parsed) ? parsed : null,
    commission_override_name: name || null,
    commission_override_kind: kind || null,
  };
}

export function readOverrideStamp(order) {
  const rate = Number(order?.commission_override_rate);
  if (!Number.isFinite(rate) || rate < 0) return null;
  return {
    rate,
    name: order.commission_override_name || null,
    kind: order.commission_override_kind || null,
  };
}

/** Copy the saved rate onto a freshly loaded order. The live row does not have it. */
export function reattachOverrideStamps(freshOrders, savedOrders) {
  const savedById = new Map();
  for (const saved of savedOrders || []) {
    if (saved?.id) savedById.set(saved.id, saved);
  }
  return (freshOrders || []).map((order) => {
    const stamp = readOverrideStamp(savedById.get(order?.id));
    if (!stamp) return order;
    return stampOverrideOrder(order, stamp);
  });
}

const resolveOverrideAmounts = (getAmounts) => (
  typeof getAmounts === 'function'
    ? getAmounts
    : (order) => ({ usd: num(order?.total_usd), crc: num(order?.total_crc) })
);

/**
 * Price each order at the rate stored on it, then add. One rate for the whole
 * list is how a 2% line and a 5% line both got paid at 10%.
 * `ok` is false when any order has no rate — those must not be guessed.
 */
export function priceStampedOverrideOrders(orders, getAmounts) {
  const resolve = resolveOverrideAmounts(getAmounts);
  let overrideUsd = 0;
  let overrideCrc = 0;
  let salesUsd = 0;
  let salesCrc = 0;
  const missingRateOrderIds = [];

  for (const order of orders || []) {
    const stamp = readOverrideStamp(order);
    if (!stamp) {
      missingRateOrderIds.push(order?.id || null);
      continue;
    }
    const amounts = resolve(order) || {};
    const usd = num(amounts.usd);
    const crc = num(amounts.crc);
    salesUsd += usd;
    salesCrc += crc;
    const share = computeOverrideAmounts({
      usdSales: usd,
      crcSales: crc,
      overrideRate: stamp.rate,
    });
    overrideUsd += share.overrideUsd;
    overrideCrc += share.overrideCrc;
  }

  return {
    ok: missingRateOrderIds.length === 0,
    missingRateOrderIds,
    overrideUsd: round2(overrideUsd),
    overrideCrc: round2(overrideCrc),
    salesUsd: round2(salesUsd),
    salesCrc: round2(salesCrc),
  };
}

/**
 * The sub-users a staff member currently earns an override on. Pending and
 * suspended children are excluded, which is what makes approval the gate on
 * money rather than merely on login.
 */
export function payableChildrenOf(parentProfile, allProfiles = []) {
  const parentId = parentProfile?.user_id;
  if (!parentId) return [];
  return (allProfiles || []).filter(
    (candidate) =>
      candidate?.parent_agent_id === parentId && isSubUser(candidate) && isActiveProfile(candidate)
  );
}

// ---------------------------------------------------------------------------
// The "already paid" index
// ---------------------------------------------------------------------------

/**
 * weekly-report skips orders that already appear in an approved payout, so an
 * approved week is never re-paid.
 *
 * That guard used to be a single flat Set of order ids, checked for every
 * agent. Correct while one order paid exactly one person — but a sub-user's
 * order legitimately pays two: the sub-user's 8% and their parent's 2%. With a
 * flat set, approving the sub-user's payout first would make the next scan skip
 * that order for the parent too, and her override would disappear with no
 * error and no log line.
 *
 * So the index is keyed per agent. The same order can be outstanding for one
 * person and settled for another, which is exactly the situation the override
 * creates.
 */
export function paidKey(agentEmail, orderId) {
  return `${String(agentEmail || '').trim().toLowerCase()}|${orderId}`;
}

function sameInstant(left, right) {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/**
 * The orders an agent has already been paid for.
 *
 * `excludePeriod` leaves out payouts covering the exact period being scanned.
 * Without it, re-running a week that has already been approved hollows itself
 * out: every order the week's own payout settled looks "already paid", so the
 * rerun reports near-zero sales for a week that really earned money — and then
 * mails that figure to the agent and the accountant. A report for a closed
 * period has to reproduce, not decay each time it is asked for.
 *
 * The cross-period guard is untouched: orders settled by an *earlier* payout
 * stay excluded, which is the double-payment this index exists to prevent.
 */
export function buildPaidOrderIndex(approvedPayouts = [], { excludePeriod = null } = {}) {
  const index = new Set();
  for (const payout of approvedPayouts || []) {
    const email = payout?.agent_email;
    if (!email) continue;
    if (
      excludePeriod
      && sameInstant(payout?.start_date, excludePeriod.startDate)
      && sameInstant(payout?.end_date, excludePeriod.endDate)
    ) continue;
    // Both buckets count as paid for this agent: the orders credited to them
    // directly, and the children's orders their override was calculated on.
    for (const bucket of [payout?.orders_data, payout?.override_orders_data]) {
      if (!Array.isArray(bucket)) continue;
      for (const order of bucket) {
        if (order?.id) index.add(paidKey(email, order.id));
      }
    }
  }
  return index;
}

export function hasBeenPaid(index, agentEmail, orderId) {
  if (!index || !orderId) return false;
  return index.has(paidKey(agentEmail, orderId));
}

/**
 * Group the extra-cut orders by person, so a statement can show
 * "Luis · 7 orders · 2% · you earned $20" instead of one lump sum.
 * Each order is priced at its own saved rate. Lines are not averaged.
 *
 * `getAmounts` is injected rather than imported because resolving an order to
 * USD/CRC needs the live exchange rate, which lives behind an aliased import
 * this module deliberately avoids.
 */
export function buildOverrideBreakdown(orders = [], getAmounts) {
  const resolve = resolveOverrideAmounts(getAmounts);
  const byPerson = new Map();

  for (const order of orders || []) {
    const stamp = readOverrideStamp(order);
    if (!stamp) continue;
    const name = stamp.name || String(order?.sales_agent || '').trim() || 'Sub-user';
    const key = `${stamp.kind || ''}::${name}::${stamp.rate}`;
    const amounts = resolve(order) || {};
    const usd = num(amounts.usd);
    const crc = num(amounts.crc);
    const share = computeOverrideAmounts({
      usdSales: usd,
      crcSales: crc,
      overrideRate: stamp.rate,
    });
    const row = byPerson.get(key) || {
      name,
      kind: stamp.kind,
      overrideRate: stamp.rate,
      ordersCount: 0,
      salesUsd: 0,
      salesCrc: 0,
      overrideUsd: 0,
      overrideCrc: 0,
    };
    row.ordersCount += 1;
    row.salesUsd += usd;
    row.salesCrc += crc;
    row.overrideUsd += share.overrideUsd;
    row.overrideCrc += share.overrideCrc;
    byPerson.set(key, row);
  }

  return [...byPerson.values()]
    .map((row) => ({
      ...row,
      salesUsd: round2(row.salesUsd),
      salesCrc: round2(row.salesCrc),
      overrideUsd: round2(row.overrideUsd),
      overrideCrc: round2(row.overrideCrc),
    }))
    .sort((a, b) => b.overrideUsd - a.overrideUsd);
}
