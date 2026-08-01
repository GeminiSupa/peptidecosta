import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { mergeOrderEmailDestinations, selectWithOptionalPreferences } from '@/lib/notificationPreferences.mjs';
import { getNotificationRecipients } from '@/lib/notificationRecipients.mjs';

/**
 * Recipients of the "New Order Received" admin email.
 *
 * The Notification Settings list covers standalone destinations. Every agent
 * in admin_profiles is added on top unless their member-level order email flag
 * is false, so a newly created agent can be controlled directly from Team
 * Management.
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

export async function getOrderNotificationRecipients() {
  const base = getBaseOrderNotificationRecipients();

  let managedAvailable = false;
  let managedEmails = [];
  let profiles = [];
  try {
    const supabase = getSupabaseAdmin();

    const managed = await getNotificationRecipients(supabase, { channel: 'email', type: 'new_order' });
    if (managed.available) {
      managedAvailable = true;
      managedEmails = managed.recipients.map((entry) => entry.destination);
    }

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

    profiles = data || [];
  } catch (err) {
    // Falls back to whichever list was already readable, so owner inboxes or
    // managed destinations still get the mail.
    console.warn('[Order notification] Could not load agent recipients:', err.message);
  }

  return mergeOrderEmailDestinations({
    base,
    managed: managedEmails,
    managedAvailable,
    profiles,
  });
}
