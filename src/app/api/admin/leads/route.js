import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { resolveLeadOwner } from '@/lib/leadOwner';
import { isActiveProfile, isSubUser } from '@/lib/subUserTier.mjs';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import {
  decideClaimOwner,
  leadActorName,
  mayTransferLead,
  normalizeLeadIdentities,
} from '@/lib/leadClaim.mjs';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

function migrationMissing(error) {
  const message = String(error?.message || '');
  return message.includes('lead_contact_identities')
    || message.includes('lead_assignment_events')
    || message.includes('source_whatsapp_number')
    || message.includes('ownership_updated_');
}

async function agentDirectory(supabase) {
  const { data, error } = await supabase.from('admin_profiles').select('*');
  if (error) throw error;
  const profiles = (data || []).filter((profile) => isActiveProfile(profile) && !isSubUser(profile));
  const byKey = new Map();
  for (const profile of profiles) {
    const canonical = leadActorName(profile);
    if (!canonical) continue;
    for (const key of [profile.name, profile.email, canonical]) {
      const normalized = String(key || '').trim().toLowerCase();
      if (normalized) byKey.set(normalized, canonical);
    }
  }
  return { profiles, byKey };
}

function canonicalAgent(directory, requested) {
  const value = String(requested || '').trim();
  if (!value) return '';
  return directory.byKey.get(value.toLowerCase()) || '';
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

async function loadLead(supabase, leadId) {
  const { data, error } = await supabase
    .from('catalog_leads')
    .select('*')
    .eq('id', leadId)
    .single();
  if (error) throw error;
  return data;
}

async function recordAssignment(supabase, auth, {
  leadId,
  action,
  previousAgent = null,
  newAgent = null,
  reason = null,
}) {
  const { error } = await supabase.from('lead_assignment_events').insert({
    lead_id: leadId,
    action,
    previous_agent: previousAgent || null,
    new_agent: newAgent || null,
    reason: reason || null,
    actor_user_id: auth.user.id,
    actor_email: auth.user.email || null,
  });
  if (error) throw error;
}

function conflictResponse(leadIds) {
  return NextResponse.json({
    error: 'The phone and email point to different existing CRM records. A superadmin must review and merge them before ownership can change.',
    code: 'identity_conflict',
    leadIds,
  }, { status: 409 });
}

async function enrichExistingLead(supabase, lead, input) {
  const patch = {
    updated_at: new Date().toISOString(),
  };
  if (!lead.name && input.name) patch.name = input.name;
  if (!lead.email && input.email) patch.email = input.email;
  if (!lead.phone && input.phone) patch.phone = input.phone;
  if (!lead.source_whatsapp_number && input.sourceWhatsappNumber) {
    patch.source_whatsapp_number = input.sourceWhatsappNumber;
  }
  if (input.notes) {
    const entry = `[Manual CRM entry] ${input.notes}`;
    patch.notes = lead.notes ? `${entry}\n\n${lead.notes}` : entry;
  }
  const { data, error } = await supabase
    .from('catalog_leads')
    .update(patch)
    .eq('id', lead.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const input = {
      name: clean(body.name, 120),
      email: clean(body.email, 200).toLowerCase(),
      phone: clean(body.phone, 40),
      sourceWhatsappNumber: clean(body.sourceWhatsappNumber, 80),
      notes: clean(body.notes, 4000),
      requestedOwner: clean(body.salesAgent, 160),
    };

    if (!input.name) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }
    if (input.email && !EMAIL_RE.test(input.email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }
    if (input.phone) input.phone = cleanPhoneNumber(input.phone);

    const identities = normalizeLeadIdentities(input);
    if (identities.length === 0) {
      return NextResponse.json({ error: 'Enter a valid WhatsApp number or email address' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const directory = await agentDirectory(supabase);
    const actorOwner = leadActorName(auth.profile, auth.user.email);
    const requestedOwner = auth.profile.is_superadmin
      ? canonicalAgent(directory, input.requestedOwner)
      : actorOwner;
    if (auth.profile.is_superadmin && input.requestedOwner && !requestedOwner) {
      return NextResponse.json({ error: 'Selected sales agent is not active' }, { status: 400 });
    }

    const existingIds = await identityLeadIds(supabase, identities);
    if (existingIds.length > 1) return conflictResponse(existingIds);

    if (existingIds.length === 1) {
      let lead = await loadLead(supabase, existingIds[0]);
      const existingOwner = clean(lead.sales_agent || lead.owner || lead.assigned_to, 160);
      const historicalOwner = existingOwner ? '' : await resolveLeadOwner(supabase, {
        phone: input.phone || lead.phone,
        email: input.email || lead.email,
        label: 'admin/leads claim',
      });
      const decision = decideClaimOwner({
        existingOwner,
        historicalOwner,
        actorOwner,
        requestedOwner,
        isSuperadmin: Boolean(auth.profile.is_superadmin),
      });

      if (!existingOwner && decision.owner) {
        const now = new Date().toISOString();
        const { data: claimed, error: claimError } = await supabase
          .from('catalog_leads')
          .update({
            sales_agent: decision.owner,
            ownership_updated_at: now,
            ownership_updated_by: auth.user.email || actorOwner,
            updated_at: now,
          })
          .eq('id', lead.id)
          .is('sales_agent', null)
          .select('*')
          .maybeSingle();
        if (claimError) throw claimError;
        lead = claimed || await loadLead(supabase, lead.id);

        if (claimed) {
          await recordAssignment(supabase, auth, {
            leadId: lead.id,
            action: decision.source === 'order_history' ? 'auto_assigned' : 'claimed',
            newAgent: decision.owner,
            reason: decision.source === 'order_history'
              ? 'Returning customer: earliest completed order owner'
              : 'First CRM claim',
          });
        }
      }

      lead = await enrichExistingLead(supabase, lead, input);
      const finalOwner = clean(lead.sales_agent || decision.owner, 160);
      return NextResponse.json({
        ok: true,
        status: finalOwner === actorOwner ? 'claimed' : 'existing_owned',
        owner: finalOwner || null,
        lead,
        message: finalOwner
          ? `This contact already exists and belongs to ${finalOwner}.`
          : 'This contact already exists and remains unassigned.',
      });
    }

    const historicalOwner = await resolveLeadOwner(supabase, {
      phone: input.phone,
      email: input.email,
      label: 'admin/leads create',
    });
    const decision = decideClaimOwner({
      historicalOwner,
      actorOwner,
      requestedOwner,
      isSuperadmin: Boolean(auth.profile.is_superadmin),
    });
    const now = new Date().toISOString();
    const contactMethod = input.phone ? 'whatsapp' : 'email';
    const contactValue = input.phone || input.email;
    const note = [
      'Manually added through CRM.',
      input.sourceWhatsappNumber ? `WhatsApp line: ${input.sourceWhatsappNumber}` : null,
      input.notes || null,
    ].filter(Boolean).join('\n');

    const { data: created, error: createError } = await supabase
      .from('catalog_leads')
      .insert({
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        contact_method: contactMethod,
        contact_value: contactValue,
        language: 'es',
        status: 'New',
        notes: note,
        sales_agent: decision.owner || null,
        source_whatsapp_number: input.sourceWhatsappNumber || null,
        ownership_updated_at: decision.owner ? now : null,
        ownership_updated_by: decision.owner ? (auth.user.email || actorOwner) : null,
        whatsapp_consent: false,
        marketing_consent: false,
        consent_at: null,
        consent_source: null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();
    if (createError) throw createError;

    // The database trigger registers both identities. Re-read them to catch a
    // simultaneous claim that won the unique identity before this insert did.
    const winners = await identityLeadIds(supabase, identities);
    if (winners.some((leadId) => leadId !== created.id)) {
      await supabase.from('catalog_leads').delete().eq('id', created.id);
      return NextResponse.json({
        error: 'Another agent registered this contact at the same time. Refresh Leads to see the owner.',
        code: 'claim_race',
      }, { status: 409 });
    }

    await recordAssignment(supabase, auth, {
      leadId: created.id,
      action: decision.source === 'order_history' ? 'auto_assigned' : 'created',
      newAgent: decision.owner || null,
      reason: decision.source === 'order_history'
        ? 'Returning customer: earliest completed order owner'
        : 'Created and claimed in CRM',
    });

    return NextResponse.json({
      ok: true,
      status: decision.source === 'order_history' ? 'existing_owned' : 'created',
      owner: decision.owner || null,
      lead: created,
      message: decision.source === 'order_history'
        ? `Lead added, but order history keeps this customer with ${decision.owner}.`
        : `Lead added and assigned to ${decision.owner}.`,
    }, { status: 201 });
  } catch (error) {
    console.error('[admin/leads POST]', error);
    if (migrationMissing(error)) {
      return NextResponse.json({ error: 'Lead claiming is not enabled in the database yet. Run add-lead-claiming.sql first.' }, { status: 503 });
    }
    if (error?.code === '23505') {
      return NextResponse.json({
        error: 'This contact was registered by another request. Refresh Leads to see the existing owner.',
        code: 'claim_race',
      }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Could not add or claim lead' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const leadId = clean(body.leadId, 80);
    const requestedTarget = clean(body.salesAgent, 160);
    const transferReason = clean(body.reason, 500);
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const lead = await loadLead(supabase, leadId);
    const directory = await agentDirectory(supabase);
    const actorOwner = leadActorName(auth.profile, auth.user.email);
    const targetOwner = requestedTarget ? canonicalAgent(directory, requestedTarget) : '';
    if (requestedTarget && !targetOwner) {
      return NextResponse.json({ error: 'Selected sales agent is not active' }, { status: 400 });
    }

    const currentOwner = clean(lead.sales_agent || lead.owner || lead.assigned_to, 160);
    const historicalOwner = currentOwner ? '' : await resolveLeadOwner(supabase, {
      phone: lead.phone || (lead.contact_method !== 'email' ? lead.contact_value : ''),
      email: lead.email || (lead.contact_method === 'email' ? lead.contact_value : ''),
      label: 'admin/leads transfer',
    });
    const decision = mayTransferLead({
      currentOwner,
      historicalOwner,
      targetOwner,
      actorOwner,
      isSuperadmin: Boolean(auth.profile.is_superadmin),
    });

    if (!decision.allowed) {
      const owner = currentOwner || historicalOwner;
      return NextResponse.json({
        error: owner
          ? `This lead belongs to ${owner}. Only a superadmin can transfer it.`
          : 'Agents can only claim unassigned leads for themselves.',
        owner: owner || null,
      }, { status: 409 });
    }
    if (decision.requiresReason && !transferReason) {
      return NextResponse.json({ error: 'A transfer reason is required' }, { status: 400 });
    }
    if (currentOwner === targetOwner) {
      return NextResponse.json({ ok: true, lead, owner: currentOwner || null, message: 'Ownership is unchanged.' });
    }

    const now = new Date().toISOString();
    let update = supabase
      .from('catalog_leads')
      .update({
        sales_agent: targetOwner || null,
        ownership_updated_at: now,
        ownership_updated_by: auth.user.email || actorOwner,
        updated_at: now,
      })
      .eq('id', lead.id);
    if (!auth.profile.is_superadmin) update = update.is('sales_agent', null);
    const { data: updated, error: updateError } = await update.select('*').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      const winner = await loadLead(supabase, lead.id);
      return NextResponse.json({
        error: `This lead was claimed by ${winner.sales_agent || 'another agent'} before your request completed.`,
        owner: winner.sales_agent || null,
      }, { status: 409 });
    }

    await recordAssignment(supabase, auth, {
      leadId: lead.id,
      action: targetOwner ? (currentOwner || historicalOwner ? 'transferred' : 'claimed') : 'unassigned',
      previousAgent: currentOwner || historicalOwner || null,
      newAgent: targetOwner || null,
      reason: transferReason || 'First CRM claim',
    });

    return NextResponse.json({
      ok: true,
      lead: updated,
      owner: targetOwner || null,
      message: targetOwner ? `Lead assigned to ${targetOwner}.` : 'Lead unassigned.',
    });
  } catch (error) {
    console.error('[admin/leads PATCH]', error);
    if (migrationMissing(error)) {
      return NextResponse.json({ error: 'Lead claiming is not enabled in the database yet. Run add-lead-claiming.sql first.' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message || 'Could not update lead ownership' }, { status: 500 });
  }
}
