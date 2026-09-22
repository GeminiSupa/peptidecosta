import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  listAccountConversations,
  loadConversationMessages,
  sendConversationReply,
} from '@/lib/chatwootConversations.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value, limit = 60) => String(value ?? '').trim().slice(0, limit);

// GET /api/admin/chatwoot?status=open&page=1 — the conversation list.
// GET /api/admin/chatwoot?conversationId=123 — one conversation's messages.
// The "chatwoot" tab permission gates both, through adminApiPermissions.
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const conversationId = clean(params.get('conversationId'), 40);

  try {
    if (conversationId) {
      const result = await loadConversationMessages({ conversationId });
      return NextResponse.json(result);
    }
    const result = await listAccountConversations({
      status: clean(params.get('status'), 20),
      page: clean(params.get('page'), 6),
    });
    return NextResponse.json(result);
  } catch (error) {
    // A conversation that no longer exists is the caller's 404, not a
    // Chatwoot outage; anything else is reported as an upstream failure.
    const status = [401, 403, 404].includes(error.status) ? error.status : 502;
    if (status === 502) console.error('[Chatwoot inbox] Could not load from Chatwoot:', error.message);
    return NextResponse.json(
      { error: `Could not load from Chatwoot: ${error.message}` },
      { status },
    );
  }
}

// POST /api/admin/chatwoot { conversationId, content } — sends an agent reply.
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  try {
    const message = await sendConversationReply({
      conversationId: clean(body?.conversationId, 40),
      content: body?.content,
    });
    return NextResponse.json({ message });
  } catch (error) {
    const status = [400, 404, 503].includes(error.status) ? error.status : 502;
    if (status === 502) console.error('[Chatwoot inbox] Could not send reply:', error.message);
    return NextResponse.json({ error: error.message || 'Could not send the reply' }, { status });
  }
}
