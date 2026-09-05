/**
 * Which review site one customer is asked for.
 *
 * Reviews all landing on a single site is a weak signal: Google is what shows
 * in search and on the map listing, Facebook is where a social visitor looks,
 * Trustpilot is what the storefront badges quote. Asking one customer for all
 * three is worse than asking for one — a second request reads as nagging, and
 * the reply rate on the first ask is what actually moves. So each completed
 * order is assigned exactly ONE destination.
 *
 * The three are not equal, and the settings reflect that:
 *
 *   Trustpilot is capped, not shared. Its plan will only deliver so many
 *   invitations a month and silently drops the rest, so it takes orders while
 *   the month's allowance lasts and is simply out of the running once it does
 *   not. A percentage for Trustpilot would be meaningless — the cap decides.
 *
 *   Google and Facebook have no limit, so the only real question is how the
 *   remaining customers divide between those two. That is `googleSharePct`.
 *
 * This module only chooses. Delivery differs per site: Trustpilot is triggered
 * by a BCC on the order-complete email and sent by Trustpilot on its own delay,
 * while Google and Facebook go out from the review-requests cron.
 */

/** The sites whose clicks we can actually see, because the email is ours. */
export const TRACKABLE_PLATFORMS = ['google', 'facebook'];

/**
 * Share of the non-Trustpilot customers who are asked for Google.
 *
 * 50 divides them evenly with Facebook. 100 sends them all to Google, 0 all to
 * Facebook.
 */
export const DEFAULT_GOOGLE_SHARE = 50;

/**
 * Trustpilot invitations allowed per calendar month.
 *
 * Measured when this was added: 359 invitations in July and 284 in August,
 * against a free-plan allowance of 50. Everything past the line was dropped at
 * Trustpilot's end while the order was still stamped as invited, so those
 * customers were marked asked and never heard anything.
 */
export const DEFAULT_TRUSTPILOT_MONTHLY_CAP = 50;

function boundedPct(raw, fallback) {
  const value = String(raw ?? '').trim();
  if (value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/**
 * The configured Google share, clamped to 0-100.
 *
 * Anything unparseable falls back to the default rather than to zero — a typo
 * must not silently move every customer to Facebook.
 *
 * @param {object} [env] - defaults to process.env
 */
export function googleShare(env = process.env) {
  return boundedPct(env?.REVIEW_GOOGLE_SHARE, DEFAULT_GOOGLE_SHARE);
}

/**
 * The configured monthly Trustpilot cap, clamped to zero or more.
 *
 * @param {object} [env] - defaults to process.env
 */
export function trustpilotMonthlyCap(env = process.env) {
  const raw = String(env?.REVIEW_TRUSTPILOT_MONTHLY_CAP ?? '').trim();
  if (raw === '') return DEFAULT_TRUSTPILOT_MONTHLY_CAP;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TRUSTPILOT_MONTHLY_CAP;
  return Math.max(0, Math.round(parsed));
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
    // 16777619 via Math.imul, which keeps it a 32-bit int rather than drifting
    // into float territory the way a plain multiply would.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

/**
 * Google or Facebook for this order, by the configured ratio.
 *
 * @param {object} order
 * @param {object} [env]
 * @returns {'google' | 'facebook'}
 */
export function pickSocialPlatform(order, env = process.env) {
  const share = googleShare(env);
  // Checked before hashing so 0 and 100 are exact, with no order slipping
  // through on a bucket collision at the boundary.
  if (share >= 100) return 'google';
  if (share <= 0) return 'facebook';
  return orderBucket(order?.order_number || order?.id) < share ? 'google' : 'facebook';
}

/**
 * The review site this order should be asked for.
 *
 * Trustpilot first while the month's allowance lasts, then the Google/Facebook
 * ratio. Nothing waits for an allowance to reset: once Trustpilot is spent,
 * every remaining order goes to a site that has no limit.
 *
 * @param {object} order - needs order_number, or id as a fallback
 * @param {object} [env] - defaults to process.env
 * @param {object} [usage] - { trustpilotThisMonth } invitations already sent
 * @returns {'trustpilot' | 'google' | 'facebook'}
 */
export function pickReviewPlatform(order, env = process.env, usage = {}) {
  const cap = trustpilotMonthlyCap(env);
  const used = Number(usage?.trustpilotThisMonth);
  const roomLeft = cap > 0 && (!Number.isFinite(used) || used < cap);
  return roomLeft ? 'trustpilot' : pickSocialPlatform(order, env);
}
