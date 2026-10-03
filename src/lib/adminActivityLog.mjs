/**
 * The activity log: who did what, to what, when.
 *
 * Built because an affiliate was receiving the new-order alert for the whole
 * shop and nothing in the system could say when that started or who caused it.
 * Every question of that shape — who changed this price, who added that address,
 * who approved this payout — should be a lookup, not an investigation.
 *
 * Actions only. Not clicks, not keystrokes. Recording typing would capture
 * passwords as they are typed and customers' details inside half-written
 * messages, which is a bigger leak than the one this answers, so the recorder
 * takes a named action and the fields that changed, and nothing else.
 *
 * The table arrives with add-admin-activity-log.sql. Until it is run, every
 * write here reports `available: false` and does nothing: recording must never
 * be the reason an order fails to save.
 *
 * Relative imports only — tests import this directly under `node --test`, which
 * does not resolve the '@/lib' alias.
 */

/** 90 days. A week was rejected: the problem this was built for ran 10 days before anybody noticed. */
export const ADMIN_ACTIVITY_RETENTION_DAYS = 90;

/**
 * Every action the log knows how to describe, and the plain-English sentence
 * each one reads as.
 *
 * `{subject}` is the subject_label — an order number, a product name, an email.
 * An action missing from here still records and still shows; it just reads as
 * its own key, which is ugly rather than broken. Add the wording when you add
 * the action.
 */
export const ADMIN_ACTIVITY_ACTIONS = Object.freeze({
  'session.signed_in': 'signed in',
  'session.sign_in_failed': 'tried to sign in and was refused',

  'account.created': 'created the login {subject}',
  'account.updated': 'changed the login {subject}',
  'account.permissions_changed': "changed what {subject} can reach",
  'account.deleted': 'deleted the login {subject}',
  'account.affiliate_login_created': 'gave affiliate {subject} a login',
  'account.affiliate_login_revoked': "took away affiliate {subject}'s login",
  'account.affiliate_access_changed': "changed what affiliate {subject} can do",
  'account.restricted_to_affiliate': 'cut {subject} back to affiliate-only',

  'notification_recipient.added': 'added {subject} to the alert list',
  'notification_recipient.updated': "changed {subject}'s alerts",
  'notification_recipient.removed': 'removed {subject} from the alert list',

  'order.created': 'created order {subject}',
  'order.updated': 'changed order {subject}',
  'order.owner_changed': 'changed who owns order {subject}',
  'order.refunded': 'refunded order {subject}',

  'customer.updated': 'changed the customer {subject}',
  'customer.deleted': 'deleted the customer {subject}',

  'product.updated': 'changed the product {subject}',
  'product.created': 'added the product {subject}',
  'product.deleted': 'deleted the product {subject}',

  'deal.launched': 'started the deal {subject}',
  'deal.ended': 'ended the deal {subject}',
  'promo.updated': 'changed the promo code {subject}',

  'payout.approved': 'approved the payout for {subject}',
  'payout.settled': 'marked the payout for {subject} as paid',
});

const text = (value) => String(value ?? '').trim();

/** One line of plain English for a log row, with no account named. */
export function describeActivityAction(row) {
  const template = ADMIN_ACTIVITY_ACTIONS[row?.action];
  const subject = text(row?.subject_label);
  if (!template) return `${text(row?.action) || 'did something'}${subject ? ` — ${subject}` : ''}`;
  return template.replace('{subject}', subject || 'it');
}

/** The whole line, the way the Activity Log tab reads it out. */
export function describeActivity(row) {
  const who = text(row?.actor_name) || text(row?.actor_email) || 'Somebody';
  return `${who} ${describeActivityAction(row)}`;
}

/**
 * What actually changed, as { field: { from, to } }.
 *
 * Only the named fields, and only the ones that really differ, so a save that
 * touched one price does not record forty unchanged columns. Values are
 * stringified and capped: this is a record of a change, never a second copy of
 * the row — a log that quietly accumulates customer addresses is the thing this
 * feature exists to prevent.
 */
const MAX_VALUE = 200;

export function summariseChanges(before, after, fields = []) {
  const detail = {};
  for (const field of fields) {
    const from = before?.[field];
    const to = after?.[field];
    if (to === undefined) continue; // not part of this save at all
    const a = from === null || from === undefined ? '' : String(from);
    const b = to === null || to === undefined ? '' : String(to);
    if (a === b) continue;
    detail[field] = { from: a.slice(0, MAX_VALUE), to: b.slice(0, MAX_VALUE) };
  }
  return Object.keys(detail).length ? detail : null;
}

/** The sensitive keys a detail object must never carry, whatever a caller passes. */
const FORBIDDEN_DETAIL = /pass|secret|token|key|cvv|card|cedula|id_number/i;

/**
 * Strip anything that looks like a credential or an identity document.
 *
 * A caller naming such a field is a mistake rather than an attack, but a log is
 * exactly the wrong place to find out: it is long-lived, it is read by people
 * and it would then need the protection the original field had.
 */
export function redactDetail(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const kept = {};
  for (const [field, value] of Object.entries(detail)) {
    if (FORBIDDEN_DETAIL.test(field)) {
      kept[field] = 'hidden';
      continue;
    }
    kept[field] = value;
  }
  return Object.keys(kept).length ? kept : null;
}

/** PostgREST says "no such table" two different ways. */
export function isMissingActivityTable(error) {
  if (!error) return false;
  const message = String(error.message || '');
  return (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || (/admin_activity_log/i.test(message) && /does not exist|schema cache|could not find/i.test(message))
  );
}

/** The ISO instant rows older than which are past the retention period. */
export function activityCutoffIso(now = new Date(), days = ADMIN_ACTIVITY_RETENTION_DAYS) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** The caller's address and browser, for the two columns that hold them. */
export function requestOrigin(request) {
  const headers = request?.headers;
  if (!headers || typeof headers.get !== 'function') return { ip: null, userAgent: null };
  const forwarded = text(headers.get('x-forwarded-for'));
  return {
    ip: (forwarded ? forwarded.split(',')[0].trim() : text(headers.get('x-real-ip'))) || null,
    userAgent: text(headers.get('user-agent')).slice(0, 300) || null,
  };
}

/**
 * The row a recorded action becomes.
 *
 * Split out from the write so it can be tested without a database, and so the
 * shape is in one place when a new caller is added.
 */
export function buildActivityRow({
  actor, action, subjectType = null, subjectId = null, subjectLabel = null,
  detail = null, request = null, at = null,
} = {}) {
  const { ip, userAgent } = requestOrigin(request);
  return {
    ...(at ? { at } : {}),
    actor_user_id: actor?.user_id || null,
    actor_email: text(actor?.email) || null,
    actor_name: text(actor?.name) || null,
    actor_tier: text(actor?.tier) || null,
    action: text(action),
    subject_type: subjectType ? text(subjectType) : null,
    subject_id: subjectId ? text(subjectId).slice(0, 200) : null,
    subject_label: subjectLabel ? text(subjectLabel).slice(0, 200) : null,
    detail: redactDetail(detail),
    ip,
    user_agent: userAgent,
  };
}

/**
 * Record one action. Never throws, never fails the caller.
 *
 * An unrecorded action is a gap in a log; a thrown error here would be an order
 * that did not save. The log is the less important of the two, every time, so
 * everything is caught and logged to the console instead.
 */
export async function recordAdminActivity(supabase, entry = {}) {
  if (!supabase || !text(entry.action)) return { recorded: false };
  try {
    const { error } = await supabase.from('admin_activity_log').insert(buildActivityRow(entry));
    if (error) {
      if (isMissingActivityTable(error)) {
        console.warn('[activity-log] Not recording yet — run add-admin-activity-log.sql in Supabase.');
        return { recorded: false, available: false };
      }
      console.warn('[activity-log] Could not record', entry.action, '-', error.message);
      return { recorded: false };
    }
    return { recorded: true };
  } catch (err) {
    console.warn('[activity-log] Could not record', entry.action, '-', err.message);
    return { recorded: false };
  }
}

/**
 * Record a sign-in, unless this account already has one in the last window.
 *
 * Sign-in cannot be recorded server-side where it happens — the login goes to
 * Supabase directly and never reaches this app — so it is reported by the page
 * that just signed in. A page that re-checks its session on every load would
 * otherwise write a row each time, and a log of 40 "signed in" lines for one
 * morning is a log nobody reads.
 *
 * Collapsing by a window rather than by "is there a session open" on purpose:
 * there is nothing on the server that knows when a session ended, and inventing
 * one here would be a second, worse answer to a question the log need not ask.
 */
export async function recordSignInOnce(supabase, { actor, request, windowMinutes = 30 } = {}) {
  if (!supabase || !actor?.email) return { recorded: false };
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('admin_activity_log')
      .select('id')
      .eq('actor_email', actor.email)
      .eq('action', 'session.signed_in')
      .gte('at', since)
      .limit(1);
    // A failed check must not swallow the sign-in: better a duplicate row than
    // a missing one, so only a definite recent hit skips the write.
    if (!error && (data || []).length > 0) return { recorded: false, skipped: 'already_recorded' };
  } catch {
    // fall through and record it
  }
  return recordAdminActivity(supabase, {
    actor,
    action: 'session.signed_in',
    subjectType: 'session',
    subjectLabel: actor.email,
    request,
  });
}

/** Delete everything past the retention period. Returns how many went. */
export async function purgeOldActivity(supabase, { now = new Date(), limit = 5000 } = {}) {
  if (!supabase) return { ok: false, error: 'no database client' };
  const cutoff = activityCutoffIso(now);
  try {
    // Chosen by id first so one run can be capped: a delete with a plain filter
    // cannot be limited, and an unbounded one on a log left to grow is the kind
    // of statement that times out and clears nothing.
    const { data, error: readError } = await supabase
      .from('admin_activity_log')
      .select('id')
      .lt('at', cutoff)
      .limit(limit);
    if (readError) {
      if (isMissingActivityTable(readError)) return { ok: true, purged: 0, available: false };
      return { ok: false, error: readError.message };
    }
    const ids = (data || []).map((row) => row.id);
    if (!ids.length) return { ok: true, purged: 0, cutoff };

    const { error } = await supabase.from('admin_activity_log').delete().in('id', ids);
    if (error) return { ok: false, error: error.message };
    return { ok: true, purged: ids.length, cutoff };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
