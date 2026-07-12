import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';

// Messenger inbox: live Graph API fetch (no DB). Redeploy marker: 2026-07-04.
// ─── Meta Credentials ───
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID || process.env.MESSENGER_PAGE_ID || '';
const GRAPH = 'https://graph.facebook.com/v25.0';

function metaErrorMessage(error) {
  const code = error?.code;
  const message = error?.message || '';
  if (code === 190 || /Error validating access token/i.test(message)) {
    return 'Facebook Page access token is invalid or expired. Renew FACEBOOK_PAGE_ACCESS_TOKEN in Meta Business settings, then redeploy.';
  }
  if (code === 10 || code === 200) {
    return 'Meta blocked this request. The Page token likely needs pages_messaging/pages_read_engagement approval.';
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return 'Meta rate limit hit. Wait a few minutes and try again.';
  }
  return message || 'Meta API request failed.';
}

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
  // Customer conversations are sensitive — admin session required.
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: 'FACEBOOK_PAGE_ACCESS_TOKEN is not configured.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    // How many conversations to pull in total (paginated), and messages per thread.
    const convLimit = Math.min(parseInt(searchParams.get('limit') || '120', 10) || 120, 300);
    const msgLimit = Math.min(parseInt(searchParams.get('messages') || '20', 10) || 20, 50);

    // Resolve the page id (prefer env, fall back to /me)
    let pageId = PAGE_ID;
    if (!pageId) {
      const meRes = await fetch(`${GRAPH}/me?access_token=${PAGE_ACCESS_TOKEN}`);
      const me = await meRes.json();
      if (me.error) {
        return NextResponse.json({ error: metaErrorMessage(me.error), code: me.error.code }, { status: 502 });
      }
      pageId = me.id;
    }

    const fields = `id,updated_time,unread_count,participants,messages.limit(${msgLimit}){message,from,created_time,attachments}`;
    const perPage = 50;

    // Paginate through conversations so we surface more DMs and older history,
    // not just the most recent 25 threads.
    let next = `${GRAPH}/${pageId}/conversations?platform=messenger&fields=${fields}&limit=${perPage}&access_token=${PAGE_ACCESS_TOKEN}`;
    const rawConvs = [];
    let pageCount = 0;
    const maxPages = Math.ceil(convLimit / perPage) + 1;
    while (next && pageCount < maxPages && rawConvs.length < convLimit) {
      const res = await fetch(next, { cache: 'no-store' });
      const json = await res.json();
      if (json.error) {
        if (rawConvs.length === 0) {
          return NextResponse.json({ error: metaErrorMessage(json.error), code: json.error.code }, { status: 502 });
        }
        break; // keep what we already have
      }
      rawConvs.push(...(json.data || []));
      next = json.paging && json.paging.next;
      pageCount += 1;
    }

    const conversations = rawConvs.slice(0, convLimit).map((conv) => {
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
