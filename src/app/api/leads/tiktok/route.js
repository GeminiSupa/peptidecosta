import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { normalizeLeadIdentities } from '@/lib/leadClaim.mjs';
import { responseDeadline } from '@/lib/leadNotifications.mjs';
import {
  enqueueAndProcessLeadNotification,
  sendLeadEmails,
} from '@/lib/leadNotificationDelivery';
import { rateLimit } from '@/lib/rateLimit.mjs';
import {
  isAuthorizedTikTokLeadPost,
  normalizeTikTokLeadPost,
  TIKTOK_ASSIGNEE_EMAIL,
  TIKTOK_LEAD_SOURCE,
  tikTokSubmissionRef,
} from '@/lib/tiktokLeadPosting.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESPONSE_SLA_MINUTES = 15;

const json = (body, status = 200) => NextResponse.json(body, { status });

async function loadTikTokAssignee(supabase) {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('name, email, status, permissions')
    .ilike('email', TIKTOK_ASSIGNEE_EMAIL)
    .maybeSingle();
  if (error) throw error;
  const active = data && (data.status || 'active') === 'active';
  const canWorkLeads = active
    && Array.isArray(data.permissions)
    && data.permissions.includes('leads');
  return canWorkLeads ? data : null;
}

async function identityLeadIds(supabase, identities) {
  const results = await Promise.all(identities.map(async (identity) => {
    const { data, error } = await supabase
      .from('lead_contact_identities')
      .select('lead_id')
      .eq('identity_type', identity.identity_type)
      .eq('identity_value', identity.identity_value)
      .maybeSingle();
    if (error) throw error;
    return data?.lead_id || null;
  }));
  return [...new Set(results.filter(Boolean))];
}

async function loadExistingLead(supabase, identities) {
  const ids = await identityLeadIds(supabase, identities);
  if (ids.length > 1) return { conflict: ids };
  if (!ids.length) return { lead: null };
  const { data, error } = await supabase
    .from('catalog_leads')
    .select('*')
    .eq('id', ids[0])
    .single();
  if (error) throw error;
  return { lead: data };
}

async function recordAssignment(supabase, { leadId, previousAgent, newAgent }) {
  const changed = String(previousAgent || '').trim().toLowerCase()
    !== String(newAgent || '').trim().toLowerCase();
  const { error } = await supabase.from('lead_assignment_events').insert({
    lead_id: leadId,
    action: previousAgent && changed ? 'transferred' : 'auto_assigned',
    previous_agent: previousAgent || null,
    new_agent: newAgent,
    reason: 'TikTok form leads are assigned to Yese',
    actor_email: 'tiktok-leads@peptidescostarica.net',
  });
  if (error) console.warn('[leads/tiktok] Assignment audit skipped:', error.message);
}

function buildNotes(lead, phone) {
  const lines = [
    'TikTok Instant Form',
    `[TikTok lead ID: ${lead.externalLeadId}]`,
    `Name: ${lead.name}`,
    lead.email ? `Email: ${lead.email}` : null,
    phone ? `Phone: ${phone}` : null,
    lead.submittedAt ? `Submitted at: ${lead.submittedAt}` : null,
    lead.campaignId ? `Campaign ID: ${lead.campaignId}` : null,
    lead.campaignName ? `Campaign: ${lead.campaignName}` : null,
    lead.formId ? `Form ID: ${lead.formId}` : null,
    lead.formName ? `Form: ${lead.formName}` : null,
    lead.adId ? `Ad ID: ${lead.adId}` : null,
    lead.adName ? `Ad: ${lead.adName}` : null,
    ...lead.answers.map((answer) => `${answer.question}: ${answer.answer}`),
  ].filter(Boolean);
  return lines.join('\n');
}

export async function POST(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`lead-tiktok:${ip}`, 120)) return json({ error: 'rate_limited' }, 429);

  const secret = process.env.TIKTOK_LEAD_POSTING_SECRET;
  if (!secret) return json({ error: 'posting_not_configured' }, 503);
  if (!isAuthorizedTikTokLeadPost(request.headers.get('authorization'), secret)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const lead = normalizeTikTokLeadPost(await request.json());
    if (!lead.externalLeadId) return json({ error: 'lead_id_required' }, 400);
    if (lead.email && !EMAIL_RE.test(lead.email)) return json({ error: 'email_invalid' }, 400);

    const phone = lead.phone ? cleanPhoneNumber(lead.phone) : '';
    const identities = normalizeLeadIdentities({ email: lead.email, phone });
    if (!identities.length) return json({ error: 'email_or_phone_required' }, 400);

    const supabase = getSupabaseAdmin();
    const assignee = await loadTikTokAssignee(supabase);
    if (!assignee) return json({ error: 'tiktok_assignee_unavailable' }, 503);
    const owner = String(assignee.name || assignee.email).trim();
    const submissionRef = tikTokSubmissionRef(lead.externalLeadId);

    // TikTok and connector retries reuse lead_id. A repeat is acknowledged
    // without touching last_enquiry_at, so it cannot create a second email.
    const { data: duplicate, error: duplicateError } = await supabase
      .from('catalog_leads')
      .select('id, sales_agent')
      .eq('lead_source', TIKTOK_LEAD_SOURCE)
      // Notes retain every prior submission when an existing contact submits a
      // newer form, so an old lead_id stays idempotent instead of becoming
      // repeatable the moment referrer advances to the latest form.
      .ilike('notes', `%[TikTok lead ID: ${lead.externalLeadId}]%`)
      .limit(1)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return json({
        success: true,
        record: 'duplicate',
        leadId: duplicate.id,
        assignedAgent: duplicate.sales_agent || owner,
        notification: 'duplicate_suppressed',
      });
    }

    const existingResult = await loadExistingLead(supabase, identities);
    if (existingResult.conflict) {
      return json({
        error: 'identity_conflict',
        message: 'The supplied phone and email belong to different CRM leads.',
      }, 409);
    }
    const existing = existingResult.lead;
    const nowIso = new Date().toISOString();
    const dueAt = responseDeadline(nowIso, RESPONSE_SLA_MINUTES);
    const contactMethod = existing?.contact_method || (lead.email ? 'email' : 'whatsapp');
    const contactValue = existing?.contact_value || lead.email || phone;
    const displayName = lead.name === 'TikTok lead' && existing?.name
      ? existing.name
      : lead.name;
    const note = buildNotes({ ...lead, name: displayName }, phone);
    const previousOwner = String(existing?.sales_agent || existing?.owner || existing?.assigned_to || '').trim();
    const ownerChanged = previousOwner.toLowerCase() !== owner.toLowerCase();
    const qualification = {
      source: 'TikTok Forms',
      externalLeadId: lead.externalLeadId,
      preferredReplyLanguage: lead.language,
      answers: lead.answers,
    };
    const payload = {
      contact_method: contactMethod,
      contact_value: contactValue,
      name: displayName,
      email: lead.email || existing?.email || null,
      phone: phone || existing?.phone || null,
      language: lead.language,
      status: existing?.status && existing.status !== 'New' ? existing.status : 'New',
      notes: existing?.notes ? `${note}\n\n--- Previous CRM notes ---\n${existing.notes}` : note,
      sales_agent: owner,
      lead_source: TIKTOK_LEAD_SOURCE,
      qualification_data: qualification,
      assigned_at: ownerChanged ? nowIso : existing?.assigned_at || nowIso,
      response_due_at: dueAt,
      ownership_updated_at: ownerChanged ? nowIso : existing?.ownership_updated_at || nowIso,
      ownership_updated_by: ownerChanged ? 'system:tiktok_form' : existing?.ownership_updated_by || 'system:tiktok_form',
      last_enquiry_at: nowIso,
      updated_at: nowIso,
      utm_source: 'tiktok',
      utm_medium: 'lead_form',
      utm_campaign: lead.campaign || null,
      referrer: submissionRef,
      // Absence of consent on this form is not a revocation of consent already
      // captured from the same person elsewhere.
      marketing_consent: lead.marketingConsent || Boolean(existing?.marketing_consent),
      whatsapp_consent: (Boolean(phone) && lead.whatsappConsent) || Boolean(existing?.whatsapp_consent),
      consent_at: lead.marketingConsent || lead.whatsappConsent
        ? nowIso
        : existing?.consent_at || null,
      consent_source: lead.marketingConsent || lead.whatsappConsent
        ? 'tiktok_form'
        : existing?.consent_source || null,
    };

    const query = existing
      ? supabase.from('catalog_leads').update(payload).eq('id', existing.id)
      : supabase.from('catalog_leads').insert({ ...payload, created_at: nowIso });
    const { data: saved, error: saveError } = await query.select('*').single();
    if (saveError) throw saveError;

    if (!existing || ownerChanged) {
      await recordAssignment(supabase, {
        leadId: saved.id,
        previousAgent: previousOwner || null,
        newAgent: owner,
      });
    }

    let notification = { tracked: true, status: 'pending' };
    try {
      const queued = await enqueueAndProcessLeadNotification(supabase, {
        leadId: saved.id,
        enquiryAt: nowIso,
        source: TIKTOK_LEAD_SOURCE,
      });
      if (queued.available) {
        notification = {
          tracked: true,
          status: queued.status || queued.job?.status || 'processing',
          sent: queued.sent ?? null,
          failed: queued.failed ?? null,
        };
      } else {
        const deliveries = await sendLeadEmails({
          recipients: [TIKTOK_ASSIGNEE_EMAIL],
          details: {
            name: displayName,
            email: lead.email,
            phone,
            source: TIKTOK_LEAD_SOURCE,
            qualification,
            campaign: lead.campaign,
            assignedAgent: owner,
            dueAt,
          },
          slaMinutes: RESPONSE_SLA_MINUTES,
        });
        notification = {
          tracked: false,
          status: deliveries.every((delivery) => delivery.status === 'sent') ? 'sent' : 'failed',
        };
      }
    } catch (notificationError) {
      // The database trigger already queued the durable job. A provider outage
      // must not make the connector retry the lead save itself.
      console.error('[leads/tiktok] Immediate notification attempt failed:', notificationError);
    }

    return json({
      success: true,
      record: existing ? 'updated' : 'created',
      leadId: saved.id,
      assignedAgent: owner,
      source: TIKTOK_LEAD_SOURCE,
      notification,
    }, existing ? 200 : 201);
  } catch (error) {
    console.error('[leads/tiktok] Failed:', error);
    if (error?.code === '23505') {
      return json({ error: 'contact_race', message: 'This contact was saved by another request; retry with the same lead_id.' }, 409);
    }
    return json({ error: 'save_failed' }, 500);
  }
}
