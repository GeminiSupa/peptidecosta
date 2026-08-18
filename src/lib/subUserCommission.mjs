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
 * Group a flat list of sub-user orders by who brought them in, so a statement
 * can show "Luis · 7 orders · you earned $38.80" instead of one lump sum.
 *
 * `getAmounts` is injected rather than imported because resolving an order to
 * USD/CRC needs the live exchange rate, which lives behind an aliased import
 * this module deliberately avoids.
 */
export function buildOverrideBreakdown(orders = [], overrideRate = DEFAULT_OVERRIDE_RATE, getAmounts) {
  const resolve = typeof getAmounts === 'function'
    ? getAmounts
    : (order) => ({ usd: num(order?.total_usd), crc: num(order?.total_crc) });

  const byPerson = new Map();
  for (const order of orders || []) {
    const name = String(order?.sales_agent || '').trim() || 'Sub-user';
    const amounts = resolve(order) || {};
    const row = byPerson.get(name) || { name, ordersCount: 0, salesUsd: 0, salesCrc: 0 };
    row.ordersCount += 1;
    row.salesUsd += num(amounts.usd);
    row.salesCrc += num(amounts.crc);
    byPerson.set(name, row);
  }

  return [...byPerson.values()]
    .map((row) => {
      const share = computeOverrideAmounts({
        usdSales: row.salesUsd,
        crcSales: row.salesCrc,
        overrideRate,
      });
      return { ...row, overrideUsd: share.overrideUsd, overrideCrc: share.overrideCrc };
    })
    .sort((a, b) => b.overrideUsd - a.overrideUsd);
}
