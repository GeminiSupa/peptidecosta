import { NextResponse } from 'next/server';

// Messenger inbox: live Graph API fetch (no DB). Redeploy marker: 2026-07-04.
// ─── Meta Credentials ───
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID || process.env.MESSENGER_PAGE_ID || '';
const GRAPH = 'https://graph.facebook.com/v25.0';

// Facebook auto-generates these marker lines when a Messenger thread originates
// from a comment on a Page post. We use them to split "Comments" from real DMs.
const COMMENT_MARKERS = [
  'commented on your',
  'comment to a post',
  'responding to a user comment',
  'created this chat because',
  'comentó tu',
  'ha comentado',
  'creó este chat porque',
  'ha creado este chat',
  'ver comentario',
];

function isCommentText(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  if (COMMENT_MARKERS.some((m) => lower.includes(m))) return true;
  // "respondiendo el/al comentario"
  if (/respondiendo\s+\w+\s+comentario/.test(lower)) return true;
  return false;
}

/**
 * GET /api/messenger/inbox
 * Pulls conversations + messages straight from the Graph API and returns them
 * threaded and classified (dm | comment). No database required.
 * Optional query: ?limit=25 (conversations), ?messages=25 (per conversation)
 */
export async function GET(request) {
  try {
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: 'FACEBOOK_PAGE_ACCESS_TOKEN is not configured.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const convLimit = Math.min(parseInt(searchParams.get('limit') || '25', 10) || 25, 50);
    const msgLimit = Math.min(parseInt(searchParams.get('messages') || '25', 10) || 25, 50);

    // Resolve the page id (prefer env, fall back to /me)
    let pageId = PAGE_ID;
    if (!pageId) {
      const meRes = await fetch(`${GRAPH}/me?access_token=${PAGE_ACCESS_TOKEN}`);
      const me = await meRes.json();
      if (me.error) {
        return NextResponse.json({ error: me.error.message, code: me.error.code }, { status: 502 });
      }
      pageId = me.id;
    }

    const fields = `id,updated_time,unread_count,participants,messages.limit(${msgLimit}){message,from,created_time,attachments}`;
    const url = `${GRAPH}/${pageId}/conversations?platform=messenger&fields=${fields}&limit=${convLimit}&access_token=${PAGE_ACCESS_TOKEN}`;

    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    if (json.error) {
      return NextResponse.json({ error: json.error.message, code: json.error.code }, { status: 502 });
    }

    const conversations = (json.data || []).map((conv) => {
      const participants = (conv.participants && conv.participants.data) || [];
      const contact = participants.find((p) => p.id !== pageId) || participants[0] || {};

      const rawMsgs = (conv.messages && conv.messages.data) || [];
      // Graph returns newest-first; present oldest-first for the transcript
      const messages = rawMsgs
        .slice()
        .reverse()
        .map((m) => {
          const attachments = (m.attachments && m.attachments.data) || null;
          const text = m.message || '';
          return {
            id: m.id,
            text,
            direction: m.from && m.from.id === pageId ? 'outbound' : 'inbound',
            senderName: m.from && m.from.name ? m.from.name : (m.from && m.from.id === pageId ? 'Page' : contact.name || 'Customer'),
            createdTime: m.created_time,
            hasAttachment: !!(attachments && attachments.length),
          };
        });

      const source = messages.some((m) => isCommentText(m.text)) ? 'comment' : 'dm';
      const last = messages[messages.length - 1];
      const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');

      return {
        id: conv.id,
        contactId: contact.id || null,
        contactName: contact.name || 'Facebook User',
        source,
        unreadCount: conv.unread_count || 0,
        updatedTime: conv.updated_time,
        lastMessageText: last ? (last.text || (last.hasAttachment ? '[Attachment]' : '')) : '',
        lastMessageAt: last ? last.createdTime : conv.updated_time,
        lastInboundAt: lastInbound ? lastInbound.createdTime : null,
        messages,
      };
    });

    return NextResponse.json({ pageId, count: conversations.length, conversations });
  } catch (err) {
    console.error('[Messenger Inbox] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
