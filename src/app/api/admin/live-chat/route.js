import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { resolveAdminTabAccess } from '@/lib/adminModules';
import { isActiveProfile, isSubUser } from '@/lib/subUserTier.mjs';
import {
  LIVE_CHAT_AVAILABILITY_SETTING_ID,
  normalizeLiveChatAvailability,
} from '@/lib/liveChatAvailability.mjs';
import { writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  buildLiveChatLeadNote,
  cleanLiveChatText,
  formatLiveChatConversation,
  getLiveChatLeadContact,
  isMissingLiveChatTable,
  normalizeLiveChatPriority,
  normalizeLiveChatStatus,
  signLiveChatAttachmentUrls,
} from '@/lib/liveChat';

export const runtime = 'nodejs';

const MESSAGE_LIMIT = 250;
const OPTIONAL_LEAD_COLUMNS = [
  'name',
  'email',
  'phone',
  'status',
  'notes',
  'last_contacted_at',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'referrer',
  'whatsapp_consent',
  'marketing_consent',
  'consent_at',
  'consent_source',
];

function summarizeLead(lead) {
  if (!lead) return null;
  return {
    id: lead.id,
    name: lead.name || '',
    email: lead.email || '',
    phone: lead.phone || '',
    contactMethod: lead.contact_method || '',
    contactValue: lead.contact_value || '',
    status: lead.status || 'New',
    source: lead.utm_source || lead.source || '',
    campaign: lead.utm_campaign || '',
    whatsappConsent: lead.whatsapp_consent === true,
    lastContactedAt: lead.last_contacted_at || null,
    createdAt: lead.created_at || null,
  };
}

function buildLeadContactCandidates(conversation) {
  const contact = getLiveChatLeadContact(conversation);
  const values = new Set();
  if (contact?.value) values.add(contact.value);
  if (contact?.email) values.add(contact.email);
  if (contact?.phone) values.add(contact.phone);
  return [...values];
}

async function enrichLeadContext(supabase, conversations) {
  const leadIds = new Set();
  const contactValues = new Set();

  for (const conversation of conversations) {
    const linkedId = conversation.metadata?.leadId || conversation.leadContext?.lead?.id;
    if (linkedId) leadIds.add(linkedId);
    for (const value of buildLeadContactCandidates(conversation)) contactValues.add(value);
  }

  const leads = [];
  if (leadIds.size) {
    const { data, error } = await supabase
      .from('catalog_leads')
      .select('*')
      .in('id', [...leadIds]);
    if (!error) leads.push(...(data || []));
  }
  if (contactValues.size) {
    const { data, error } = await supabase
      .from('catalog_leads')
      .select('*')
      .in('contact_value', [...contactValues]);
    if (!error) leads.push(...(data || []));
  }

  const byId = new Map();
  const byContact = new Map();
  for (const lead of leads) {
    if (lead.id) byId.set(lead.id, lead);
    if (lead.contact_value) byContact.set(String(lead.contact_value).toLowerCase(), lead);
  }

  return conversations.map((conversation) => {
    const linkedLead = conversation.metadata?.leadId ? byId.get(conversation.metadata.leadId) : null;
    const matchedLead = buildLeadContactCandidates(conversation)
      .map((value) => byContact.get(String(value).toLowerCase()))
      .find(Boolean);
    const lead = linkedLead || matchedLead || null;
    const contact = getLiveChatLeadContact(conversation);

    return {
      ...conversation,
      leadContext: {
        status: lead ? (linkedLead ? 'saved' : 'matched') : (contact ? 'ready' : 'missing_contact'),
        contactMethod: contact?.method || '',
        contactValue: contact?.value || '',
        lead: summarizeLead(lead),
      },
    };
  });
}

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

  const formatted = await Promise.all((conversations || []).map((conversation) => (
    signLiveChatAttachmentUrls(
      supabase,
      formatLiveChatConversation(conversation, byConversation.get(conversation.id) || [])
    )
  )));
  return enrichLeadContext(supabase, formatted);
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
  const formatted = await signLiveChatAttachmentUrls(supabase, formatLiveChatConversation(conversation, messages || []));
  const [enriched] = await enrichLeadContext(supabase, [formatted]);
  return enriched;
}

function canControlConversation(conversation, profile) {
  if (!conversation) return false;
  if (profile.is_superadmin) return true;
  if (!conversation.assigned_to) return true;
  return conversation.assigned_to === profile.user_id;
}

function summarizeAgent(profile, user) {
  return {
    userId: profile.user_id,
    name: profile.name || profile.email || user?.email || 'Agent',
    email: profile.email || user?.email || '',
    isSuperadmin: Boolean(profile.is_superadmin),
  };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['live_chat'] });
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const conversations = await loadConversations(supabase);
    const agents = [];
    const currentAgent = summarizeAgent(auth.profile, auth.user);

    const { data: profiles, error: profilesError } = await supabase
      .from('admin_profiles')
      .select('*')
      .order('name', { ascending: true });

    if (!profilesError) {
      for (const profile of profiles || []) {
        // Every active member of staff is listed, because silently dropping
        // the ones without Live Chat permission made the assignment dropdown
        // look like agents were missing from the system. They are flagged
        // instead, and the UI disables them: assigning a chat to someone who
        // cannot open the tab would black-hole it, which is why the assign
        // action below still refuses those user ids outright.
        if (!isActiveProfile(profile) || isSubUser(profile)) continue;
        agents.push({
          userId: profile.user_id,
          name: profile.name || profile.email || 'Agent',
          email: profile.email || '',
          isSuperadmin: Boolean(profile.is_superadmin),
          hasLiveChatAccess: resolveAdminTabAccess('live_chat', profile),
        });
      }
    }

    let availability = normalizeLiveChatAvailability(undefined);
    try {
      const { data: setting } = await supabase
        .from('site_settings')
        .select('value')
        .eq('id', LIVE_CHAT_AVAILABILITY_SETTING_ID)
        .maybeSingle();
      availability = normalizeLiveChatAvailability(setting?.value);
    } catch {
      // The inbox still loads on the shipped default rather than 500ing.
    }

    return NextResponse.json({ conversations, agents, currentAgent, availability });
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
      // Answering moves the chat into Open, not just out of Resolved. A parked
      // ('pending') thread that an agent has actually replied to is open work,
      // and leaving it parked kept it out of the Open queue after a real reply.
      status: 'open',
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

    // Whether the whole website chat shows as online. Superadmin only: this is
    // a shop-wide switch, not something one agent should flip for everyone.
    // Handled before the conversationId check because it targets no chat.
    if (action === 'availability') {
      if (!auth.profile.is_superadmin) {
        return NextResponse.json({ error: 'Only a superadmin can change live chat availability.' }, { status: 403 });
      }
      const availability = normalizeLiveChatAvailability(body.availability);
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('site_settings')
        .upsert({ id: LIVE_CHAT_AVAILABILITY_SETTING_ID, value: availability }, { onConflict: 'id' });
      if (error) throw error;
      return NextResponse.json({ success: true, availability });
    }

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
    } else if (action === 'assign') {
      const agentUserId = String(body.agentUserId || '').trim();
      if (!agentUserId) return NextResponse.json({ error: 'agentUserId is required' }, { status: 400 });

      const { data: agent, error: agentError } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('user_id', agentUserId)
        .maybeSingle();

      if (agentError) throw agentError;
      if (!agent || !resolveAdminTabAccess('live_chat', agent)) {
        return NextResponse.json({ error: 'That agent does not have Live Chat access.' }, { status: 400 });
      }

      patch.assigned_to = agent.user_id;
      patch.assigned_to_email = agent.email || null;
      patch.assigned_to_name = agent.name || agent.email || 'Agent';
      patch.status = conversation.status === 'resolved' ? 'open' : conversation.status;
    } else if (action === 'status') {
      patch.status = normalizeLiveChatStatus(body.status);
      if (patch.status === 'resolved') {
        patch.unread_for_agent = false;
      }
    } else if (action === 'priority') {
      patch.priority = normalizeLiveChatPriority(body.priority);
    } else if (action === 'mark_seen') {
      patch.unread_for_agent = false;
    } else if (action === 'save_lead') {
      const contact = getLiveChatLeadContact(conversation);
      if (!contact?.value) {
        return NextResponse.json({ error: 'Add an email or phone before saving this chat as a lead.' }, { status: 400 });
      }

      const hasPaymentProof = (conversation.messages || []).some((message) => message.attachments?.length > 0);
      const nowIso = new Date().toISOString();
      const { data: existingLead } = await supabase
        .from('catalog_leads')
        .select('*')
        .eq('contact_value', contact.value)
        .maybeSingle();
      const chatNote = buildLiveChatLeadNote(conversation);
      const mergedNotes = existingLead?.notes
        ? `${chatNote}\n\n--- Previous CRM notes ---\n${existingLead.notes}`
        : chatNote;
      const leadPayload = {
        contact_method: contact.method,
        contact_value: contact.value,
        name: conversation.visitorName === 'Website visitor' ? (existingLead?.name || null) : conversation.visitorName,
        email: contact.email || existingLead?.email || null,
        phone: contact.phone || existingLead?.phone || null,
        language: 'es',
        status: existingLead?.status && existingLead.status !== 'New' ? existingLead.status : (hasPaymentProof ? 'Quoted' : 'Interested'),
        notes: mergedNotes,
        last_contacted_at: existingLead?.last_contacted_at || null,
        utm_source: 'live_chat',
        utm_medium: 'website_chat',
        utm_campaign: hasPaymentProof ? 'payment_proof' : 'support_chat',
        referrer: conversation.pageUrl || conversation.referrer || 'website_live_chat',
        whatsapp_consent: false,
        marketing_consent: false,
        consent_at: null,
        consent_source: 'live_chat_contact_only',
      };

      const { data: lead, error: leadError } = await writeDroppingMissingColumns(
        leadPayload,
        OPTIONAL_LEAD_COLUMNS,
        (row) => supabase
          .from('catalog_leads')
          .upsert(row, { onConflict: 'contact_value' })
          .select('*')
          .single()
      );

      if (leadError) throw leadError;

      patch.metadata = {
        ...(conversation.metadata || {}),
        leadId: lead?.id || null,
        leadSavedAt: nowIso,
        leadSavedBy: auth.profile.email || auth.user.email || null,
        leadContext: {
          status: 'saved',
          contactMethod: contact.method,
          contactValue: contact.value,
          lead: summarizeLead(lead),
        },
      };
      patch.priority = hasPaymentProof ? 'high' : (conversation.priority === 'low' ? 'normal' : conversation.priority);
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

export async function DELETE(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['live_chat'] });
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const conversationId = String(url.searchParams.get('conversationId') || '').trim();

    if (!conversationId) return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const conversation = await loadConversationById(supabase, conversationId);
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Ensure they have permission (either assigned to them, unassigned, or superadmin)
    if (!canControlConversation({ assigned_to: conversation.assignedTo }, auth.profile)) {
      return NextResponse.json({ error: 'Forbidden: this conversation belongs to another agent' }, { status: 403 });
    }

    const { error } = await supabase
      .from('live_chat_conversations')
      .delete()
      .eq('id', conversationId);

    if (error) throw error;

    return NextResponse.json({ success: true, conversationId });
  } catch (err) {
    if (isMissingLiveChatTable(err)) {
      return NextResponse.json({ error: 'Live chat tables are not installed yet.' }, { status: 409 });
    }
    console.error('[admin/live-chat] DELETE failed:', err);
    return NextResponse.json({ error: err.message || 'Could not delete conversation.' }, { status: 500 });
  }
}
