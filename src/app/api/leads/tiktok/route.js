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
import { resolveNextTikTokAgent } from '@/lib/tiktokRoundRobin.mjs';
import { sendLandingLeadWhatsAppAlerts } from '@/lib/leadWhatsAppAlert';
import { chatwootLeadColumns, loadChatwootLeadEnabled, sendAdLeadToChatwoot } from '@/lib/chatwootLead.mjs';
import { writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { resolveLeadOwnerDetailed } from '@/lib/leadOwner';
import { loadLandingLeadSettings, resolveCampaignAgent } from '@/lib/leadCampaignAgent';
import { resolveRotationAgent } from '@/lib/leadRotation.mjs';
import { isUsableDestination, normalizeDestination } from '@/lib/notificationRecipients.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Room for the customer-history retries below (up to 30s) plus the save,
// Chatwoot and alerts that follow — the same budget /api/leads/contact has.
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESPONSE_SLA_MINUTES = 15;

// Same wait as the /lp and /glp-1 forms: if the database does not answer the
// "has this person bought before?" check, keep asking for this long before
// handing the lead to the round robin.
const HISTORY_RETRY_WINDOW_MS = 30_000;
const HISTORY_RETRY_GAP_MS = 3_000;

const json = (body, status = 200) => NextResponse.json(body, { status });

const lower = (value) => String(value ?? '').trim().toLowerCase();

/**
 * The owner's email and WhatsApp from their Team Management profile. Chatwoot
 * matches agents by login email; the WhatsApp number is for the personal ping.
 * CRM owners are stored by name, so the match is by name.
 */
async function loadAgentContact(supabase, { name = '', email = '' }) {
  try {
    const { data } = await supabase.from('admin_profiles').select('name, email, whatsapp_number');
    const match = (data || []).find((profile) => (
      (email && lower(profile.email) === lower(email))
      || (!email && name && lower(profile.name) === lower(name))
    ));
    return {
      email: lower(match?.email || email),
      whatsapp: isUsableDestination('whatsapp', match?.whatsapp_number)
        ? normalizeDestination('whatsapp', match.whatsapp_number)
        : '',
    };
  } catch (error) {
    console.warn('[leads/tiktok] Owner contact lookup failed:', error.message);
    return { email: lower(email), whatsapp: '' };
  }
}

const ASSIGNMENT_REASONS = {
  order_history: 'Returning customer assigned to earliest completed order owner',
  crm_lead: 'Already this agent\'s lead in the CRM',
  fixed_agent: 'Landing-page leads are configured to go to a single agent',
  rotation: 'Next agent in the landing-page lead rotation',
  tiktok_rotation: 'Lead rotation off or empty; TikTok fallback rotation (Pollita, Dani, Korinne)',
};

/**
 * Last resort if none of the three rotation agents are active and working
 * leads right now — the single fixed assignee TikTok leads used to always go
 * to. Better than a lead nobody owns.
 */
async function loadFallbackAssignee(supabase) {
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
  return canWorkLeads ? { name: String(data.name || data.email).trim(), email: String(data.email).trim().toLowerCase() } : null;
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

// Only ever called for a lead that had no owner yet: one that already had an
// agent keeps them (see the caller), so there is no "transferred" case left
// to record here — a TikTok lead's ownership never changes once someone owns it.
async function recordAssignment(supabase, { leadId, newAgent, reason }) {
  const { error } = await supabase.from('lead_assignment_events').insert({
    lead_id: leadId,
    action: 'auto_assigned',
    previous_agent: null,
    new_agent: newAgent,
    reason: reason || ASSIGNMENT_REASONS.tiktok_rotation,
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
        assignedAgent: duplicate.sales_agent || null,
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

    // Owner, in the same order the /lp and /glp-1 forms use:
    //   1. whoever already owns this contact's CRM lead
    //   2. the agent who closed their earliest order, or who owns them as a
    //      lead under another phone/email (resolveLeadOwnerDetailed)
    //   3. the Team > Notification Settings rotation (or fixed agent)
    //   4. only if that yields nobody: the old TikTok rotation, then Yese.
    // A TikTok lead is never left unowned; the connector needs an agent.
    const previousOwner = String(existing?.sales_agent || existing?.owner || existing?.assigned_to || '').trim();
    let owner = previousOwner;
    let assignmentSource = '';
    let rotatedAgent = null;
    if (!owner) {
      const historyStartedAt = Date.now();
      let historyAttempts = 0;
      let resolvedOwner;
      for (;;) {
        historyAttempts += 1;
        resolvedOwner = await resolveLeadOwnerDetailed(supabase, {
          phone,
          email: lead.email,
          label: 'leads/tiktok',
        });
        const elapsed = Date.now() - historyStartedAt;
        if (!resolvedOwner.lookupFailed || elapsed + HISTORY_RETRY_GAP_MS > HISTORY_RETRY_WINDOW_MS) break;
        await new Promise((resolve) => setTimeout(resolve, HISTORY_RETRY_GAP_MS));
      }
      if (resolvedOwner.lookupFailed) {
        console.error(
          `[leads/tiktok] ROUND ROBIN FALLBACK: Supabase did not answer the customer-history check after ${historyAttempts} tries `
            + `(${Math.round((Date.now() - historyStartedAt) / 1000)}s), so this lead goes to the next person in the round robin. `
            + `It may be a returning customer — check who sold to them before. email=${JSON.stringify(lead.email)} phone=${JSON.stringify(phone)}`,
        );
      }
      if (resolvedOwner.agent) {
        owner = resolvedOwner.agent;
        assignmentSource = resolvedOwner.source;
      }
    }
    if (!owner) {
      try {
        const landingSettings = await loadLandingLeadSettings(supabase);
        const campaignAgent = await resolveCampaignAgent(supabase, landingSettings);
        const picked = campaignAgent || await resolveRotationAgent(supabase, landingSettings);
        if (picked?.name) {
          rotatedAgent = picked;
          assignmentSource = campaignAgent ? 'fixed_agent' : 'rotation';
        }
      } catch (assignError) {
        console.warn('[leads/tiktok] Lead rotation lookup failed; using the TikTok fallback:', assignError.message);
      }
      if (!rotatedAgent) {
        rotatedAgent = await resolveNextTikTokAgent(supabase) || await loadFallbackAssignee(supabase);
        assignmentSource = 'tiktok_rotation';
      }
      if (!rotatedAgent) return json({ error: 'tiktok_assignee_unavailable' }, 503);
      owner = rotatedAgent.name;
    }

    const nowIso = new Date().toISOString();
    const dueAt = responseDeadline(nowIso, RESPONSE_SLA_MINUTES);
    const contactMethod = existing?.contact_method || (lead.email ? 'email' : 'whatsapp');
    const contactValue = existing?.contact_value || lead.email || phone;
    const displayName = lead.name === 'TikTok lead' && existing?.name
      ? existing.name
      : lead.name;
    const note = buildNotes({ ...lead, name: displayName }, phone);
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
        newAgent: owner,
        reason: ASSIGNMENT_REASONS[assignmentSource],
      });
    }

    // Email for the Chatwoot assignment, WhatsApp for the personal ping below.
    const ownerContact = await loadAgentContact(supabase, { name: owner, email: rotatedAgent?.email });

    // Same as /lp and /glp-1: Chatwoot is the working inbox, the chat is
    // assigned to the CRM owner, and the Team > Notification Settings switch
    // turns it off. A Chatwoot outage never fails a lead that is already saved.
    let chatwootResult = null;
    const chatwootEnabled = await loadChatwootLeadEnabled(supabase);
    if (chatwootEnabled) {
      const ownerEmail = ownerContact.email;
      chatwootResult = await sendAdLeadToChatwoot({
        leadId: saved.id,
        name: displayName,
        email: lead.email,
        phone,
        source: TIKTOK_LEAD_SOURCE,
        qualificationLines: lead.answers.map((ans) => `${ans.question}: ${ans.answer}`),
        campaign: lead.campaign,
        assigneeEmail: ownerEmail,
        dueAt,
      });
      if (chatwootResult.assignmentError) {
        console.warn('[leads/tiktok] Chatwoot chat left unassigned:', chatwootResult.assignmentError);
      }
      if (!chatwootResult.sent) {
        console.error('[leads/tiktok] Chatwoot lead delivery failed:', chatwootResult.error || 'not configured');
      }
    }
    // Recorded even when the switch is off ('off'), like /lp and /glp-1.
    try {
      const { error: statusError } = await writeDroppingMissingColumns(
        chatwootLeadColumns(chatwootResult, { enabled: chatwootEnabled }),
        ['chatwoot_status', 'chatwoot_error', 'chatwoot_conversation_url', 'chatwoot_synced_at'],
        (row) => (Object.keys(row).length
          ? supabase.from('catalog_leads').update(row).eq('id', saved.id)
          : Promise.resolve({ error: null })),
      );
      if (statusError) console.warn('[leads/tiktok] Chatwoot status not saved:', statusError.message);
    } catch (statusError) {
      console.warn('[leads/tiktok] Chatwoot status not saved:', statusError.message);
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
        // Legacy path only — the outbox table above is what normally sends
        // this. It resolves the audience from the lead's actual owner; this
        // one predates that and only ever knew a single fixed address, so a
        // rotated lead falls back to the ops address rather than silently
        // going nowhere.
        const deliveries = await sendLeadEmails({
          recipients: [rotatedAgent?.email || TIKTOK_ASSIGNEE_EMAIL],
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

    // The personal ping. Only fires when this submission gave the lead its
    // owner (rotation or customer history) — never on a repeat submission to a
    // lead that already had one — and only reaches that one agent's own number,
    // not the shared lead-alert audience the outbox above already emailed.
    const newlyAssigned = !previousOwner && Boolean(owner);
    if (newlyAssigned && ownerContact.whatsapp) {
      try {
        const result = await sendLandingLeadWhatsAppAlerts(supabase, {
          name: displayName,
          phone,
          qualification: { category: lead.campaign || 'TikTok' },
          dueAt,
          recipients: [{ label: owner, destination: ownerContact.whatsapp }],
        });
        if (result.error) console.warn('[leads/tiktok] Round-robin WhatsApp ping skipped:', result.error);
      } catch (whatsAppError) {
        console.error('[leads/tiktok] Round-robin WhatsApp ping failed:', whatsAppError);
      }
    }

    return json({
      success: true,
      record: existing ? 'updated' : 'created',
      leadId: saved.id,
      assignedAgent: owner,
      source: TIKTOK_LEAD_SOURCE,
      chatwoot: {
        enabled: chatwootEnabled,
        configured: chatwootEnabled ? chatwootResult?.configured === true : null,
        sent: chatwootEnabled ? chatwootResult?.sent === true : false,
      },
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
