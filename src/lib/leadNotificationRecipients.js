import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { leadAlertAudience } from '@/lib/leadAlertAudience.mjs';
import { isMissingRecipientsTable, missingRecipientColumn } from '@/lib/notificationRecipients.mjs';

const splitList = (value = '') => String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);

/**
 * The paid-ad landing pages, as opposed to the storefront forms that post to the
 * same route. Membership decides two things: whether the dedicated Google Ads
 * recipient list is consulted before the general one, and whether an agent's
 * phone is buzzed over WhatsApp.
 *
 * `glp1_lp` is the GLP-1 variant at /glp, a second ad page run alongside /lp so
 * the two can be tested against each other. It was added here because a page
 * missing from this list still saves its leads and still emails, which is
 * exactly why the gap is easy to miss: alerts simply arrive on one channel
 * fewer. Any future landing page needs its source added here too.
 */
const AD_LANDING_SOURCES = new Set(['adwords_lp', 'glp1_lp']);

export const isAdLandingSource = (source = '') => AD_LANDING_SOURCES.has(source);

/**
 * Active rows on both channels with one alert flag set, or null if the flag's
 * column is absent.
 *
 * The label comes back alongside the destination because it is one of the two
 * things tying a row to a team member — see recipientOwnerProfile.
 */
async function rowsFlagged(supabase, column) {
  const { data, error } = await supabase
    .from('notification_recipients')
    .select(`label, destination, channel, active, ${column}`)
    .eq('active', true)
    .eq(column, true);
  if (error) {
    if (isMissingRecipientsTable(error) || missingRecipientColumn(error, column)) return null;
    throw error;
  }
  return (data || []).map((row) => ({
    label: row.label,
    destination: row.destination,
    channel: row.channel,
  }));
}

/**
 * Who is told about a new lead, on both channels.
 *
 * The owning agent is reached on the email and WhatsApp number held in their own
 * Team Management profile, so adding a sales agent needs nothing else ticked
 * anywhere. `notification_recipients` supplies the shared destinations on top,
 * and a row that is one agent's own only fires for that agent's own leads.
 *
 * Leads from the Google Ads page have their own flag, because that campaign goes
 * to one agent while the storefront "Contáctenos" form should keep reaching the
 * usual team — and the three forms all post to the same route, so without the
 * split, putting the campaign's agent on the list would have handed her every
 * storefront enquiry too.
 *
 * An empty Google Ads list falls through to the general one rather than
 * resolving to nobody. The migration deliberately seeds no one, so between the
 * SQL running and somebody being ticked in Team Management there is a window
 * where the strict reading would silently drop every campaign alert.
 */
export async function getLeadAlertAudience(supabase = null, { source = '', owner = '' } = {}) {
  const db = supabase || getSupabaseAdmin();
  let rows = [];
  let profiles = [];
  let managedAvailable = false;

  try {
    if (isAdLandingSource(source)) {
      const adwords = await rowsFlagged(db, 'adwords_lead');
      if (adwords?.length) {
        managedAvailable = true;
        rows = adwords;
      }
    }
    if (!managedAvailable) {
      const general = await rowsFlagged(db, 'new_lead');
      if (general) {
        managedAvailable = true;
        rows = general;
      }
    }
  } catch (error) {
    console.warn('[Lead notification] Backup list unavailable:', error.message);
  }

  try {
    const { data } = await db.from('admin_profiles').select('name, email, whatsapp_number');
    profiles = data || [];
  } catch (error) {
    // Without profiles the owner cannot be reached from their own record, but
    // the shared destinations below still work, so the alert is not lost.
    console.warn('[Lead notification] Team profiles unavailable:', error.message);
  }

  const fallback = managedAvailable
    ? []
    : splitList(process.env.LEAD_NOTIFICATION_TO || 'omerforce@gmail.com, info@peptidescostarica.net');

  return leadAlertAudience({ rows, profiles, owner, fallback });
}
