import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { resolveAdminTabAccess } from '@/lib/adminModules';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  cleanLiveChatText,
  formatLiveChatConversation,
  isMissingLiveChatTable,
  normalizeLiveChatPriority,
  normalizeLiveChatStatus,
  signLiveChatAttachmentUrls,
} from '@/lib/liveChat';

export const runtime = 'nodejs';

const MESSAGE_LIMIT = 250;

async function loadConversations(supabase) {
  const { data: conversations, error } = await supabase
    .from('live_chat_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  const ids = (conversations || []).map((row) => row.id);
  let messages = [];
  if (ids.length) {
    const { data, error: messageError } = await supabase
      .from('live_chat_messages')
      .select('*')
      .in('conversation_id', ids)
      .order('created_at', { ascending: true })
      .limit(MESSAGE_LIMIT * Math.max(1, ids.length));

    if (messageError) throw messageError;
    messages = data || [];
  }

  const byConversation = new Map();
  for (const message of messages) {
    const list = byConversation.get(message.conversation_id) || [];
    list.push(message);
    byConversation.set(message.conversation_id, list);
  }

  return Promise.all((conversations || []).map((conversation) => (
    signLiveChatAttachmentUrls(
      supabase,
      formatLiveChatConversation(conversation, byConversation.get(conversation.id) || [])
    )
  )));
}

async function loadConversationById(supabase, conversationId) {
  const { data: conversation, error } = await supabase
    .from('live_chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw error;
  if (!conversation) return null;

  const { data: messages, error: messageError } = await supabase
    .from('live_chat_messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(MESSAGE_LIMIT);

  if (messageError) throw messageError;
  return signLiveChatAttachmentUrls(supabase, formatLiveChatConversation(conversation, messages || []));
}

function canControlConversation(conversation, profile) {
  if (!conversation) return false;
  if (profile.is_superadmin) return true;
  if (!conversation.assigned_to) return true;
  return conversation.assigned_to === profile.user_id;
}

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['live_chat'] });
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const conversations = await loadConversations(supabase);
    const agents = [];

    const { data: profiles, error: profilesError } = await supabase
      .from('admin_profiles')
      .select('*')
      .order('name', { ascending: true });

    if (!profilesError) {
      for (const profile of profiles || []) {
        if (!resolveAdminTabAccess('live_chat', profile)) continue;
        agents.push({
          userId: profile.user_id,
          name: profile.name || profile.email || 'Agent',
          email: profile.email || '',
          isSuperadmin: Boolean(profile.is_superadmin),
        });
      }
    }

    return NextResponse.json({ conversations, agents });
  } catch (err) {
    if (isMissingLiveChatTable(err)) {
      return NextResponse.json({ conversations: [], agents: [], error: 'Live chat tables are not installed yet.' }, { status: 409 });
    }
    console.error('[admin/live-chat] GET failed:', err);
    return NextResponse.json({ error: err.message || 'Could not load live chat inbox.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['live_chat'] });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const conversationId = String(body.conversationId || '').trim();
    const message = cleanLiveChatText(body.message);

    if (!conversationId) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const conversation = await loadConversationById(supabase, conversationId);
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    if (!canControlConversation({ assigned_to: conversation.assignedTo }, auth.profile)) {
      return NextResponse.json({ error: 'Forbidden: this conversation belongs to another agent' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const senderName = auth.profile.name || auth.profile.email || auth.user.email || 'Support';
    const senderEmail = auth.profile.email || auth.user.email || null;

    const { error: messageError } = await supabase
      .from('live_chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_name: senderName,
        sender_email: senderEmail,
        message,
      });

    if (messageError) throw messageError;

    const patch = {
      assigned_to: conversation.assignedTo || auth.profile.user_id,
      assigned_to_email: conversation.assignedToEmail || senderEmail,
      assigned_to_name: conversation.assignedToName || senderName,
      status: conversation.status === 'resolved' ? 'open' : conversation.status,
      last_message: message,
      last_message_at: now,
      last_agent_message_at: now,
      unread_for_agent: false,
      unread_for_visitor: true,
      updated_at: now,
    };

    const { error: updateError } = await supabase
      .from('live_chat_conversations')
      .update(patch)
      .eq('id', conversationId);

    if (updateError) throw updateError;

    const updated = await loadConversationById(supabase, conversationId);
    return NextResponse.json({ success: true, conversation: updated });
  } catch (err) {
    if (isMissingLiveChatTable(err)) {
      return NextResponse.json({ error: 'Live chat tables are not installed yet.' }, { status: 409 });
    }
    console.error('[admin/live-chat] POST failed:', err);
    return NextResponse.json({ error: err.message || 'Could not send reply.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['live_chat'] });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const conversationId = String(body.conversationId || '').trim();
    const action = String(body.action || '').trim().toLowerCase();

    if (!conversationId) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const conversation = await loadConversationById(supabase, conversationId);
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    if (!canControlConversation({ assigned_to: conversation.assignedTo }, auth.profile)) {
      return NextResponse.json({ error: 'Forbidden: this conversation belongs to another agent' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const patch = { updated_at: now };

    if (action === 'claim') {
      patch.assigned_to = auth.profile.user_id;
      patch.assigned_to_email = auth.profile.email || auth.user.email || null;
      patch.assigned_to_name = auth.profile.name || auth.profile.email || auth.user.email || 'Support';
      patch.status = conversation.status === 'resolved' ? 'open' : conversation.status;
    } else if (action === 'release') {
      patch.assigned_to = null;
      patch.assigned_to_email = null;
      patch.assigned_to_name = null;
    } else if (action === 'status') {
      patch.status = normalizeLiveChatStatus(body.status);
      if (patch.status === 'resolved') {
        patch.unread_for_agent = false;
      }
    } else if (action === 'priority') {
      patch.priority = normalizeLiveChatPriority(body.priority);
    } else if (action === 'mark_seen') {
      patch.unread_for_agent = false;
    } else {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const { error } = await supabase
      .from('live_chat_conversations')
      .update(patch)
      .eq('id', conversationId);

    if (error) throw error;

    const updated = await loadConversationById(supabase, conversationId);
    return NextResponse.json({ success: true, conversation: updated });
  } catch (err) {
    if (isMissingLiveChatTable(err)) {
      return NextResponse.json({ error: 'Live chat tables are not installed yet.' }, { status: 409 });
    }
    console.error('[admin/live-chat] PATCH failed:', err);
    return NextResponse.json({ error: err.message || 'Could not update conversation.' }, { status: 500 });
  }
}
