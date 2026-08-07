import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  buildVisitorIdentityPatch,
  cleanLiveChatText,
  cleanOptionalText,
  formatLiveChatConversation,
  isMissingLiveChatTable,
  missingLiveChatContact,
  normalizeVisitorId,
  signLiveChatAttachmentUrls,
} from '@/lib/liveChat';
import {
  LIVE_CHAT_AVAILABILITY_SETTING_ID,
  normalizeLiveChatAvailability,
} from '@/lib/liveChatAvailability.mjs';
import { rateLimit } from '@/lib/rateLimit.mjs';

export const runtime = 'nodejs';

const MESSAGE_LIMIT = 150;

function getRequestOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin) return origin;
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

async function loadConversation(supabase, visitorId) {
  const { data: conversation, error } = await supabase
    .from('live_chat_conversations')
    .select('*')
    .eq('visitor_id', visitorId)
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

/**
 * The saved availability, or the shipped default.
 *
 * A missing row or an unreadable one falls back to the schedule rather than
 * failing the request — the chat loading matters more than the status badge.
 */
async function loadLiveChatAvailability(supabase) {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('id', LIVE_CHAT_AVAILABILITY_SETTING_ID)
      .maybeSingle();
    return normalizeLiveChatAvailability(data?.value);
  } catch {
    return normalizeLiveChatAvailability(undefined);
  }
}

export async function GET(request) {
  try {
    const visitorId = normalizeVisitorId(request.nextUrl.searchParams.get('visitorId'));
    if (!visitorId) return NextResponse.json({ error: 'visitorId is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // Sent on every poll so a superadmin flipping the chat offline reaches
    // visitors who already have the widget open, not just new ones.
    const availability = await loadLiveChatAvailability(supabase);

    const conversation = await loadConversation(supabase, visitorId);
    if (!conversation) return NextResponse.json({ conversation: null, availability });

    await supabase
      .from('live_chat_conversations')
      .update({ unread_for_visitor: false, updated_at: new Date().toISOString() })
      .eq('id', conversation.id);

    return NextResponse.json({
      conversation: { ...conversation, unreadForVisitor: false },
      availability,
    });
  } catch (err) {
    if (isMissingLiveChatTable(err)) {
      return NextResponse.json({ error: 'Live chat tables are not installed yet.' }, { status: 409 });
    }
    console.error('[live-chat] GET failed:', err);
    return NextResponse.json({ error: 'Could not load chat.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const visitorId = normalizeVisitorId(body.visitorId);
    const message = cleanLiveChatText(body.message);

    if (!visitorId) return NextResponse.json({ error: 'visitorId is required' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';
    const rateKey = `live-chat-post-${visitorId}-${ip}`;
    if (!rateLimit(rateKey, 30)) {
      return NextResponse.json({ error: 'Too many messages sent. Please wait a few minutes.' }, { status: 429 });
    }

    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin();
    const visitorName = cleanOptionalText(body.visitorName, 120);
    const visitorEmail = cleanOptionalText(body.visitorEmail, 200);
    const visitorPhone = cleanOptionalText(body.visitorPhone, 80);
    const pageUrl = cleanOptionalText(body.pageUrl, 1000);
    const referrer = cleanOptionalText(body.referrer, 1000);

    // The widget already blocks this, but the endpoint is public, so the
    // requirement is enforced where it cannot be skipped.
    //
    // Only when the conversation is being opened: chats started before this
    // rule existed, and any the team began by hand, must keep working — a
    // visitor mid-conversation being told they cannot reply is far worse than
    // one unqualified lead.
    const { data: existing } = await supabase
      .from('live_chat_conversations')
      .select('id')
      .eq('visitor_id', visitorId)
      .maybeSingle();

    if (!existing && missingLiveChatContact({ name: visitorName, email: visitorEmail, phone: visitorPhone }).length) {
      return NextResponse.json(
        { error: 'Please add your name and an email or phone number so our team can reply.' },
        { status: 400 },
      );
    }

    const { data: conversation, error: upsertError } = await supabase
      .from('live_chat_conversations')
      .upsert({
        visitor_id: visitorId,
        ...buildVisitorIdentityPatch({ name: visitorName, email: visitorEmail, phone: visitorPhone }),
        page_url: pageUrl,
        referrer,
        status: 'open',
        last_message: message,
        last_message_at: now,
        last_customer_message_at: now,
        unread_for_agent: true,
        unread_for_visitor: false,
        metadata: {
          userAgent: cleanOptionalText(request.headers.get('user-agent'), 500),
          origin: getRequestOrigin(request),
        },
        updated_at: now,
      }, { onConflict: 'visitor_id' })
      .select('*')
      .single();

    if (upsertError) throw upsertError;

    const { error: messageError } = await supabase
      .from('live_chat_messages')
      .insert({
        conversation_id: conversation.id,
        sender_type: 'visitor',
        sender_name: visitorName,
        sender_email: visitorEmail,
        message,
      });

    if (messageError) throw messageError;

    const loaded = await loadConversation(supabase, visitorId);
    return NextResponse.json({ success: true, conversation: loaded });
  } catch (err) {
    if (isMissingLiveChatTable(err)) {
      return NextResponse.json({ error: 'Live chat tables are not installed yet.' }, { status: 409 });
    }
    console.error('[live-chat] POST failed:', err);
    return NextResponse.json({ error: 'Could not send message.' }, { status: 500 });
  }
}
