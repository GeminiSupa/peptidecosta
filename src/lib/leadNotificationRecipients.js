import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { mergeLeadEmailRecipients } from '@/lib/leadNotifications.mjs';
import { isMissingRecipientsTable, missingRecipientColumn } from '@/lib/notificationRecipients.mjs';

const splitList = (value = '') => String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);

/** Active email destinations with one alert flag set, or null if the flag's column is absent. */
async function destinationsFlagged(supabase, column) {
  const { data, error } = await supabase
    .from('notification_recipients')
    .select(`destination, channel, active, ${column}`)
    .eq('channel', 'email')
    .eq('active', true)
    .eq(column, true);
  if (error) {
    if (isMissingRecipientsTable(error) || missingRecipientColumn(error, column)) return null;
    throw error;
  }
  return (data || []).map((row) => row.destination);
}

/**
 * Who is told about a new lead.
 *
 * Leads from the Google Ads page have their own list, because that campaign goes
 * to one agent while the storefront "Contáctenos" form should keep reaching the
 * usual team — and the three forms all post to this same route, so without the
 * split, putting the campaign's agent on the list would have handed her every
 * storefront enquiry too.
 *
 * An empty Google Ads list falls through to the general one rather than
 * resolving to nobody. The migration deliberately seeds no one, so between the
 * SQL running and somebody being ticked in Team Management there is a window
 * where the strict reading would silently drop every campaign alert.
 */
export async function getLeadNotificationRecipients(assignedAgentEmail = '', { source = '' } = {}) {
  let backup = [];
  let managedAvailable = false;
  try {
    const supabase = getSupabaseAdmin();
    if (source === 'adwords_lp') {
      const adwords = await destinationsFlagged(supabase, 'adwords_lead');
      if (adwords?.length) {
        managedAvailable = true;
        backup = adwords;
      }
    }
    if (!managedAvailable) {
      const general = await destinationsFlagged(supabase, 'new_lead');
      if (general) {
        managedAvailable = true;
        backup = general;
      }
    }
  } catch (error) {
    console.warn('[Lead notification] Backup list unavailable:', error.message);
  }

  const fallback = managedAvailable
    ? []
    : splitList(process.env.LEAD_NOTIFICATION_TO || 'omerforce@gmail.com, info@peptidescostarica.net');
  return mergeLeadEmailRecipients({ assignedAgentEmail, backup, fallback });
}
