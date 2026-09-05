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
 * Three (Omer, 2026-09-05): the original and two more, each a gap apart, so
 * roughly one a year. Someone who ignored three has answered the question, and
 * reaching that point flags them — see reviewIgnoreFlag. Customers who DO click
 * are not bound by this: a click earns the next site, since it suggests the
 * last ask worked.
 */
export const MAX_ASKS_WITHOUT_A_CLICK = 3;

/**
 * Days to wait after an order is completed before asking for a review.
 *
 * Two, not five: the purchase is still fresh, and the Trustpilot half runs on
 * Trustpilot's own delay regardless, so a longer wait here bought nothing.
 * `REVIEW_REQUEST_DELAY_DAYS` overrides it; 0 means the next run after
 * completion.
 */
export const DEFAULT_REQUEST_DELAY_DAYS = 2;

/**
 * @param {object} [env] - defaults to process.env
 * @returns {number} days to wait, never negative
 */
export function reviewRequestDelayDays(env = process.env) {
  const raw = String(env?.REVIEW_REQUEST_DELAY_DAYS ?? '').trim();
  if (raw === '') return DEFAULT_REQUEST_DELAY_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REQUEST_DELAY_DAYS;
  return Math.round(parsed);
}

const days = (ms) => ms / 86400000;

/**
 * Whether this customer has ignored enough review requests to be flagged.
 *
 * Derived from the ask history rather than stored on the customer. There is no
 * customers table to hang a flag on — a customer here is an email address that
 * appears on orders — and a derived flag cannot drift out of step with the
 * asks it describes. Trustpilot asks are excluded: a click on one of those was
 * never visible to us, so counting it as ignored would be counting our own
 * blind spot against the customer.
 *
 * @param {Array} history - the same rows decideReviewAsk takes
 * @returns {{ignored: number, flagged: boolean, label: string}}
 */
export function reviewIgnoreFlag(history = []) {
  const rows = Array.isArray(history) ? history.filter(Boolean) : [];
  const everClicked = rows.some((h) => h.clicked_platform);
  const ignored = everClicked
    ? 0
    : rows.filter((h) => !(Array.isArray(h.platforms) ? h.platforms : []).includes('trustpilot')).length;

  return {
    ignored,
    flagged: ignored >= MAX_ASKS_WITHOUT_A_CLICK,
    label: ignored >= MAX_ASKS_WITHOUT_A_CLICK
      ? `Ignored ${ignored} review requests`
      : '',
  };
}

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
  // Resolved Social Reviews settings, when the caller has them. Passing them
  // beats reading the environment here, so a change in the admin panel takes
  // effect without a deploy. Absent, the environment and defaults still apply,
  // which is what keeps the unit tests honest about the fallback path.
  policy = null,
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

  // A customer nobody has asked yet: the cap and the ratio decide, and they
  // get exactly one site.
  if (asks.length === 0) {
    if (firstChoice === 'trustpilot' && trustpilotHasRoom) {
      return { ask: true, platform: 'trustpilot', offer: ['trustpilot'], reason: 'first ask' };
    }
    const site = TRACKABLE_PLATFORMS.includes(firstChoice) ? firstChoice : 'google';
    return { ask: true, platform: site, offer: [site], reason: 'first ask' };
  }

  // Never two asks close together, whatever else is true. This is the guard
  // that stops a customer who orders weekly from being asked weekly.
  const last = asks[asks.length - 1];
  const gap = Number.isFinite(policy?.reaskAfterDays) ? policy.reaskAfterDays : reaskAfterDays(env);
  if (days(nowMs - last.askedMs) < gap) {
    return no(`asked ${Math.floor(days(nowMs - last.askedMs))}d ago, under the ${gap}d gap`);
  }

  const clicked = new Set(asks.map((a) => a.clicked).filter(Boolean));
  const remaining = TRACKABLE_PLATFORMS.filter((p) => !clicked.has(p));
  const askedTrustpilot = asks.some((a) => a.platforms.includes('trustpilot'));

  if (clicked.size > 0) {
    // They engaged, so they are worth asking again — but only about a site they
    // have not already been to. Still one site: the ratio's preference first
    // when both are still open.
    if (remaining.length > 0) {
      const site = remaining.includes(firstChoice) ? firstChoice : remaining[0];
      return { ask: true, platform: site, offer: [site], reason: `clicked ${[...clicked].join('+')}, offering ${site}` };
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
  const preferred = TRACKABLE_PLATFORMS.includes(firstChoice) ? firstChoice : 'google';
  if (askedTrustpilot && nonTrustpilotAsks === 0) {
    return { ask: true, platform: preferred, offer: [preferred], reason: 'Trustpilot result unknowable, one ask on a site we can see' };
  }

  const maxAsks = Number.isFinite(policy?.maxAsksWithoutClick)
    ? policy.maxAsksWithoutClick
    : MAX_ASKS_WITHOUT_A_CLICK;
  if (nonTrustpilotAsks >= maxAsks) {
    return no(`ignored ${nonTrustpilotAsks} asks`);
  }

  const next = remaining.includes(preferred) ? preferred : (remaining[0] || preferred);
  return { ask: true, platform: next, offer: [next], reason: 'one more ask after the gap' };
}
