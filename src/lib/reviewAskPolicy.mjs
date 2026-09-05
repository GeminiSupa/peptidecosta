/**
 * Whether to ask this customer for a review, and on which site.
 *
 * The unit is the CUSTOMER, not the order. Asking per order meant a repeat
 * buyer was asked again every time they bought, on the same site they may have
 * already reviewed. This decides from their whole history of asks.
 *
 * What can actually be known, which shapes every rule below:
 *   - a CLICK on a Google or Facebook button is visible, because those buttons
 *     are in our own email and route through /api/reviews/click
 *   - a click on a Trustpilot invitation is NOT visible: Trustpilot sends that
 *     email itself and we never see it
 *   - whether a review was actually left is never visible on any site
 *
 * So "clicked" is the strongest signal available and is read as "probably
 * reviewed there". A Trustpilot ask can only ever be read as "asked, result
 * unknown".
 */

/** The sites a customer can be pointed at, in the order they are offered. */
export const TRACKABLE_PLATFORMS = ['google', 'facebook'];

/**
 * Days that must pass before someone who ignored an ask is asked again.
 *
 * Six months: long enough that a second ask reads as a fresh conversation
 * rather than a chase, and long enough that most customers never see one.
 */
export const DEFAULT_REASK_AFTER_DAYS = 180;

/**
 * Asks allowed to a customer who has never clicked anything.
 *
 * Two: the original, and one more after the gap. Someone who ignored two asks
 * has answered the question. Customers who DO click are not bound by this —
 * a click earns the next site, since it suggests the last one worked.
 */
export const MAX_ASKS_WITHOUT_A_CLICK = 2;

const days = (ms) => ms / 86400000;

/** Same person, whatever they typed. Not a merge of separate addresses. */
export function normaliseCustomerKey(email) {
  return String(email ?? '').trim().toLowerCase();
}

function reaskAfterDays(env) {
  const raw = String(env?.REVIEW_REASK_AFTER_DAYS ?? '').trim();
  if (raw === '') return DEFAULT_REASK_AFTER_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REASK_AFTER_DAYS;
  return Math.round(parsed);
}

/**
 * Decide the next review ask for one customer.
 *
 * @param {object} input
 * @param {Array<{platforms: string[], clicked_platform?: string|null, asked_at: string}>} input.history
 *        every previous ask for this customer, any order
 * @param {'trustpilot'|'google'} input.firstChoice
 *        what the split and the monthly cap would pick for a brand new customer
 * @param {boolean} [input.trustpilotHasRoom] whether the monthly cap allows Trustpilot now
 * @param {Date|number} [input.now]
 * @param {object} [input.env]
 * @returns {{ask: boolean, platform: 'trustpilot'|'google'|null, offer: string[], reason: string}}
 */
export function decideReviewAsk({
  history = [],
  firstChoice = 'google',
  trustpilotHasRoom = true,
  now = Date.now(),
  env = process.env,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const asks = (Array.isArray(history) ? history : [])
    .filter((h) => h && h.asked_at)
    .map((h) => ({
      platforms: Array.isArray(h.platforms) ? h.platforms.filter(Boolean) : [],
      clicked: h.clicked_platform || null,
      askedMs: new Date(h.asked_at).getTime(),
    }))
    .filter((h) => Number.isFinite(h.askedMs))
    .sort((a, b) => a.askedMs - b.askedMs);

  const no = (reason) => ({ ask: false, platform: null, offer: [], reason });

  // A customer nobody has asked yet: the split and the cap decide.
  if (asks.length === 0) {
    return firstChoice === 'trustpilot' && trustpilotHasRoom
      ? { ask: true, platform: 'trustpilot', offer: ['trustpilot'], reason: 'first ask' }
      : { ask: true, platform: 'google', offer: [...TRACKABLE_PLATFORMS], reason: 'first ask' };
  }

  // Never two asks close together, whatever else is true. This is the guard
  // that stops a customer who orders weekly from being asked weekly.
  const last = asks[asks.length - 1];
  const gap = reaskAfterDays(env);
  if (days(nowMs - last.askedMs) < gap) {
    return no(`asked ${Math.floor(days(nowMs - last.askedMs))}d ago, under the ${gap}d gap`);
  }

  const clicked = new Set(asks.map((a) => a.clicked).filter(Boolean));
  const remaining = TRACKABLE_PLATFORMS.filter((p) => !clicked.has(p));
  const askedTrustpilot = asks.some((a) => a.platforms.includes('trustpilot'));

  if (clicked.size > 0) {
    // They engaged, so they are worth asking again — but only about a site they
    // have not already been to.
    if (remaining.length > 0) {
      return { ask: true, platform: 'google', offer: remaining, reason: `clicked ${[...clicked].join('+')}, offering what is left` };
    }
    if (!askedTrustpilot && trustpilotHasRoom) {
      return { ask: true, platform: 'trustpilot', offer: ['trustpilot'], reason: 'clicked every trackable site, Trustpilot left' };
    }
    return no('every site has been clicked or offered');
  }

  // No click on record.
  //
  // A Trustpilot ask is the one case where "no click" means nothing at all —
  // their click would have been invisible to us. So it does not count towards
  // the ignored-ask limit, and they get one Google/Facebook ask instead.
  const nonTrustpilotAsks = asks.filter((a) => !a.platforms.includes('trustpilot')).length;
  if (askedTrustpilot && nonTrustpilotAsks === 0) {
    return { ask: true, platform: 'google', offer: [...TRACKABLE_PLATFORMS], reason: 'Trustpilot result unknowable, one ask on a site we can see' };
  }

  if (nonTrustpilotAsks >= MAX_ASKS_WITHOUT_A_CLICK) {
    return no(`ignored ${nonTrustpilotAsks} asks`);
  }

  return { ask: true, platform: 'google', offer: remaining.length ? remaining : [...TRACKABLE_PLATFORMS], reason: 'one more ask after the gap' };
}
