import { NextResponse } from 'next/server';

// Sends a private reply (a DM) to someone who commented on a Page post.
// Meta rule: one private reply per comment, within 7 days of the comment.
export async function POST(request) {
  try {
    const { commentId, message } = await request.json();

    if (!commentId || !message) {
      return NextResponse.json({ error: 'commentId and message are required' }, { status: 400 });
    }

    const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Facebook Page Access Token not configured' }, { status: 500 });
    }

    const res = await fetch(
      `https://graph.facebook.com/v25.0/${commentId}/private_replies?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }
    );
    const data = await res.json();

    if (!res.ok) {
      console.error('[Facebook Private Reply Error]', data);
      return NextResponse.json(
        { error: data.error?.message || 'Failed to send private reply' },
        { status: res.status }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Facebook Private Reply Exception]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
