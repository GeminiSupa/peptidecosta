import { resolveAdminTabAccess } from './adminModules.js';

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

async function findRoutingOwner(supabase, waId, matchedOrderId) {
  const order = await findLatestRoutedOrder(supabase, waId, matchedOrderId);
  if (!order?.sales_agent) return null;
  return findProfileForSalesAgent(supabase, order.sales_agent);
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

  if (displayName) patch.display_name = displayName;
  if (matchedOrderId) patch.matched_order_id = matchedOrderId;
  if (direction === 'inbound' || direction === 'outbound') {
    patch.last_message_at = latestIsoTimestamp(existing?.last_message_at, lastAt);
  }
  if (direction === 'inbound') {
    patch.last_inbound_at = latestIsoTimestamp(existing?.last_inbound_at, lastAt);
    if (existing?.status === 'resolved') patch.status = 'open';
  }
  if (direction === 'outbound') {
    patch.last_outbound_at = latestIsoTimestamp(existing?.last_outbound_at, lastAt);
  }

  if (!existing?.assigned_to) {
    const owner = await findRoutingOwner(supabase, cleanWaId, matchedOrderId);
    Object.assign(patch, routedOwnerPatch(owner));
  }

  const query = existing
    ? supabase.from('whatsapp_conversations').update(patch).eq('wa_id', cleanWaId)
    : supabase.from('whatsapp_conversations').insert({
        status: 'open',
        ...patch,
        created_at: nowIso,
      });

  const { data, error } = await query.select('*').single();
  if (error && isMissingWhatsappConversationsTable(error)) {
    return { data: null, error: null, available: false };
  }
  return { data: data || null, error, available: true };
}
