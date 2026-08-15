import { getNotificationRecipients } from '@/lib/notificationRecipients.mjs';
import {
  buildLeadAlertParameters,
  LEAD_ALERT_TEMPLATE_LANGUAGE,
  LEAD_ALERT_TEMPLATE_NAME,
} from '@/lib/leadAlertTemplate.mjs';

/**
 * WhatsApp alert for a Google Ads lead.
 *
 * Mirrors the staff order alert in app/api/orders/create: a business-initiated
 * WhatsApp message needs a template Meta has approved, so this posts
 * `alerta_nuevo_lead` rather than free text. Free text only reaches someone who
 * messaged the business number in the last 24 hours, which for an agent waiting
 * on campaign leads is almost never.
 *
 * Only Google Ads leads send this. The storefront "Contáctenos" form posts to
 * the same route, and waking an agent's personal phone for every catalog
 * enquiry is how a useful alert turns into one nobody reads.
 */

const TIMEOUT_MS = 6000;

export async function sendLandingLeadWhatsAppAlerts(supabase, {
  name,
  phone,
  qualification,
  dueAt,
  recipients: suppliedRecipients = null,
}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    console.warn('[leads/contact] WhatsApp credentials are not configured; lead alert skipped.');
    return { sent: 0, failed: 0, deliveries: [], error: 'WhatsApp credentials are not configured' };
  }

  let recipients = Array.isArray(suppliedRecipients) ? suppliedRecipients : [];
  try {
    if (!Array.isArray(suppliedRecipients)) {
      const managed = await getNotificationRecipients(supabase, { channel: 'whatsapp', type: 'adwords_lead' });
      recipients = managed.recipients || [];
    }
  } catch (error) {
    // A missing column means add-adwords-lead-to-notification-recipients.sql has
    // not been run. That is not a reason to fail the lead, which is already saved.
    console.warn('[leads/contact] WhatsApp lead recipients unavailable:', error.message);
    return { sent: 0, failed: 0, deliveries: [], error: error.message };
  }
  if (!recipients.length) return { sent: 0, failed: 0, deliveries: [] };

  const templateName = process.env.LEAD_ALERT_WHATSAPP_TEMPLATE || LEAD_ALERT_TEMPLATE_NAME;
  const templateLanguage = process.env.LEAD_ALERT_WHATSAPP_TEMPLATE_LANGUAGE || LEAD_ALERT_TEMPLATE_LANGUAGE;
  const parameters = buildLeadAlertParameters({ name, qualification, phone, dueAt })
    .map((text) => ({ type: 'text', text }));

  const results = await Promise.allSettled(recipients.map(async ({ destination }) => {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destination,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [{ type: 'body', parameters }],
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || `Meta API returned ${response.status}`);
    return { providerMessageId: result?.messages?.[0]?.id || null };
  }));

  const deliveries = results.map((entry, index) => ({
    channel: 'whatsapp',
    destination: recipients[index].destination,
    label: recipients[index].label || recipients[index].destination,
    status: entry.status === 'fulfilled' ? 'sent' : 'failed',
    providerMessageId: entry.status === 'fulfilled' ? entry.value?.providerMessageId || null : null,
    error: entry.status === 'rejected' ? entry.reason?.message || 'Meta delivery request failed' : null,
  }));
  const failed = results.filter((entry) => entry.status === 'rejected');
  failed.forEach((entry) => console.error('[leads/contact] WhatsApp lead alert failed:', entry.reason?.message));
  return { sent: results.length - failed.length, failed: failed.length, deliveries };
}
