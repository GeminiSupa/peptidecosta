import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

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
    const { data, error } = await supabase
      .from('admin_profiles')
      .select('email, order_email_notifications');

    if (error) throw new Error(error.message);

    // A null flag counts as subscribed — only an explicit false opts an agent out.
    agents = (data || [])
      .filter((profile) => profile?.email && profile.order_email_notifications !== false)
      .map((profile) => profile.email.trim());
  } catch (err) {
    // Falls back to the env list alone. Most likely cause is the
    // add-order-email-notifications-to-profiles.sql migration not having run yet.
    console.warn('[Order notification] Could not load agent recipients:', err.message);
  }

  return dedupeEmails([...base, ...agents]);
}
