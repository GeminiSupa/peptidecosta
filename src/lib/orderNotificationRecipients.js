import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { selectWithOptionalPreferences, wantsOrderEmail } from '@/lib/notificationPreferences.mjs';

/**
 * Recipients of the "New Order Received" admin email.
 *
 * The base list comes from ORDER_NOTIFICATION_TO (the owner/ops inboxes, which
 * are not agent logins). Every agent in admin_profiles is added on top unless
 * their order_email_notifications flag is false, so a newly created agent is
 * subscribed automatically without touching an env var.
 */

const splitList = (value = '') => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

export function getBaseOrderNotificationRecipients() {
  return splitList(
    process.env.ORDER_NOTIFICATION_TO || 'omerforce@gmail.com, info@peptidescostarica.net'
  );
}

/** Case-insensitive dedupe that keeps the first spelling of each address. */
function dedupeEmails(emails) {
  const seen = new Set();
  const unique = [];
  for (const email of emails) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(email);
  }
  return unique;
}

export async function getOrderNotificationRecipients() {
  const base = getBaseOrderNotificationRecipients();

  let agents = [];
  try {
    const supabase = getSupabaseAdmin();

    // Ask for the preference columns, but never let a missing one cost the team
    // their order emails — or resurrect an opt-out whose column does exist.
    const { data, error, droppedColumns } = await selectWithOptionalPreferences(
      ['email', 'notifications_enabled', 'order_email_notifications'],
      (columns) => supabase.from('admin_profiles').select(columns)
    );

    if (droppedColumns?.length) {
      console.warn('[Order notification] Missing preference columns, run add-notification-preferences-to-profiles.sql:', droppedColumns.join(', '));
    }

    if (error) throw new Error(error.message);

    // A null flag counts as subscribed — only an explicit false opts an agent out.
    agents = (data || [])
      .filter((profile) => profile?.email && wantsOrderEmail(profile))
      .map((profile) => profile.email.trim());
  } catch (err) {
    // Falls back to the env list alone, so the owner inboxes still get the mail.
    console.warn('[Order notification] Could not load agent recipients:', err.message);
  }

  return dedupeEmails([...base, ...agents]);
}
