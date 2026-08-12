import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveAdminTabAccess } from '@/lib/adminModules';
import {
  WA_CONVERSATION_STATUSES,
  conversationVisibleToProfile,
  isMissingWhatsappConversationsTable,
  normalizeWaId,
  upsertWhatsAppConversation,
} from '@/lib/whatsappConversations.mjs';
import { isMissingWhatsAppChannelsSchema } from '@/lib/whatsappChannels.mjs';

export const runtime = 'nodejs';

const MESSAGE_LIMIT = 2500;
const MESSAGE_WA_ID_CHUNK_SIZE = 100;
const DIRECT_MESSAGE_FILTER_LIMIT = 300;
const ALLOWED_SOURCES = new Set(['cloud_api', 'baileys_session']);

function requestedStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return WA_CONVERSATION_STATUSES.has(status) ? status : null;
}

function allowedConversationSource(request, profile) {
  const canUseSalesInbox = resolveAdminTabAccess('whatsapp_ai', profile);
  const canUseDeviceInbox = resolveAdminTabAccess('wa_session', profile);
  if (!canUseSalesInbox && canUseDeviceInbox) return 'baileys_session';

  const sourceParam = request.nextUrl?.searchParams?.get('source') || '';
  return ALLOWED_SOURCES.has(sourceParam) ? sourceParam : null;
}

async function fetchVisibleConversations(supabase, profile, source = null) {
  let query = supabase
    .from('whatsapp_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (source) query = query.eq('source', source);

  const { data, error } = await query;

  if (error) {
    if (isMissingWhatsappConversationsTable(error)) {
      return { available: false, conversations: [] };
    }
    throw new Error(error.message);
  }

  return {
    available: true,
    conversations: (data || []).filter((conversation) => conversationVisibleToProfile(conversation, profile)),
  };
}

async function fetchRoutableAgents(supabase) {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.warn('[admin/whatsapp-conversations] Could not load routable agents:', error.message);
    return [];
  }

  return (data || [])
    .filter((profile) => resolveAdminTabAccess('whatsapp_ai', profile))
    .map((profile) => ({
      user_id: profile.user_id,
      email: profile.email || null,
      name: profile.name || profile.email || null,
      is_superadmin: Boolean(profile.is_superadmin),
    }))
    .filter((profile) => profile.user_id && (profile.email || profile.name));
}

async function fetchWhatsAppChannels(supabase) {
  const { data, error } = await supabase
    .from('whatsapp_channels')
    .select('id, phone_number_id, waba_id, display_phone_number, name, source, status')
    .order('name', { ascending: true });

  if (error && isMissingWhatsAppChannelsSchema(error)) return [];
  if (error) throw error;
  return (data || []).filter((channel) => channel.phone_number_id !== 'legacy-default');
}

async function syncLinkedCrmOwner(supabase, auth, conversation, action, agent, reason = '') {
  const leadId = conversation?.contact_lead_id;
  if (!leadId) return;

  const { data: lead, error: leadError } = await supabase
    .from('catalog_leads')
    .select('id, sales_agent')
    .eq('id', leadId)
    .maybeSingle();
  if (leadError) throw leadError;
  if (!lead) return;

  const previousOwner = String(lead.sales_agent || '').trim();
  const newOwner = agent ? String(agent.name || agent.email || '').trim() : '';
  if (previousOwner === newOwner) return;

  if (action === 'claim' && previousOwner) {
    throw new Error(`This CRM contact already belongs to ${previousOwner}.`);
  }
  if ((action === 'transfer' || action === 'release') && !auth.profile.is_superadmin) {
    throw new Error('Only a superadmin can transfer or release an owned CRM contact.');
  }
  if (action === 'transfer' && !String(reason || '').trim()) {
    throw new Error('A transfer reason is required.');
  }

  const now = new Date().toISOString();
  let ownerUpdate = supabase
    .from('catalog_leads')
    .update({
      sales_agent: newOwner || null,
      ownership_updated_at: now,
      ownership_updated_by: auth.profile.email || auth.user.email || null,
      updated_at: now,
    })
    .eq('id', lead.id);
  if (action === 'claim') ownerUpdate = ownerUpdate.is('sales_agent', null);
  const { data: updatedLead, error: updateError } = await ownerUpdate
    .select('id, sales_agent')
    .maybeSingle();
  if (updateError) throw updateError;
  if (action === 'claim' && !updatedLead) {
    const { data: winner } = await supabase
      .from('catalog_leads')
      .select('sales_agent')
      .eq('id', lead.id)
      .maybeSingle();
    throw new Error(`This CRM contact was claimed by ${winner?.sales_agent || 'another agent'}.`);
  }

  const eventAction = newOwner
    ? (previousOwner ? 'transferred' : 'claimed')
    : 'unassigned';
  const { error: eventError } = await supabase.from('lead_assignment_events').insert({
    lead_id: lead.id,
    action: eventAction,
    previous_agent: previousOwner || null,
    new_agent: newOwner || null,
    reason: String(reason || '').trim() || 'Claimed from shared WhatsApp inbox',
    actor_user_id: auth.user.id,
    actor_email: auth.profile.email || auth.user.email || null,
  });
  if (eventError) throw eventError;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchConversationMessages(supabase, waIds, source = null) {
  const uniqueWaIds = [...new Set((waIds || []).filter(Boolean))];
  if (uniqueWaIds.length === 0) return [];

  if (uniqueWaIds.length > DIRECT_MESSAGE_FILTER_LIMIT) {
    const visibleWaIds = new Set(uniqueWaIds);
    let messageQuery = supabase
      .from('whatsapp_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MESSAGE_LIMIT * 2);

    if (source) messageQuery = messageQuery.eq('source', source);

    const { data, error } = await messageQuery;
    if (error) throw new Error(error.message);

    return (data || [])
      .filter((message) => visibleWaIds.has(normalizeWaId(message.wa_id)))
      .slice(0, MESSAGE_LIMIT);
  }

  const chunks = chunkArray(uniqueWaIds, MESSAGE_WA_ID_CHUNK_SIZE);
  const perChunkLimit = Math.min(MESSAGE_LIMIT, Math.max(200, Math.ceil(MESSAGE_LIMIT / chunks.length) + 50));
  const batches = [];
  for (const chunk of chunks) {
    let messageQuery = supabase
      .from('whatsapp_messages')
      .select('*')
      .in('wa_id', chunk)
      .order('created_at', { ascending: false })
      .limit(perChunkLimit);

    if (source) messageQuery = messageQuery.eq('source', source);

    const { data, error } = await messageQuery;
    if (error) throw new Error(error.message);
    batches.push(data || []);
  }

  return batches
    .flat()
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, MESSAGE_LIMIT);
}

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['whatsapp_ai', 'wa_session'] });
  if (auth.error) return auth.error;

  try {
    const source = allowedConversationSource(request, auth.profile);
    const supabase = getSupabaseAdmin();
    const { available, conversations } = await fetchVisibleConversations(supabase, auth.profile, source);
    if (!available) {
      return NextResponse.json({
        available: false,
        conversations: [],
        messages: [],
        error: 'WhatsApp conversation routing table is not installed yet.',
      });
    }

    const agents = await fetchRoutableAgents(supabase);
    const channels = await fetchWhatsAppChannels(supabase);

    const waIds = conversations.map((conversation) => conversation.wa_id).filter(Boolean);
    const messages = await fetchConversationMessages(supabase, waIds, source);

    return NextResponse.json({ available: true, conversations, messages, agents, channels });
  } catch (err) {
    console.error('[admin/whatsapp-conversations] GET failed:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['whatsapp_ai', 'wa_session'] });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const waId = normalizeWaId(body.waId);
    const action = String(body.action || '').trim().toLowerCase();

    if (!waId) {
      return NextResponse.json({ error: 'waId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const canUseSalesInbox = resolveAdminTabAccess('whatsapp_ai', auth.profile);
    const canUseDeviceInbox = resolveAdminTabAccess('wa_session', auth.profile);
    const forcedSource = !canUseSalesInbox && canUseDeviceInbox ? 'baileys_session' : null;
    const ensured = await upsertWhatsAppConversation(supabase, { waId, source: forcedSource || 'cloud_api' });
    if (!ensured.available) {
      return NextResponse.json({ error: 'WhatsApp conversation routing table is not installed yet.' }, { status: 409 });
    }
    if (ensured.error) {
      return NextResponse.json({ error: ensured.error.message }, { status: 500 });
    }

    const conversation = ensured.data;
    if (forcedSource && conversation?.source !== forcedSource) {
      return NextResponse.json({ error: 'Forbidden: this conversation is not part of WhatsApp Device' }, { status: 403 });
    }
    const ownerId = conversation?.assigned_to || null;
    const isMine = ownerId === auth.profile.user_id;
    const canControl = auth.profile.is_superadmin || !ownerId || isMine;

    if (!canControl) {
      return NextResponse.json({ error: 'Forbidden: this conversation belongs to another agent' }, { status: 403 });
    }

    const patch = { updated_at: new Date().toISOString() };
    let crmAgent = null;
    const transferReason = String(body.reason || '').trim().slice(0, 500);
    if (action === 'claim') {
      crmAgent = auth.profile;
      patch.assigned_to = auth.profile.user_id;
      patch.assigned_to_email = auth.profile.email || auth.user.email || null;
      patch.assigned_to_name = auth.profile.name || auth.profile.email || auth.user.email || null;
      patch.assigned_at = patch.updated_at;
      patch.status = conversation?.status === 'resolved' ? 'open' : (conversation?.status || 'open');
    } else if (action === 'release') {
      if (!auth.profile.is_superadmin) {
        return NextResponse.json({ error: 'Only a superadmin can release CRM ownership' }, { status: 403 });
      }
      patch.assigned_to = null;
      patch.assigned_to_email = null;
      patch.assigned_to_name = null;
      patch.assigned_at = null;
    } else if (action === 'transfer') {
      if (!auth.profile.is_superadmin) {
        return NextResponse.json({ error: 'Only a superadmin can transfer CRM ownership' }, { status: 403 });
      }
      if (!transferReason) {
        return NextResponse.json({ error: 'A transfer reason is required' }, { status: 400 });
      }
      const assignedTo = String(body.assignedTo || '').trim();
      if (!assignedTo) return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 });

      const { data: agent, error: agentError } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('user_id', assignedTo)
        .maybeSingle();

      if (agentError) throw new Error(agentError.message);
      if (!agent || !resolveAdminTabAccess('whatsapp_ai', agent)) {
        return NextResponse.json({ error: 'Choose an active agent with Sales WhatsApp access' }, { status: 400 });
      }

      crmAgent = agent;
      patch.assigned_to = agent.user_id;
      patch.assigned_to_email = agent.email || null;
      patch.assigned_to_name = agent.name || agent.email || null;
      patch.assigned_at = patch.updated_at;
      patch.status = conversation?.status === 'resolved' ? 'open' : (conversation?.status || 'open');
    } else if (action === 'status') {
      const status = requestedStatus(body.status);
      if (!status) return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });
      patch.status = status;
    } else {
      return NextResponse.json({ error: 'Valid action is required' }, { status: 400 });
    }

    if (action === 'claim' || action === 'release' || action === 'transfer') {
      try {
        await syncLinkedCrmOwner(supabase, auth, conversation, action, crmAgent, transferReason);
      } catch (error) {
        const conflict = /already belongs|was claimed|only a superadmin/i.test(error.message || '');
        return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 400 });
      }
    }

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update(patch)
      .eq('wa_id', waId)
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, conversation: data });
  } catch (err) {
    console.error('[admin/whatsapp-conversations] PATCH failed:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['whatsapp_ai', 'wa_session'] });
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const waId = normalizeWaId(url.searchParams.get('waId'));

    if (!waId) {
      return NextResponse.json({ error: 'waId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    
    // Validate permission first
    const { data: conversation, error: loadError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('wa_id', waId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    const ownerId = conversation.assigned_to || null;
    const isMine = ownerId === auth.profile.user_id;
    const canControl = auth.profile.is_superadmin || !ownerId || isMine;

    if (!canControl) {
      return NextResponse.json({ error: 'Forbidden: this conversation belongs to another agent' }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_conversations')
      .delete()
      .eq('wa_id', waId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, waId });
  } catch (err) {
    if (isMissingWhatsappConversationsTable(err)) {
      return NextResponse.json({ error: 'WhatsApp conversation routing table is not installed yet.' }, { status: 409 });
    }
    console.error('[admin/whatsapp-conversations] DELETE failed:', err);
    return NextResponse.json({ error: err.message || 'Could not delete conversation.' }, { status: 500 });
  }
}
