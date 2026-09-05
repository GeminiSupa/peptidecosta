/**
 * The Social Reviews settings: everything about review requests that should be
 * changed from the admin panel rather than by editing code.
 *
 * Stored as one row in site_settings (id = 'review_settings'), the same
 * key/value table business_links already uses, so nothing new has to be created
 * in the database.
 *
 * Precedence, first that is actually set:
 *   1. the saved settings row  — what the admin panel writes
 *   2. the environment variable — how each of these was controlled until now,
 *      so a value already set in Vercel keeps working and is not silently
 *      overruled by a default
 *   3. the built-in default
 *
 * Every value is validated on the way out, not only on the way in. The row is
 * hand-editable and a bad number here does not fail loudly — it quietly emails
 * the wrong people, or nobody.
 */

export const REVIEW_SETTINGS_ID = 'review_settings';

/** Order statuses that make an order eligible to be asked for a review. */
export const DEFAULT_TRIGGER_STATUSES = ['Order Complete', 'Completed'];

export const DEFAULT_REVIEW_SETTINGS = {
  // Which orders qualify. Multi-select in the panel: some shops want to ask on
  // "Shipped" too, and that should not need a deploy.
  triggerStatuses: [...DEFAULT_TRIGGER_STATUSES],
  // Days after the order qualifies before the Google/Facebook email goes out.
  waitDays: 2,
  // Days that must pass before the same customer is asked again.
  reaskAfterDays: 180,
  // Asks allowed to someone who never clicks, after which they are flagged.
  maxAsksWithoutClick: 3,
  // Share of new customers sent to Trustpilot rather than Google/Facebook.
  trustpilotSharePct: 50,
  // Hard ceiling on Trustpilot invitations per calendar month.
  trustpilotMonthlyCap: 50,
  // Blank means "use the site's configured business links".
  googleReviewUrl: '',
  facebookReviewUrl: '',
  trustpilotReviewUrl: '',
};

const trimmed = (value) => String(value ?? '').trim();

/**
 * A whole number within bounds, or the fallback.
 *
 * Anything unparseable falls back rather than becoming 0. A typo that turns
 * "180" into "18O" must not start asking every customer every eighteen days,
 * and a blank cap must not silently disable Trustpilot.
 */
function boundedInt(value, { min, max, fallback }) {
  const raw = trimmed(value);
  if (raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  if (rounded < min) return min;
  if (max !== undefined && rounded > max) return max;
  return rounded;
}

/** Only http(s) links are worth storing; anything else is a typo, not a link. */
function safeUrl(value) {
  const raw = trimmed(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? raw : '';
  } catch {
    return '';
  }
}

function statusList(value, fallback) {
  const list = Array.isArray(value)
    ? value
    : String(value ?? '').split(',');
  const cleaned = [...new Set(list.map((s) => trimmed(s)).filter(Boolean))];
  // An empty list would match no order at all and silently stop every review
  // request, which is never what someone clearing a box intends.
  return cleaned.length ? cleaned : fallback;
}

/**
 * The settings in force, from the saved row, the environment and the defaults.
 *
 * @param {object} [stored] - the site_settings value, or null
 * @param {object} [env] - defaults to process.env
 * @returns {typeof DEFAULT_REVIEW_SETTINGS}
 */
export function normalizeReviewSettings(stored, env = process.env) {
  const row = stored && typeof stored === 'object' ? stored : {};
  const d = DEFAULT_REVIEW_SETTINGS;

  // For each field: the row if it has one, else the env var, else the default.
  const pick = (rowValue, envValue) => (
    rowValue === undefined || rowValue === null || trimmed(rowValue) === ''
      ? envValue
      : rowValue
  );

  return {
    triggerStatuses: statusList(
      pick(row.triggerStatuses, env?.REVIEW_TRIGGER_STATUSES),
      [...d.triggerStatuses],
    ),
    waitDays: boundedInt(pick(row.waitDays, env?.REVIEW_REQUEST_DELAY_DAYS), {
      min: 0, max: 365, fallback: d.waitDays,
    }),
    reaskAfterDays: boundedInt(pick(row.reaskAfterDays, env?.REVIEW_REASK_AFTER_DAYS), {
      min: 0, max: 3650, fallback: d.reaskAfterDays,
    }),
    maxAsksWithoutClick: boundedInt(pick(row.maxAsksWithoutClick, env?.REVIEW_MAX_ASKS), {
      min: 1, max: 10, fallback: d.maxAsksWithoutClick,
    }),
    trustpilotSharePct: boundedInt(pick(row.trustpilotSharePct, env?.REVIEW_TRUSTPILOT_SHARE), {
      min: 0, max: 100, fallback: d.trustpilotSharePct,
    }),
    trustpilotMonthlyCap: boundedInt(pick(row.trustpilotMonthlyCap, env?.REVIEW_TRUSTPILOT_MONTHLY_CAP), {
      min: 0, fallback: d.trustpilotMonthlyCap,
    }),
    googleReviewUrl: safeUrl(pick(row.googleReviewUrl, env?.REVIEW_LINK_GOOGLE)),
    facebookReviewUrl: safeUrl(pick(row.facebookReviewUrl, env?.REVIEW_LINK_FACEBOOK)),
    trustpilotReviewUrl: safeUrl(pick(row.trustpilotReviewUrl, env?.REVIEW_LINK_TRUSTPILOT)),
  };
}

/**
 * Read the settings.
 *
 * Never throws and never returns nothing: a database that cannot be reached
 * must leave review requests running on the defaults, not stop them.
 */
export async function getReviewSettings(supabase, env = process.env) {
  if (!supabase) return normalizeReviewSettings(null, env);
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('id', REVIEW_SETTINGS_ID)
      .maybeSingle();
    if (error) {
      console.warn('[reviewSettings] falling back to defaults:', error.message);
      return normalizeReviewSettings(null, env);
    }
    return normalizeReviewSettings(data?.value, env);
  } catch (err) {
    console.warn('[reviewSettings] lookup threw:', err.message);
    return normalizeReviewSettings(null, env);
  }
}

/**
 * Write the settings, normalised first so the panel cannot save a value the
 * rest of the system would then have to defend itself against.
 */
export async function saveReviewSettings(supabase, incoming, env = process.env) {
  // Normalised against an empty environment: what the panel saves must be the
  // literal values shown in it, not values that quietly inherit from Vercel.
  const value = normalizeReviewSettings(incoming, {});
  const { error } = await supabase
    .from('site_settings')
    .upsert({ id: REVIEW_SETTINGS_ID, value }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  return normalizeReviewSettings(value, env);
}
