/**
 * Which review site one customer is asked for.
 *
 * Reviews all landing on a single site is a weak signal: Google is what shows
 * in search and on the map listing, Trustpilot is what the storefront badges
 * quote. Asking every customer for both is worse than asking for one — a second
 * request from the same order reads as nagging, and the reply rate on the first
 * ask is what actually moves. So each completed order is assigned exactly one
 * destination, and the ratio decides how the volume divides.
 *
 * The two destinations are delivered by different machinery, which is why this
 * only returns the choice and never sends anything:
 *   'trustpilot' — the order-complete email is BCC'd to Trustpilot's AFS
 *                  address and Trustpilot sends its own verified invitation on
 *                  its own delay (set in their dashboard, not here).
 *   'google'     — the order is left unstamped so the review-requests cron
 *                  picks it up five days later with the Google/Facebook email.
 */

/**
 * Share of orders sent to Trustpilot, as a percentage.
 *
 * 50 splits the volume evenly. `REVIEW_TRUSTPILOT_SHARE` overrides it without a
 * deploy: 100 restores the old behaviour where every customer went to
 * Trustpilot, 0 sends everyone to Google/Facebook instead.
 */
export const DEFAULT_TRUSTPILOT_SHARE = 50;

/**
 * The configured share, clamped to 0-100.
 *
 * Anything unparseable falls back to the default rather than to zero — a typo
 * in the variable must not silently switch every customer to the other site.
 *
 * @param {object} [env] - defaults to process.env; injectable for tests
 * @returns {number} 0-100
 */
export function trustpilotShare(env = process.env) {
  const raw = String(env?.REVIEW_TRUSTPILOT_SHARE ?? '').trim();
  if (raw === '') return DEFAULT_TRUSTPILOT_SHARE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TRUSTPILOT_SHARE;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/**
 * A stable 0-99 bucket for one order.
 *
 * Deterministic on the order's own reference rather than random, because the
 * decision is read more than once — the completion route decides it, a resend
 * re-reads it, and anyone auditing later needs the same answer. `Math.random()`
 * here would let a re-marked order land in both camps and be asked twice.
 *
 * FNV-1a: short, dependency-free, and well spread over short ASCII keys like
 * "WPCR-MTNGF4MQ", which matters because sequential order numbers share long
 * prefixes and a weaker hash would clump them into the same bucket.
 *
 * @param {string} reference - order_number, or id when there is no number
 * @returns {number} 0-99
 */
export function orderBucket(reference) {
  const key = String(reference ?? '').trim().toLowerCase();
  if (!key) return 0;

  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    // 16777619, as shifts: Math.imul keeps it a 32-bit int rather than drifting
    // into float territory the way a plain multiply would.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

/**
 * How many Trustpilot invitations may go out in one calendar month.
 *
 * Trustpilot's plan caps invitations, and past the cap they are simply not
 * delivered — the shop keeps marking orders as invited while the customer never
 * hears anything, which is worse than not asking. Measured at the time this was
 * added: 359 invites in July and 284 in August, against a free-plan allowance
 * of 50. Even an even split would have sent ~142 a month into that wall.
 *
 * `REVIEW_TRUSTPILOT_MONTHLY_CAP` follows the plan. 0 disables Trustpilot
 * entirely; a very large number effectively removes the ceiling.
 */
export const DEFAULT_TRUSTPILOT_MONTHLY_CAP = 50;

/**
 * The configured monthly cap, clamped to zero or more.
 *
 * @param {object} [env] - defaults to process.env
 * @returns {number}
 */
export function trustpilotMonthlyCap(env = process.env) {
  const raw = String(env?.REVIEW_TRUSTPILOT_MONTHLY_CAP ?? '').trim();
  if (raw === '') return DEFAULT_TRUSTPILOT_MONTHLY_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TRUSTPILOT_MONTHLY_CAP;
  return Math.max(0, Math.round(parsed));
}

/**
 * The review site this order should be asked for.
 *
 * The cap outranks the ratio. Once this month's Trustpilot allowance is spent
 * every remaining order goes to Google and Facebook, so no customer is left
 * with an invitation that was never going to arrive, and nothing stalls waiting
 * for the allowance to reset.
 *
 * @param {object} order - needs order_number, or id as a fallback
 * @param {object} [env] - defaults to process.env
 * @param {object} [usage] - { trustpilotThisMonth } invitations already sent
 * @returns {'trustpilot' | 'google'}
 */
export function pickReviewPlatform(order, env = process.env, usage = {}) {
  const cap = trustpilotMonthlyCap(env);
  const used = Number(usage?.trustpilotThisMonth);
  // An unknown count must not be read as zero: that would spend the whole
  // allowance blind. Unknown means "assume there is room" only because the
  // caller's own fallback already over-counts rather than under-counts.
  if (Number.isFinite(used) && used >= cap) return 'google';
  if (cap <= 0) return 'google';

  const share = trustpilotShare(env);
  // Checked before hashing so a 0 or 100 share is exact, with no order slipping
  // through on a bucket collision at the boundary.
  if (share >= 100) return 'trustpilot';
  if (share <= 0) return 'google';
  return orderBucket(order?.order_number || order?.id) < share ? 'trustpilot' : 'google';
}
