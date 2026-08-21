/**
 * Refunding an order: what is allowed, and what it costs the agent.
 *
 * Refunds are issued by hand in Shield Hub Pay. Nothing in here moves money —
 * it records what was given back so the order, the agent's pay and the
 * accountant's books cannot disagree about it.
 *
 * The rule that matters most is the one that stops $100 paid becoming $110
 * refunded. That cannot be a check against a single refund, because an order
 * can be refunded twice; it has to compare the running total against what was
 * actually paid. Both currencies are checked, because either can be the one a
 * staff member typed into.
 *
 * Kept free of '@/lib' imports so tests/ can load it under `node --test`.
 */

import { isPaidLike } from './orderStatusEmails.mjs';

/** Nothing of the order's money is left with us. */
export const ORDER_STATUS_REFUNDED = 'Refunded';

/** Some money was given back; the customer kept the rest. */
export const ORDER_STATUS_PARTLY_REFUNDED = 'Partly Refunded';

/** Rounding that matches how each currency is stored on an order. */
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const roundCrc = (value) => Math.round(Number(value || 0));

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Cents of tolerance when deciding "is this the whole amount?".
 *
 * A colón order's USD figure is a conversion, so asking for exact equality
 * would file a genuine full refund as partial and leave the order looking as
 * though the customer still holds money that they do not.
 */
const FULL_REFUND_TOLERANCE_USD = 0.02;
const FULL_REFUND_TOLERANCE_CRC = 10;

/** What the customer actually paid, in both currencies. */
export function orderPaidAmounts(order) {
  return {
    usd: num(order?.total_usd),
    crc: num(order?.total_crc),
  };
}

/** What has already been given back, in both currencies. */
export function orderRefundedAmounts(order) {
  return {
    usd: num(order?.refunded_amount_usd),
    crc: num(order?.refunded_amount_crc),
  };
}

/**
 * What is still refundable on this order.
 *
 * Never negative: an over-refund recorded before this guard existed should read
 * as "nothing left", not as a credit.
 */
export function refundableRemaining(order) {
  const paid = orderPaidAmounts(order);
  const done = orderRefundedAmounts(order);
  return {
    usd: Math.max(0, round2(paid.usd - done.usd)),
    crc: Math.max(0, roundCrc(paid.crc - done.crc)),
  };
}

/**
 * Can this order be refunded at all?
 *
 * Only money that arrived can be given back. An unpaid or declined order has
 * nothing to return, and a refund recorded against one would be a fiction that
 * the accountant's copy would then carry into the books.
 */
export function orderCanBeRefunded(order) {
  const status = String(order?.status || '');
  if (isRefundStatus(status)) {
    const remaining = refundableRemaining(order);
    return remaining.usd > 0 || remaining.crc > 0;
  }
  return isPaidLike(status);
}

/** True for either refunded status, whatever case it was written in. */
export function isRefundStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return value === ORDER_STATUS_REFUNDED.toLowerCase()
    || value === ORDER_STATUS_PARTLY_REFUNDED.toLowerCase();
}

/**
 * Work out one refund against an order.
 *
 * The caller supplies the amount in the order's own currency; the other
 * currency is derived from the order's own paid pair rather than a live
 * exchange rate, so a refund is always the same proportion of both figures and
 * the two can never drift apart.
 *
 * @param {object} order the order row
 * @param {{amount: number, reason?: string, restoreStock?: boolean}} request
 * @returns {{ok: true, ...}|{ok: false, error: string, status: number}}
 */
export function planRefund(order, { amount, reason = '', restoreStock = false } = {}) {
  if (!order) {
    return { ok: false, status: 404, error: 'Order not found.' };
  }

  const requested = Number(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, status: 400, error: 'Enter a refund amount greater than zero.' };
  }

  if (!orderCanBeRefunded(order)) {
    return {
      ok: false,
      status: 409,
      error: `This order is "${order.status || 'unpaid'}", so there is no payment to refund.`,
    };
  }

  const currency = String(order.currency || 'USD').toUpperCase() === 'CRC' ? 'CRC' : 'USD';
  const paid = orderPaidAmounts(order);
  const remaining = refundableRemaining(order);

  const paidPrimary = currency === 'CRC' ? paid.crc : paid.usd;
  const remainingPrimary = currency === 'CRC' ? remaining.crc : remaining.usd;

  if (paidPrimary <= 0) {
    return { ok: false, status: 409, error: 'This order has no recorded total to refund against.' };
  }

  // The whole point of the feature. Compared against what is LEFT, so a second
  // refund cannot quietly take the total past what the customer ever paid.
  if (requested > remainingPrimary + (currency === 'CRC' ? 0.5 : 0.005)) {
    const already = currency === 'CRC' ? orderRefundedAmounts(order).crc : orderRefundedAmounts(order).usd;
    return {
      ok: false,
      status: 400,
      error: already > 0
        ? `Only ${formatAmount(remainingPrimary, currency)} is left to refund — ${formatAmount(already, currency)} of the ${formatAmount(paidPrimary, currency)} paid has already been given back.`
        : `That is more than the customer paid. The most you can refund is ${formatAmount(paidPrimary, currency)}.`,
    };
  }

  // The share of the order this refund represents, applied to both currencies
  // so the pair stays consistent no matter which one was typed in.
  const share = requested / paidPrimary;
  const refundUsd = currency === 'USD' ? round2(requested) : round2(paid.usd * share);
  const refundCrc = currency === 'CRC' ? roundCrc(requested) : roundCrc(paid.crc * share);

  const totalUsd = round2(orderRefundedAmounts(order).usd + refundUsd);
  const totalCrc = roundCrc(orderRefundedAmounts(order).crc + refundCrc);

  const fullyRefunded = currency === 'CRC'
    ? totalCrc >= paid.crc - FULL_REFUND_TOLERANCE_CRC
    : totalUsd >= paid.usd - FULL_REFUND_TOLERANCE_USD;

  return {
    ok: true,
    currency,
    refundUsd,
    refundCrc,
    totalRefundedUsd: totalUsd,
    totalRefundedCrc: totalCrc,
    fullyRefunded,
    status: fullyRefunded ? ORDER_STATUS_REFUNDED : ORDER_STATUS_PARTLY_REFUNDED,
    // What the customer is left holding, which is what commission is owed on.
    keptUsd: Math.max(0, round2(paid.usd - totalUsd)),
    keptCrc: Math.max(0, roundCrc(paid.crc - totalCrc)),
    reason: String(reason || '').trim().slice(0, 500),
    restoreStock: Boolean(restoreStock),
  };
}

/** Money as a person reads it, for the message a refund is refused with. */
export function formatAmount(value, currency) {
  const amount = Number(value || 0);
  return currency === 'CRC'
    ? `₡${Math.round(amount).toLocaleString('en-US')}`
    : `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The commission an agent must give back because of this refund.
 *
 * The agent earns on what the customer kept, never on what was returned. Two
 * cases, and only one of them owes anything:
 *
 *   - Not yet paid for this order. Nothing is owed. The weekly scan stops
 *     counting a refunded order on its own, because neither refunded status is
 *     commission-eligible, so a partial refund simply re-prices at the kept
 *     amount next time it runs.
 *
 *   - Already paid for this order. The money has gone. The commission on the
 *     refunded portion becomes a debt, taken off the next weekly pay.
 *
 * @param {object} plan the result of planRefund
 * @param {{rate: number, alreadyPaid: boolean}} commission
 * @returns {{owedUsd: number, owedCrc: number}}
 */
export function commissionClawback(plan, { rate = 0, alreadyPaid = false } = {}) {
  if (!plan?.ok || !alreadyPaid) return { owedUsd: 0, owedCrc: 0 };

  const pct = num(rate) / 100;
  if (pct <= 0) return { owedUsd: 0, owedCrc: 0 };

  return {
    owedUsd: round2(plan.refundUsd * pct),
    owedCrc: roundCrc(plan.refundCrc * pct),
  };
}

/**
 * Take what this week's pay can cover off an agent's outstanding debt.
 *
 * A payslip is never negative. Omer's rule: recover what the week can afford,
 * pay zero rather than a negative figure, and carry the rest into the following
 * week. An agent who owes more than they earned is not invoiced for the
 * difference — it simply waits.
 *
 * Debts are consumed oldest-first so a long-standing one cannot be starved by
 * newer arrivals.
 *
 * @param {number} earnedUsd this week's gross pay, before deductions
 * @param {Array<{amount_usd, amount_crc, applied_usd, applied_crc, ...}>} debts
 * @returns {{deductedUsd, deductedCrc, carriedUsd, carriedCrc, applied: Array}}
 */
export function applyCommissionAdjustments(earnedUsd, earnedCrc, debts = []) {
  let budgetUsd = Math.max(0, num(earnedUsd));
  let budgetCrc = Math.max(0, num(earnedCrc));

  let deductedUsd = 0;
  let deductedCrc = 0;
  let carriedUsd = 0;
  let carriedCrc = 0;
  const applied = [];

  const ordered = [...(debts || [])].sort(
    (a, b) => new Date(a?.created_at || 0) - new Date(b?.created_at || 0),
  );

  for (const debt of ordered) {
    const owedUsd = Math.max(0, round2(num(debt?.amount_usd) - num(debt?.applied_usd)));
    const owedCrc = Math.max(0, roundCrc(num(debt?.amount_crc) - num(debt?.applied_crc)));
    if (owedUsd <= 0 && owedCrc <= 0) continue;

    // The USD figure decides how much of the debt this week clears; the colón
    // figure is the same debt expressed differently and moves in step, so the
    // two can never disagree about whether a debt is settled.
    const takeUsd = Math.min(owedUsd, budgetUsd);
    const share = owedUsd > 0 ? takeUsd / owedUsd : (budgetCrc > 0 ? 1 : 0);
    const takeCrc = Math.min(owedCrc, roundCrc(owedCrc * share));

    if (takeUsd > 0 || takeCrc > 0) {
      budgetUsd = round2(budgetUsd - takeUsd);
      budgetCrc = roundCrc(budgetCrc - takeCrc);
      deductedUsd = round2(deductedUsd + takeUsd);
      deductedCrc = roundCrc(deductedCrc + takeCrc);

      applied.push({
        id: debt?.id,
        order_number: debt?.order_number,
        reason: debt?.reason || null,
        amount_usd: round2(takeUsd),
        amount_crc: roundCrc(takeCrc),
        // True when this payout clears the debt outright.
        settles: round2(takeUsd) >= owedUsd - 0.005,
      });
    }

    carriedUsd = round2(carriedUsd + Math.max(0, round2(owedUsd - takeUsd)));
    carriedCrc = roundCrc(carriedCrc + Math.max(0, roundCrc(owedCrc - takeCrc)));
  }

  return {
    deductedUsd,
    deductedCrc,
    carriedUsd,
    carriedCrc,
    // Never below zero, by construction.
    payableUsd: round2(Math.max(0, num(earnedUsd) - deductedUsd)),
    payableCrc: roundCrc(Math.max(0, num(earnedCrc) - deductedCrc)),
    applied,
  };
}
