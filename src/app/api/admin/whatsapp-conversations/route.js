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

export const runtime = 'nodejs';

const MESSAGE_LIMIT = 2500;
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

    const waIds = conversations.map((conversation) => conversation.wa_id).filter(Boolean);
    let messages = [];
    if (waIds.length > 0) {
      let messageQuery = supabase
        .from('whatsapp_messages')
        .select('*')
        .in('wa_id', waIds)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT);

      if (source) messageQuery = messageQuery.eq('source', source);

      const { data, error } = await messageQuery;

      if (error) throw new Error(error.message);
      messages = data || [];
    }

    return NextResponse.json({ available: true, conversations, messages });
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
    if (action === 'claim') {
      patch.assigned_to = auth.profile.user_id;
      patch.assigned_to_email = auth.profile.email || auth.user.email || null;
      patch.assigned_to_name = auth.profile.name || auth.profile.email || auth.user.email || null;
      patch.assigned_at = patch.updated_at;
      patch.status = conversation?.status === 'resolved' ? 'open' : (conversation?.status || 'open');
    } else if (action === 'release') {
      patch.assigned_to = null;
      patch.assigned_to_email = null;
      patch.assigned_to_name = null;
      patch.assigned_at = null;
    } else if (action === 'status') {
      const status = requestedStatus(body.status);
      if (!status) return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });
      patch.status = status;
    } else {
      return NextResponse.json({ error: 'Valid action is required' }, { status: 400 });
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
