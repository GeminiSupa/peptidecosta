/**
 * Which Trustpilot invitations Trustpilot actually delivered — and which ones
 * it silently threw away.
 *
 * WHY THIS EXISTS
 *
 * Trustpilot's plan caps how many invitations it will send in a month. Past
 * that line it accepts the BCC and does nothing: no bounce, no warning, no
 * record on our side. Between June and August 2026 the order-complete email
 * BCC'd 754 invitations against an allowance of 50 a month, so roughly 600
 * customers were never emailed at all.
 *
 * That alone would only have been a wasted opportunity. What made it permanent
 * was the ask history added on 5 Sep 2026: it copied every one of those 754
 * invitations into `review_asks` as "this customer has been asked", including
 * the ~600 that were never sent. `decideReviewAsk` then reads a Trustpilot ask
 * on record and never offers Trustpilot to that customer again. They were
 * locked out on the strength of an email nobody received.
 *
 * WHAT THIS MODULE DECIDES
 *
 * Trustpilot's allowance is first-come-first-served within a month, so within
 * each month the asks are ordered oldest first and the first `allowance` of
 * them are the ones that went out. Everything after the line did not. That is
 * an inference, not a record — nothing on our side can prove it — so the panel
 * says so, and the allowance figure is editable rather than hardcoded.
 *
 * Pure and separate from the route, because this is the arithmetic that decides
 * who gets emailed again. It is unit-tested in tests/review-delivery.test.mjs.
 */

/** What Trustpilot's free plan delivers per month. What June–August ran under. */
export const FREE_PLAN_MONTHLY_ALLOWANCE = 50;

/** What the Starter plan delivers per month, for reference in the panel. */
export const STARTER_PLAN_MONTHLY_ALLOWANCE = 100;

const isTrustpilot = (row) => (Array.isArray(row?.platforms) ? row.platforms : []).includes('trustpilot');

/**
 * The calendar month an ask belongs to, as `YYYY-MM`.
 *
 * UTC, matching `countTrustpilotInvitesThisMonth` in the completion route,
 * which starts its month with setUTCDate(1). The two must agree or the panel
 * would report a different month's usage than the cap actually enforces.
 */
export const monthKeyOf = (iso) => String(iso ?? '').slice(0, 7);

const emailKey = (row) => String(row?.customer_email ?? '').trim().toLowerCase();

/**
 * Split every Trustpilot ask into delivered and never-delivered, by month.
 *
 * @param {Array} rows - review_asks rows (any platform, any order)
 * @param {object} [opts]
 * @param {number} [opts.pastAllowance] - invitations the plan delivered per month
 *        in the months before this one
 * @param {number} [opts.currentAllowance] - the allowance in force this month,
 *        which is the Trustpilot cap set in the panel
 * @param {number|Date} [opts.now]
 * @returns {{months: Array, undelivered: Array, delivered: Array}}
 */
export function splitTrustpilotDelivery(rows = [], {
  pastAllowance = FREE_PLAN_MONTHLY_ALLOWANCE,
  currentAllowance = STARTER_PLAN_MONTHLY_ALLOWANCE,
  now = Date.now(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const thisMonth = monthKeyOf(new Date(nowMs).toISOString());

  const byMonth = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.asked_at || !isTrustpilot(row)) continue;
    const key = monthKeyOf(row.asked_at);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(row);
  }

  const months = [];
  const delivered = [];
  const undelivered = [];

  for (const key of [...byMonth.keys()].sort()) {
    // Oldest first: Trustpilot spends the allowance in the order the BCCs
    // arrive, so the earliest invitations of the month are the ones that went.
    const asks = byMonth.get(key).slice()
      .sort((a, b) => String(a.asked_at).localeCompare(String(b.asked_at)));

    const allowance = Math.max(0, Number(key === thisMonth ? currentAllowance : pastAllowance) || 0);
    const sentOut = asks.slice(0, allowance);
    const dropped = asks.slice(allowance);

    delivered.push(...sentOut);
    undelivered.push(...dropped);

    months.push({
      month: key,
      sent: asks.length,
      allowance,
      delivered: sentOut.length,
      undelivered: dropped.length,
      // A row already released is no longer blocking anyone, so the panel can
      // show progress rather than the same backlog after every release.
      stillBlocked: dropped.filter((r) => !r.released_at).length,
      isCurrentMonth: key === thisMonth,
    });
  }

  return { months, delivered, undelivered };
}

/**
 * The customers who can be given back to Trustpilot, and why the rest cannot.
 *
 * Recoverable means: every Trustpilot ask on this customer's record is one we
 * believe was never delivered, and none of them has been released yet. A
 * customer with even one delivered invitation is left alone — they really were
 * asked, and asking again would be the nagging the history exists to prevent.
 *
 * Customers who ALSO have a Google or Facebook ask are separated out. Releasing
 * their Trustpilot row is still correct, but it will not produce an invitation
 * until the re-ask gap since that other ask has passed, so counting them in
 * with the rest would overstate what a release actually buys.
 *
 * @param {Array} rows - review_asks rows
 * @param {object} [opts] - as splitTrustpilotDelivery, plus reaskAfterDays
 * @returns {{ready: Array, waiting: Array, keptIds: Array}}
 */
export function recoverableCustomers(rows = [], {
  pastAllowance = FREE_PLAN_MONTHLY_ALLOWANCE,
  currentAllowance = STARTER_PLAN_MONTHLY_ALLOWANCE,
  reaskAfterDays = 180,
  now = Date.now(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const { delivered, undelivered } = splitTrustpilotDelivery(rows, { pastAllowance, currentAllowance, now });

  const deliveredTo = new Set(delivered.map(emailKey).filter(Boolean));

  // Every non-Trustpilot ask, so we can tell a customer who is merely waiting
  // out the gap from one who is free to be asked the moment they order again.
  const lastOtherAsk = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.asked_at || isTrustpilot(row)) continue;
    const key = emailKey(row);
    if (!key) continue;
    const at = new Date(row.asked_at).getTime();
    if (!Number.isFinite(at)) continue;
    if (!lastOtherAsk.has(key) || at > lastOtherAsk.get(key)) lastOtherAsk.set(key, at);
  }

  const gapMs = Math.max(0, Number(reaskAfterDays) || 0) * 86400000;
  const byCustomer = new Map();

  for (const row of undelivered) {
    const key = emailKey(row);
    if (!key || row.released_at) continue;
    // They were genuinely invited at some point; the record is not a phantom.
    if (deliveredTo.has(key)) continue;

    if (!byCustomer.has(key)) {
      byCustomer.set(key, { email: key, rowIds: [], lastAskedAt: row.asked_at, orderNumber: row.order_number || '' });
    }
    const entry = byCustomer.get(key);
    entry.rowIds.push(row.id);
    if (String(row.asked_at) > String(entry.lastAskedAt)) {
      entry.lastAskedAt = row.asked_at;
      entry.orderNumber = row.order_number || entry.orderNumber;
    }
  }

  const ready = [];
  const waiting = [];
  for (const entry of byCustomer.values()) {
    const otherAt = lastOtherAsk.get(entry.email);
    const blockedByGap = Number.isFinite(otherAt) && (nowMs - otherAt) < gapMs;
    (blockedByGap ? waiting : ready).push({ ...entry, blockedByGap });
  }

  // Newest first. The purchase is freshest in their mind, and a customer who
  // bought last month is likelier to buy again soon than one who bought in June
  // — and it is the next completed order that carries the invitation.
  const newestFirst = (a, b) => String(b.lastAskedAt).localeCompare(String(a.lastAskedAt));
  ready.sort(newestFirst);
  waiting.sort(newestFirst);

  return { ready, waiting };
}

/**
 * The row ids to release for the next batch.
 *
 * Batched rather than released all at once because a release is only useful to
 * the extent Trustpilot will actually deliver: handing back six hundred
 * customers in a month that can carry a hundred would spend the allowance on
 * whoever happens to order first and leave the rest looking handled. The
 * default batch is the room left in this month's allowance.
 *
 * @param {Array} ready - from recoverableCustomers
 * @param {number} limit - customers to release, not rows
 * @returns {{rowIds: Array<string>, emails: Array<string>}}
 */
export function nextReleaseBatch(ready = [], limit = 0) {
  const take = Math.max(0, Math.floor(Number(limit) || 0));
  const chosen = (Array.isArray(ready) ? ready : []).slice(0, take);
  return {
    rowIds: chosen.flatMap((c) => c.rowIds).filter(Boolean),
    emails: chosen.map((c) => c.email),
  };
}

/**
 * How many invitations this month's allowance still has room for.
 *
 * @param {number} sentThisMonth
 * @param {number} cap
 * @returns {number}
 */
export function roomLeftThisMonth(sentThisMonth, cap) {
  const used = Math.max(0, Number(sentThisMonth) || 0);
  const allowance = Math.max(0, Number(cap) || 0);
  return Math.max(0, allowance - used);
}
