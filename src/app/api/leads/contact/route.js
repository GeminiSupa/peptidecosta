import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { resolveLeadOwnerDetailed } from '@/lib/leadOwner';
import { loadLandingLeadSettings, resolveCampaignAgent } from '@/lib/leadCampaignAgent';
import { writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { rateLimit } from '@/lib/rateLimit.mjs';
import nodemailer from 'nodemailer';
import { getTransactionalSmtpConfig, readEnv } from '@/lib/transactionalSmtp';
import { getLeadAlertAudience } from '@/lib/leadNotificationRecipients';
import { sendLandingLeadWhatsAppAlerts } from '@/lib/leadWhatsAppAlert';
import { enqueueAndProcessLeadNotification } from '@/lib/leadNotificationDelivery';
import { responseDeadline } from '@/lib/leadNotifications.mjs';
import {
  hasLandingQualification,
  landingQualificationNotes,
  normalizeLandingQualification,
  normalizeStructuredAnswers,
} from '@/lib/landingLead.mjs';

// The storefront "Contáctenos" form. This replaced the WhatsApp CTAs, so it is
// now the only way a visitor who does not want to check out can reach the team
// from the landing page.
//
// It writes to `catalog_leads` (the CRM Leads tab) rather than
// `customer_inquiries` (the Inquiries tab), because these are sales leads an
// agent is meant to claim and work, not support tickets.

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

async function sendLandingLeadAlert({
  supabase,
  leadId,
  enquiryAt,
  name,
  email,
  phone,
  source,
  qualification,
  campaign,
  assignedAgent,
  dueAt,
  slaMinutes,
}) {
  // Once the outbox migration is present, this creates/claims a durable job.
  // The database trigger already queued the same lead enquiry atomically with
  // the save, so a timeout here is recovered by the cron instead of silently
  // losing Dani's alert. Until the migration is run, preserve the legacy send.
  const queued = await enqueueAndProcessLeadNotification(supabase, {
    leadId,
    enquiryAt,
    source,
  });
  if (queued.available) return { outbox: true, ...queued };

  const smtp = getTransactionalSmtpConfig();
  if (!smtp.configured) {
    console.warn('[leads/contact] Elastic transactional SMTP is not configured; lead alert skipped.');
    return { outbox: false, emailSent: false };
  }

  const { emails: recipients } = await getLeadAlertAudience(supabase, { source, owner: assignedAgent });
  if (!recipients.length) return { outbox: false, emailSent: false };

  const details = landingQualificationNotes(qualification);
  const lines = [
    'New landing-page lead',
    `Name: ${name}`,
    `Email: ${email || 'Not provided'}`,
    `Phone: ${phone || 'Not provided'}`,
    ...details,
    assignedAgent ? `Assigned agent: ${assignedAgent}` : 'Assigned agent: Unassigned — operations follow-up required',
    dueAt ? `Response due: ${new Date(dueAt).toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })} Costa Rica time` : null,
    `Source: ${source}`,
    campaign ? `Campaign: ${campaign}` : null,
  ].filter(Boolean);

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

  // These land in a shared info@ inbox alongside everything else, so the subject
  // has to answer "where from, who, how urgent" before anyone opens it. "New lead
  // assigned to X" said none of that — it read the same whether it came from paid
  // ad traffic on a response clock or the ordinary storefront form.
  //
  // The assigned agent is deliberately kept out of the subject and left in the
  // body: who owns a lead can change, and whether it is auto-assigned at all is
  // still undecided, so the subject should not depend on it.
  const sourceLabel = source === 'adwords_lp' ? 'AdWords lead' : 'Landing-page lead';
  const slaLabel = slaMinutes ? ` (${slaMinutes} min)` : '';

  await transporter.sendMail({
    from,
    to: fromEmail,
    bcc: recipients.join(', '),
    replyTo: email || undefined,
    subject: `${sourceLabel}${slaLabel} — ${name}`,
    text: lines.join('\n'),
    html: `<h2>New landing-page lead</h2><ul>${lines.slice(1).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`,
  });
  return { outbox: false, emailSent: true };
}

// This is posted to from standalone ad landing pages, which are not served
// from this domain, so the browser needs CORS to let the request through.
// It is not a security control — anything can POST here with curl regardless —
// so the actual abuse protection is the per-IP rate limit below.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const withCors = (body, status = 200) => NextResponse.json(body, { status, headers: CORS_HEADERS });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    // 20 leads per 10 minutes per IP. A real landing page sends one; this only
    // ever bites a script.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!rateLimit(`lead-contact:${ip}`, 20)) {
      return withCors({ error: 'rate_limited' }, 429);
    }

    const body = await request.json();
    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phoneRaw = clean(body.phone, 40);
    const language = body.language === 'en' ? 'en' : 'es';
    const source = clean(body.source, 60) || 'contact_form';
    const structuredQualification = normalizeStructuredAnswers(body.qualification_data);
    const qualification = { ...normalizeLandingQualification(body), ...structuredQualification };
    const marketingConsent = body.marketing_consent === true;
    const consentText = clean(body.consent_text, 800);
    const consentVersion = clean(body.consent_version, 40);

    // Ad campaign tracking. catalog_leads has carried these columns all along
    // but nothing was filling them, so a lead from a paid ad was
    // indistinguishable from an organic one and the ad spend could not be
    // judged. An AdWords landing page passes them straight through.
    const utmSource = clean(body.utm_source ?? body.utmSource, 120);
    const utmMedium = clean(body.utm_medium ?? body.utmMedium, 120);
    const utmCampaign = clean(body.utm_campaign ?? body.utmCampaign, 120);
    const referrer = clean(body.referrer, 500) || request.headers.get('referer') || '';

    if (!name) {
      return withCors({ error: 'name_required' }, 400);
    }
    if (email && !EMAIL_RE.test(email)) {
      return withCors({ error: 'email_invalid' }, 400);
    }
    // Either channel is enough to follow up, but with neither there is no lead.
    const phone = phoneRaw ? cleanPhoneNumber(phoneRaw) : '';
    if (!email && !phone) {
      return withCors({ error: 'contact_required' }, 400);
    }
    if (hasLandingQualification(qualification) && !marketingConsent) {
      return withCors({ error: 'consent_required' }, 400);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return withCors({ error: 'server_not_configured' }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const landingSettings = await loadLandingLeadSettings(supabase);

    // Email is the more stable identity, so it wins as the dedupe key when the
    // visitor gives both. This matches how live chat saves its leads.
    const contactMethod = email ? 'email' : 'whatsapp';
    const contactValue = email || phone;

    const { data: existing } = await supabase
      .from('catalog_leads')
      .select('*')
      .eq('contact_value', contactValue)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    // A returning customer goes back to the agent who first closed them. An
    // existing owner is never overwritten — an agent who already claimed this
    // lead outranks anything history says.
    const existingOwner = String(existing?.sales_agent || existing?.owner || existing?.assigned_to || '').trim();
    const resolvedOwner = await resolveLeadOwnerDetailed(supabase, {
      phone,
      email,
      existingOwner,
      label: 'leads/contact',
    });
    let owner = resolvedOwner.agent;
    let assignmentSource = resolvedOwner.source === 'existing' ? 'existing_owner' : resolvedOwner.source;

    // A contact an agent already owns keeps that agent: whoever is mid-conversation
    // outranks the campaign setting, so pointing AdWords at one agent never yanks
    // a lead away from the colleague already working it.
    //
    // Nothing picks up a lead this leaves unowned. That is deliberate: rotation
    // was removed because it had never assigned a single lead in production, and
    // an unowned lead is visible and claimable in the Leads tab, whereas one
    // handed to a deactivated agent looks handled and goes cold.
    if (!owner && hasLandingQualification(qualification)) {
      try {
        const campaignAgent = await resolveCampaignAgent(supabase, landingSettings);
        if (campaignAgent?.name) {
          owner = campaignAgent.name;
          assignmentSource = 'fixed_agent';
        }
      } catch (fixedError) {
        console.warn('[leads/contact] Campaign agent lookup failed; lead saved unassigned:', fixedError.message);
      }
    }

    const dueAt = hasLandingQualification(qualification)
      ? responseDeadline(nowIso, landingSettings.responseSlaMinutes)
      : null;

    // catalog_leads has no name/email/phone columns on the live schema, so the
    // details are always written into `notes` as well. Otherwise an agent
    // opening the lead would see a bare phone number and no name.
    const note = [
      `Contáctenos form (${source})`,
      `Name: ${name}`,
      email ? `Email: ${email}` : null,
      phone ? `Phone (WhatsApp/SMS): ${phone}` : null,
      // Mirrored into the note as well, because `sales_agent` is dropped below
      // if the live table lacks the column — the owner must stay visible.
      assignmentSource === 'order_history' ? `Owner: ${owner} (returning customer — first closed by this agent)` : null,
      assignmentSource === 'crm_lead' ? `Owner: ${owner} (already this agent's lead in the CRM — not a new prospect)` : null,
      assignmentSource === 'fixed_agent' ? `Owner: ${owner} (campaign leads are set to go to this agent)` : null,
      dueAt ? `Response due: ${dueAt}` : null,
      marketingConsent ? `Marketing consent: accepted (${consentVersion || 'version not recorded'})` : null,
      marketingConsent && consentText ? `Consent text: ${consentText}` : null,
      utmCampaign || utmSource
        ? `Campaign: ${[utmSource, utmMedium, utmCampaign].filter(Boolean).join(' / ')}`
        : null,
      ...landingQualificationNotes(qualification),
    ].filter(Boolean).join('\n');

    const payload = {
      contact_method: contactMethod,
      contact_value: contactValue,
      language,
      // A returning contact keeps whatever stage an agent already moved them
      // to; only a genuinely new lead starts at 'New'.
      status: existing?.status && existing.status !== 'New' ? existing.status : 'New',
      notes: existing?.notes ? `${note}\n\n--- Previous CRM notes ---\n${existing.notes}` : note,
      // Written only if the column exists — see the optional list below.
      name: name || null,
      email: email || null,
      phone: phone || null,
      sales_agent: owner || null,
      lead_source: source,
      qualification_data: qualification,
      marketing_consent: marketingConsent,
      consent_at: marketingConsent ? nowIso : null,
      consent_source: marketingConsent ? 'lead_landing_page' : null,
      consent_text: marketingConsent ? consentText : null,
      consent_version: marketingConsent ? consentVersion : null,
      assigned_at: owner ? (existing?.assigned_at || nowIso) : null,
      response_due_at: dueAt,
      ownership_updated_at: owner && !existingOwner ? nowIso : existing?.ownership_updated_at || null,
      ownership_updated_by: owner && !existingOwner ? `system:${assignmentSource || 'history'}` : existing?.ownership_updated_by || null,
      updated_at: nowIso,
      // When they last asked us something, as opposed to when we first met them.
      // A returning contact updates their existing row, so without this their
      // new enquiry keeps the original created_at and sinks down a Leads tab
      // sorted by arrival date — exactly where nobody is looking. updated_at
      // cannot stand in for it: an agent editing a note bumps that too.
      last_enquiry_at: nowIso,
      // Only overwrite the campaign on a lead that actually arrived with one,
      // so a returning visitor coming in organically does not erase the ad
      // that originally won them.
      ...(utmSource ? { utm_source: utmSource } : {}),
      ...(utmMedium ? { utm_medium: utmMedium } : {}),
      ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
      ...(referrer ? { referrer } : {}),
    };

    // These arrive via their own hand-run migrations (or not at all). Dropping
    // them individually keeps a lead from being lost to a schema gap, the same
    // way the team-member save handles admin_profiles.
    const optional = [
      'name', 'email', 'phone', 'sales_agent', 'updated_at',
      'utm_source', 'utm_medium', 'utm_campaign', 'referrer',
      'lead_source', 'qualification_data', 'marketing_consent', 'consent_at', 'consent_source',
      'consent_text', 'consent_version', 'assigned_at', 'response_due_at',
      'ownership_updated_at', 'ownership_updated_by', 'last_enquiry_at',
    ];

    const { data: saved, error } = await writeDroppingMissingColumns(payload, optional, (row) => (
      existing
        ? supabase.from('catalog_leads').update(row).eq('id', existing.id).select('id').maybeSingle()
        : supabase.from('catalog_leads').insert({ ...row, created_at: nowIso }).select('id').maybeSingle()
    ));
    if (error) throw error;

    const leadId = saved?.id || existing?.id;
    if (leadId && owner && !existingOwner && assignmentSource) {
      const { error: eventError } = await supabase.from('lead_assignment_events').insert({
        lead_id: leadId,
        action: 'auto_assigned',
        previous_agent: null,
        new_agent: owner,
        reason: assignmentSource === 'fixed_agent'
          ? 'Landing-page leads are configured to go to a single agent'
          : assignmentSource === 'crm_lead'
            ? 'Already this agent\'s lead in the CRM'
            : 'Returning customer assigned to earliest completed order owner',
        actor_email: 'landing-system@peptidescostarica.net',
      });
      if (eventError) console.warn('[leads/contact] Assignment audit skipped:', eventError.message);
    }

    // Saving the lead is the source of truth. A temporary email-provider issue
    // must never make the browser retry and create duplicate CRM activity.
    let notificationResult = null;
    if (hasLandingQualification(qualification)) {
      try {
        notificationResult = await sendLandingLeadAlert({
          supabase,
          leadId,
          enquiryAt: nowIso,
          name,
          email,
          phone,
          source,
          qualification,
          campaign: [utmSource, utmMedium, utmCampaign].filter(Boolean).join(' / '),
          assignedAgent: owner,
          dueAt,
          slaMinutes: landingSettings.responseSlaMinutes,
        });
      } catch (alertError) {
        console.error('[leads/contact] lead alert failed:', alertError);
      }

      // Campaign leads only. The storefront form reaches this same route, and
      // buzzing an agent's personal phone for every catalog enquiry is how an
      // alert stops being read. Sent after the email and in its own try, so a
      // WhatsApp outage cannot cost us the email as well.
      if (source === 'adwords_lp' && !notificationResult?.outbox) {
        try {
          const { whatsapp } = await getLeadAlertAudience(supabase, { source, owner });
          const result = await sendLandingLeadWhatsAppAlerts(supabase, {
            name, phone, qualification, dueAt, recipients: whatsapp,
          });
          if (result.sent) console.log(`[leads/contact] WhatsApp lead alert sent to ${result.sent} recipient(s)`);
        } catch (whatsAppError) {
          console.error('[leads/contact] WhatsApp lead alert failed:', whatsAppError);
        }
      }
    }

    return withCors({
      success: true,
      leadId: saved?.id || existing?.id || null,
      record: existing ? 'updated' : 'created',
      assignedAgent: owner || null,
      notifications: notificationResult?.outbox
        ? {
          tracked: true,
          status: notificationResult.status || notificationResult.job?.status || 'processing',
          sent: notificationResult.sent ?? null,
          failed: notificationResult.failed ?? null,
        }
        : { tracked: false, status: 'legacy' },
    });
  } catch (err) {
    console.error('[leads/contact] failed:', err);
    return withCors({ error: 'save_failed' }, 500);
  }
}
