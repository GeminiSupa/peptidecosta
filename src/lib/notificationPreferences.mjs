/**
 * Per-member notification preferences on admin_profiles.
 *
 * These columns arrive with add-notification-preferences-to-profiles.sql. Until
 * that migration is run every read and write here degrades quietly instead of
 * failing, so deploying the code before running the SQL cannot break member
 * creation or stop the order emails that already work.
 */

export const NOTIFICATION_PREFERENCE_COLUMNS = [
  'notifications_enabled',
  'order_email_notifications',
  'order_whatsapp_notifications',
  'whatsapp_number',
];

/**
 * PostgREST reports an unknown column two different ways: `42703` on a select
 * ("column x does not exist") and `PGRST204` on a write ("Could not find the
 * 'x' column ... in the schema cache"). Both name the column, in both shapes.
 */
export function missingColumnFrom(error) {
  if (!error) return null;
  const message = String(error.message || '');
  const looksMissing =
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /does not exist|schema cache/i.test(message);
  if (!looksMissing) return null;

  const match = message.match(/'([a-z0-9_]+)' column/i) || message.match(/column [a-z_]*\.?([a-z0-9_]+) does not exist/i);
  return match ? match[1] : null;
}

/**
 * Retries a Supabase call, dropping one missing preference column at a time.
 *
 * Dropping the whole set on the first failure is tempting and wrong: if only
 * `notifications_enabled` is absent, discarding `order_email_notifications`
 * along with it silently re-subscribes everyone who had opted out. Only the
 * column the database actually named is removed, and only if it is one of ours
 * — an unknown column outside that list is a real bug and is surfaced.
 */
async function retryWithoutMissingPreferences(initial, remove, has, run) {
  let current = initial;
  const dropped = [];

  for (let attempt = 0; attempt <= NOTIFICATION_PREFERENCE_COLUMNS.length; attempt += 1) {
    const result = await run(current);
    if (!result.error) return { ...result, droppedColumns: dropped };

    const missing = missingColumnFrom(result.error);
    if (!missing || !NOTIFICATION_PREFERENCE_COLUMNS.includes(missing) || !has(current, missing)) {
      return { ...result, droppedColumns: dropped };
    }

    current = remove(current, missing);
    dropped.push(missing);
  }

  return { ...(await run(current)), droppedColumns: dropped };
}

/** Insert or update admin_profiles, tolerating preference columns that are absent. */
export function writeWithOptionalPreferences(payload, run) {
  return retryWithoutMissingPreferences(
    { ...payload },
    (row, column) => {
      const next = { ...row };
      delete next[column];
      return next;
    },
    (row, column) => column in row,
    run
  );
}

/**
 * Select from admin_profiles, tolerating preference columns that are absent.
 * `run` receives a comma-separated column list ready for `.select()`.
 */
export function selectWithOptionalPreferences(columns, run) {
  return retryWithoutMissingPreferences(
    [...columns],
    (cols, column) => cols.filter((name) => name !== column),
    (cols, column) => cols.includes(column),
    (cols) => run(cols.join(', '))
  );
}

/** A member is notifiable unless the master switch is explicitly off. */
export function notificationsEnabled(profile) {
  return profile?.notifications_enabled !== false;
}

/** Order emails: master switch on, and email channel not explicitly off. */
export function wantsOrderEmail(profile) {
  return notificationsEnabled(profile) && profile?.order_email_notifications !== false;
}

/**
 * Order WhatsApp alerts are opt-IN — the old behaviour blasted three hardcoded
 * company numbers, so silence is the correct default until someone turns it on
 * for themselves and supplies a number.
 */
export function wantsOrderWhatsApp(profile) {
  return notificationsEnabled(profile) && profile?.order_whatsapp_notifications === true;
}

/** Digits-only WhatsApp destination, or '' when unusable. */
export function agentWhatsAppNumber(profile) {
  const digits = String(profile?.whatsapp_number || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : '';
}
