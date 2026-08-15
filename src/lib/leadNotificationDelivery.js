import nodemailer from 'nodemailer';
import { getLeadNotificationRecipients } from '@/lib/leadNotificationRecipients';
import { getNotificationRecipients } from '@/lib/notificationRecipients.mjs';
import { landingQualificationNotes } from '@/lib/landingLead.mjs';
import { sendLandingLeadWhatsAppAlerts } from '@/lib/leadWhatsAppAlert';
import { getTransactionalSmtpConfig, readEnv } from '@/lib/transactionalSmtp';

const RETRY_MINUTES = [1, 5, 15, 60, 240];

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function isLeadNotificationOutboxMissing(error) {
  const message = String(error?.message || '');
  return error?.code === '42P01'
    || error?.code === 'PGRST202'
    || error?.code === 'PGRST205'
    || /lead_notification_(jobs|deliveries)|claim_lead_notification_job/i.test(message)
      && /does not exist|schema cache|could not find/i.test(message);
}

const destinationKey = (channel, destination) => `${channel}:${String(destination || '').trim().toLowerCase()}`;
const wasAccepted = (status) => ['sent', 'delivered', 'read'].includes(String(status || '').toLowerCase());

async function assignedAgentEmail(supabase, owner) {
  const wanted = String(owner || '').trim().toLowerCase();
  if (!wanted) return '';
  const { data, error } = await supabase.from('admin_profiles').select('name,email');
  if (error) throw error;
  const profile = (data || []).find((entry) => [entry.name, entry.email]
    .some((value) => String(value || '').trim().toLowerCase() === wanted));
  return String(profile?.email || '').trim().toLowerCase();
}

function leadDetails(lead) {
  const contactMethod = String(lead.contact_method || '').toLowerCase();
  return {
    name: String(lead.name || '').trim() || 'New lead',
    email: String(lead.email || (contactMethod === 'email' ? lead.contact_value : '') || '').trim(),
    phone: String(lead.phone || (contactMethod !== 'email' ? lead.contact_value : '') || '').trim(),
    source: String(lead.lead_source || '').trim() || 'contact_form',
    qualification: lead.qualification_data && typeof lead.qualification_data === 'object'
      ? lead.qualification_data
      : {},
    campaign: [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / '),
    assignedAgent: String(lead.sales_agent || lead.owner || lead.assigned_to || '').trim(),
    dueAt: lead.response_due_at || null,
  };
}

async function sendLeadEmails({ recipients, details, slaMinutes = 15 }) {
  if (!recipients.length) return [];
  const smtp = getTransactionalSmtpConfig();
  if (!smtp.configured) {
    return recipients.map((destination) => ({
      channel: 'email', destination, status: 'failed', providerMessageId: null,
      error: 'Transactional SMTP is not configured',
    }));
  }

  const lines = [
    'New landing-page lead',
    `Name: ${details.name}`,
    `Email: ${details.email || 'Not provided'}`,
    `Phone: ${details.phone || 'Not provided'}`,
    ...landingQualificationNotes(details.qualification),
    details.assignedAgent
      ? `Assigned agent: ${details.assignedAgent}`
      : 'Assigned agent: Unassigned — operations follow-up required',
    details.dueAt
      ? `Response due: ${new Date(details.dueAt).toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })} Costa Rica time`
      : null,
    `Source: ${details.source}`,
    details.campaign ? `Campaign: ${details.campaign}` : null,
  ].filter(Boolean);
  const sourceLabel = details.source === 'adwords_lp' ? 'AdWords lead' : 'Landing-page lead';
  const slaLabel = slaMinutes ? ` (${slaMinutes} min)` : '';
  const fromEmail = readEnv('ORDER_NOTIFICATION_FROM_EMAIL')
    || readEnv('CAMPAIGN_SMTP_FROM_EMAIL')
    || smtp.user;
  const from = readEnv('ORDER_NOTIFICATION_FROM') || `Peptides Costa Rica <${fromEmail}>`;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  const results = await Promise.allSettled(recipients.map(async (destination) => {
    const result = await transporter.sendMail({
      from,
      to: destination,
      replyTo: details.email || undefined,
      subject: `${sourceLabel}${slaLabel} — ${details.name}`,
      text: lines.join('\n'),
      html: `<h2>New landing-page lead</h2><ul>${lines.slice(1).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
    });
    const rejected = (result.rejected || []).map(String).map((value) => value.toLowerCase());
    if (rejected.includes(destination.toLowerCase())) throw new Error('SMTP rejected this recipient');
    return result.messageId || null;
  }));

  return results.map((result, index) => ({
    channel: 'email',
    destination: recipients[index],
    status: result.status === 'fulfilled' ? 'sent' : 'failed',
    providerMessageId: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason?.message || 'SMTP delivery request failed' : null,
  }));
}

async function persistDeliveries(supabase, job, deliveries, existingByKey) {
  if (!deliveries.length) return;
  const now = new Date().toISOString();
  const rows = deliveries.map((delivery) => {
    const previous = existingByKey.get(destinationKey(delivery.channel, delivery.destination));
    return {
      job_id: job.id,
      channel: delivery.channel,
      destination: delivery.destination,
      status: delivery.status,
      attempt_count: Number(previous?.attempt_count || 0) + 1,
      provider_message_id: delivery.providerMessageId || null,
      error_message: delivery.error || null,
      last_attempt_at: now,
      sent_at: delivery.status === 'sent' ? (previous?.sent_at || now) : null,
      updated_at: now,
    };
  });
  const { error } = await supabase.from('lead_notification_deliveries')
    .upsert(rows, { onConflict: 'job_id,channel,destination' });
  if (error) throw error;
}

async function finishJob(supabase, job, intended, deliveries) {
  const intendedKeys = new Set(intended.map((entry) => destinationKey(entry.channel, entry.destination)));
  const relevant = deliveries.filter((entry) => intendedKeys.has(destinationKey(entry.channel, entry.destination)));
  const sent = relevant.filter((entry) => wasAccepted(entry.status)).length;
  const failedRows = relevant.filter((entry) => entry.status === 'failed');
  const failed = failedRows.length + Math.max(0, intended.length - relevant.length);
  const exhausted = Number(job.attempt_count || 0) >= Number(job.max_attempts || 5);
  const allSent = intended.length > 0 && sent === intended.length;
  const status = allSent
    ? 'delivered'
    : exhausted
      ? (sent > 0 ? 'partial' : 'failed')
      : (sent > 0 ? 'partial' : 'pending');
  const delayIndex = Math.min(Math.max(Number(job.attempt_count || 1) - 1, 0), RETRY_MINUTES.length - 1);
  const nextAttemptAt = new Date(Date.now() + RETRY_MINUTES[delayIndex] * 60 * 1000).toISOString();
  const lastError = intended.length === 0
    ? 'No active notification recipients are configured'
    : failedRows.map((entry) => `${entry.channel} ${entry.destination}: ${entry.error_message || 'failed'}`).join('; ').slice(0, 1800) || null;

  const { error } = await supabase.from('lead_notification_jobs').update({
    status,
    next_attempt_at: allSent || exhausted ? job.next_attempt_at : nextAttemptAt,
    locked_at: null,
    last_error: allSent ? null : lastError,
    updated_at: new Date().toISOString(),
  }).eq('id', job.id);
  if (error) throw error;
  return { status, sent, failed, total: intended.length, lastError };
}

export async function deliverClaimedLeadNotificationJob(supabase, job) {
  try {
    const { data: lead, error: leadError } = await supabase
      .from('catalog_leads').select('*').eq('id', job.lead_id).single();
    if (leadError) throw leadError;
    const details = leadDetails(lead);
    const ownerEmail = await assignedAgentEmail(supabase, details.assignedAgent);
    const emailRecipients = await getLeadNotificationRecipients(ownerEmail, { source: details.source });
    const whatsappResult = details.source === 'adwords_lp'
      ? await getNotificationRecipients(supabase, { channel: 'whatsapp', type: 'adwords_lead' })
      : { recipients: [] };
    const whatsappRecipients = whatsappResult.recipients || [];
    const intended = [
      ...emailRecipients.map((destination) => ({ channel: 'email', destination })),
      ...whatsappRecipients.map((recipient) => ({ channel: 'whatsapp', destination: recipient.destination })),
    ];

    const { data: existing, error: existingError } = await supabase
      .from('lead_notification_deliveries').select('*').eq('job_id', job.id);
    if (existingError) throw existingError;
    const existingByKey = new Map((existing || []).map((entry) => [destinationKey(entry.channel, entry.destination), entry]));
    const unsentEmails = emailRecipients.filter((destination) => !wasAccepted(existingByKey.get(destinationKey('email', destination))?.status));
    const unsentWhatsApp = whatsappRecipients.filter((recipient) => !wasAccepted(existingByKey.get(destinationKey('whatsapp', recipient.destination))?.status));

    const emailDeliveries = await sendLeadEmails({ recipients: unsentEmails, details });
    let whatsappDeliveries = [];
    if (details.source === 'adwords_lp' && unsentWhatsApp.length) {
      const result = await sendLandingLeadWhatsAppAlerts(supabase, {
        name: details.name,
        phone: details.phone,
        qualification: details.qualification,
        dueAt: details.dueAt,
        recipients: unsentWhatsApp,
      });
      whatsappDeliveries = result.deliveries || [];
      if (!whatsappDeliveries.length && result.error) {
        whatsappDeliveries = unsentWhatsApp.map((recipient) => ({
          channel: 'whatsapp', destination: recipient.destination, status: 'failed', error: result.error,
        }));
      }
    }
    await persistDeliveries(supabase, job, [...emailDeliveries, ...whatsappDeliveries], existingByKey);

    const { data: finalDeliveries, error: finalError } = await supabase
      .from('lead_notification_deliveries').select('*').eq('job_id', job.id);
    if (finalError) throw finalError;
    return await finishJob(supabase, job, intended, finalDeliveries || []);
  } catch (error) {
    const exhausted = Number(job.attempt_count || 0) >= Number(job.max_attempts || 5);
    const delayIndex = Math.min(Math.max(Number(job.attempt_count || 1) - 1, 0), RETRY_MINUTES.length - 1);
    await supabase.from('lead_notification_jobs').update({
      status: exhausted ? 'failed' : 'pending',
      next_attempt_at: new Date(Date.now() + RETRY_MINUTES[delayIndex] * 60 * 1000).toISOString(),
      locked_at: null,
      last_error: String(error.message || error).slice(0, 1800),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    throw error;
  }
}

export async function processLeadNotificationJob(supabase, jobId) {
  const { data, error } = await supabase.rpc('claim_lead_notification_job', { p_job_id: jobId });
  if (error) {
    if (isLeadNotificationOutboxMissing(error)) return { available: false };
    throw error;
  }
  const job = Array.isArray(data) ? data[0] : data;
  if (!job) {
    const { data: current } = await supabase.from('lead_notification_jobs').select('*').eq('id', jobId).maybeSingle();
    return { available: true, job: current || null, skipped: true };
  }
  const result = await deliverClaimedLeadNotificationJob(supabase, job);
  return { available: true, job, ...result };
}

export async function enqueueAndProcessLeadNotification(supabase, { leadId, enquiryAt, source }) {
  const { data: job, error } = await supabase.from('lead_notification_jobs').upsert({
    lead_id: leadId,
    enquiry_at: enquiryAt,
    source: source || 'contact_form',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'lead_id,enquiry_at' }).select('*').single();
  if (error) {
    if (isLeadNotificationOutboxMissing(error)) return { available: false };
    throw error;
  }
  return processLeadNotificationJob(supabase, job.id);
}
