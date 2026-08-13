import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { mergeLeadEmailRecipients } from '@/lib/leadNotifications.mjs';
import { isMissingRecipientsTable, missingRecipientColumn } from '@/lib/notificationRecipients.mjs';

const splitList = (value = '') => String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);

export async function getLeadNotificationRecipients(assignedAgentEmail = '') {
  let backup = [];
  let managedAvailable = false;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('notification_recipients')
      .select('destination, channel, active, new_lead')
      .eq('channel', 'email')
      .eq('active', true)
      .eq('new_lead', true);
    if (error) {
      if (!isMissingRecipientsTable(error) && !missingRecipientColumn(error, 'new_lead')) throw error;
    } else {
      managedAvailable = true;
      backup = (data || []).map((row) => row.destination);
    }
  } catch (error) {
    console.warn('[Lead notification] Backup list unavailable:', error.message);
  }

  const fallback = managedAvailable
    ? []
    : splitList(process.env.LEAD_NOTIFICATION_TO || 'omerforce@gmail.com, info@peptidescostarica.net');
  return mergeLeadEmailRecipients({ assignedAgentEmail, backup, fallback });
}

