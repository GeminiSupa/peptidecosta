import { resolveAdminTabAccess } from './adminModules.js';
import { isMissingWhatsAppChannelsSchema } from './whatsappChannels.mjs';

export const WA_CONVERSATION_STATUSES = new Set(['open', 'pending', 'resolved', 'snoozed']);
export const WA_UNASSIGNED_OWNER = 'unassigned';

export function normalizeWaId(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function isMissingWhatsappConversationsTable(error) {
  if (!error) return false;
  const message = String(error.message || '');
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (/whatsapp_conversations/i.test(message) &&
      /does not exist|schema cache|could not find/i.test(message))
  );
}

function profileIsRoutable(profile) {
  return profile?.user_id && resolveAdminTabAccess('whatsapp_ai', profile);
}

function profileMatchKeys(profile) {
  const keys = new Set();
  const name = String(profile?.name || '').trim().toLowerCase();
  const email = String(profile?.email || '').trim().toLowerCase();
  if (name) keys.add(name);
  if (email) {
    keys.add(email);
    const local = email.split('@')[0];
    if (local) keys.add(local);
  }
  return keys;
}

function profileMatchesName(profile, value) {
  const key = String(value || '').trim().toLowerCase();
  return key && profileMatchKeys(profile).has(key);
}

function routedOwnerPatch(profile) {
  if (!profileIsRoutable(profile)) return {};
  return {
    assigned_to: profile.user_id,
    assigned_to_email: profile.email || null,
    assigned_to_name: profile.name || profile.email || null,
    assigned_at: new Date().toISOString(),
  };
}

async function findProfileForSalesAgent(supabase, salesAgent) {
  const agentName = String(salesAgent || '').trim();
  if (!agentName) return null;

  const { data, error } = await supabase
    .from('admin_profiles')
    .select('*');

  if (error) {
    console.warn('[WhatsApp Conversations] Could not load admin profiles for routing:', error.message);
    return null;
  }

  return (data || []).find((profile) => (
    profileIsRoutable(profile) && profileMatchesName(profile, agentName)
  )) || null;
}

async function findLatestRoutedOrder(supabase, waId, matchedOrderId) {
  if (matchedOrderId) {
    const { data } = await supabase
      .from('orders')
      .select('id, sales_agent')
      .eq('id', matchedOrderId)
      .maybeSingle();
    if (data?.sales_agent) return data;
  }

  const tail = normalizeWaId(waId).slice(-8);
  if (!tail) return null;

  const { data, error } = await supabase
    .from('orders')
    .select('id, sales_agent, created_at')
    .or(`whatsapp_wa_id.ilike.%${tail}%,customer_phone.ilike.%${tail}%`)
    .not('sales_agent', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('[WhatsApp Conversations] Could not load latest routed order:', error.message);
    return null;
  }

  return data?.[0] || null;
}

async function findCrmLead(supabase, waId) {
  const tail = normalizeWaId(waId).slice(-8);
  if (!tail) return null;

  const { data: identity, error: identityError } = await supabase
    .from('lead_contact_identities')
    .select('lead_id')
    .eq('identity_type', 'phone')
    .eq('identity_value', tail)
    .maybeSingle();

  if (!identityError && identity?.lead_id) {
    const { data: lead, error } = await supabase
      .from('catalog_leads')
      .select('id, sales_agent')
      .eq('id', identity.lead_id)
      .maybeSingle();
    if (!error && lead) return lead;
  }

  // Backward-compatible fallback for deployments where the identity migration
  // has not been applied yet.
  const { data: leads, error } = await supabase
    .from('catalog_leads')
    .select('id, sales_agent, created_at')
    .or(`phone.ilike.%${tail}%,contact_value.ilike.%${tail}%`)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) return null;
  return leads?.[0] || null;
}

async function ensureInboundCrmLead(supabase, waId, displayName, sourceWhatsappNumber) {
  const existing = await findCrmLead(supabase, waId);
  if (existing) return existing;

  const cleanWaId = normalizeWaId(waId);
  if (!cleanWaId) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('catalog_leads')
    .insert({
      contact_method: 'whatsapp',
      contact_value: cleanWaId,
      phone: cleanWaId,
      name: String(displayName || '').trim() || null,
      language: 'es',
      status: 'New',
      notes: 'Automatically created from an inbound WhatsApp conversation.',
      source_whatsapp_number: sourceWhatsappNumber || null,
      whatsapp_consent: false,
      marketing_consent: false,
      created_at: now,
      updated_at: now,
    })
    .select('id, sales_agent')
    .single();

  if (!error && data) return data;
  if (error?.code === '23505') return findCrmLead(supabase, cleanWaId);

  // Older deployments can keep receiving messages while the CRM migration is
  // being rolled out; the inbox simply remains unlinked until SQL is applied.
  console.warn('[WhatsApp Conversations] Could not create inbound CRM lead:', error?.message || error);
  return null;
}

async function findRoutingOwner(supabase, waId, matchedOrderId, knownLead = null) {
  const lead = knownLead || await findCrmLead(supabase, waId);
  if (lead?.sales_agent) {
    const profile = await findProfileForSalesAgent(supabase, lead.sales_agent);
    if (profile) return { profile, leadId: lead.id };
  }

  const order = await findLatestRoutedOrder(supabase, waId, matchedOrderId);
  if (!order?.sales_agent) return { profile: null, leadId: lead?.id || null };
  const profile = await findProfileForSalesAgent(supabase, order.sales_agent);
  return { profile, leadId: lead?.id || null };
}

async function syncLeadOwnerFromRouting(supabase, leadId, profile) {
  if (!leadId || !profileIsRoutable(profile)) return;
  const owner = String(profile.name || profile.email || '').trim();
  if (!owner) return;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('catalog_leads')
    .update({
      sales_agent: owner,
      ownership_updated_at: now,
      ownership_updated_by: 'WhatsApp routing',
      updated_at: now,
    })
    .eq('id', leadId)
    .is('sales_agent', null)
    .select('id')
    .maybeSingle();

  if (error || !data) return;
  await supabase.from('lead_assignment_events').insert({
    lead_id: leadId,
    action: 'auto_assigned',
    new_agent: owner,
    reason: 'WhatsApp conversation matched CRM or completed-order owner',
    actor_email: 'whatsapp-routing',
  });
}

export function conversationOwnerKey(conversation) {
  return conversation?.assigned_to_email || conversation?.assigned_to_name || WA_UNASSIGNED_OWNER;
}

export function conversationVisibleToProfile(conversation, profile) {
  if (!profile || profile.is_superadmin) return true;
  const owner = conversation?.assigned_to;
  return !owner || owner === profile.user_id;
}

function latestIsoTimestamp(...values) {
  const timestamps = values
    .map((value) => {
      const ms = new Date(value || 0).getTime();
      return Number.isFinite(ms) ? ms : null;
    })
    .filter((value) => value !== null);

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export async function upsertWhatsAppConversation(supabase, {
  waId,
  displayName = null,
  direction = null,
  messageAt = null,
  matchedOrderId = null,
  source = 'cloud_api',
  channelId = null,
  channelDisplayNumber = null,
  metadata = {},
} = {}) {
  if (!supabase) return { data: null, error: null, available: false };

  const cleanWaId = normalizeWaId(waId);
  if (!cleanWaId) return { data: null, error: null, available: true };

  const nowIso = new Date().toISOString();
  const lastAt = messageAt || nowIso;

  const { data: existing, error: existingError } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('wa_id', cleanWaId)
    .maybeSingle();

  if (existingError) {
    if (isMissingWhatsappConversationsTable(existingError)) {
      return { data: null, error: null, available: false };
    }
    return { data: null, error: existingError, available: true };
  }

  const patch = {
    wa_id: cleanWaId,
    source: existing?.source || source || 'cloud_api',
    updated_at: nowIso,
    metadata: {
      ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
    },
  };

  const crmLead = direction === 'inbound'
    ? await ensureInboundCrmLead(supabase, cleanWaId, displayName, channelDisplayNumber)
    : await findCrmLead(supabase, cleanWaId);
  if (crmLead?.id) patch.contact_lead_id = crmLead.id;

  if (displayName) patch.display_name = displayName;
  if (matchedOrderId) patch.matched_order_id = matchedOrderId;
  if (channelId) patch.channel_id = channelId;
  if (direction === 'inbound' || direction === 'outbound') {
    patch.last_message_at = latestIsoTimestamp(existing?.last_message_at, lastAt);
  }
  if (direction === 'inbound') {
    patch.last_inbound_at = latestIsoTimestamp(existing?.last_inbound_at, lastAt);
    if (channelId) patch.last_inbound_channel_id = channelId;
    if (existing?.status === 'resolved') patch.status = 'open';
  }
  if (direction === 'outbound') {
    patch.last_outbound_at = latestIsoTimestamp(existing?.last_outbound_at, lastAt);
    if (channelId) patch.last_outbound_channel_id = channelId;
  }

  if (!existing?.assigned_to) {
    const routing = await findRoutingOwner(supabase, cleanWaId, matchedOrderId, crmLead);
    Object.assign(patch, routedOwnerPatch(routing.profile));
    if (routing.leadId) patch.contact_lead_id = routing.leadId;
    await syncLeadOwnerFromRouting(supabase, routing.leadId, routing.profile);
  }

  const query = existing
    ? supabase.from('whatsapp_conversations').update(patch).eq('wa_id', cleanWaId)
    : supabase.from('whatsapp_conversations').insert({
        status: 'open',
        ...patch,
        created_at: nowIso,
      });

  let { data, error } = await query.select('*').single();
  if (error && isMissingWhatsAppChannelsSchema(error)) {
    const {
      channel_id,
      last_inbound_channel_id,
      last_outbound_channel_id,
      contact_lead_id,
      ...legacyPatch
    } = patch;
    void channel_id;
    void last_inbound_channel_id;
    void last_outbound_channel_id;
    void contact_lead_id;

    const legacyQuery = existing
      ? supabase.from('whatsapp_conversations').update(legacyPatch).eq('wa_id', cleanWaId)
      : supabase.from('whatsapp_conversations').insert({
          status: 'open',
          ...legacyPatch,
          created_at: nowIso,
        });
    ({ data, error } = await legacyQuery.select('*').single());
  }
  if (error && isMissingWhatsappConversationsTable(error)) {
    return { data: null, error: null, available: false };
  }
  return { data: data || null, error, available: true };
}
