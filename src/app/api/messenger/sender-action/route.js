import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';

// Sends Messenger "sender actions" (typing indicator, mark seen) so replies feel
// live to the customer. Uses the same Page token as the reply endpoint.
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const ALLOWED = new Set(['typing_on', 'typing_off', 'mark_seen']);

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { recipientId, action } = await request.json();

    if (!recipientId || !action) {
      return NextResponse.json({ error: 'recipientId and action are required' }, { status: 400 });
    }
    if (!ALLOWED.has(action)) {
      return NextResponse.json({ error: 'action must be typing_on, typing_off, or mark_seen' }, { status: 400 });
    }
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Facebook Page Access Token not configured' }, { status: 500 });
    }

    const res = await fetch(`https://graph.facebook.com/v25.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action: action }),
    });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message || 'Sender action failed' }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
