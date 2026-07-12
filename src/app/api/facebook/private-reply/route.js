import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getPageAccessToken } from '@/lib/facebookPageToken';

// Sends a private reply (a DM) to someone who commented on a Page post.
// Uses the current Meta Send API method: POST /me/messages with
// recipient.comment_id (me resolves to the Page via the Page token).
//
// Meta rules enforced here (violations count against the Page):
//   • ONE private reply per comment — ever.
//   • Only within 7 days of the comment being created.
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { commentId, message, commentCreatedAt } = await request.json();

    if (!commentId || !message) {
      return NextResponse.json({ error: 'commentId and message are required' }, { status: 400 });
    }

    const PAGE_ACCESS_TOKEN = await getPageAccessToken();
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Facebook Page Access Token not configured' }, { status: 500 });
    }

    // Pre-check the 7-day limit when the UI passes the comment's timestamp,
    // so we fail with a clear message instead of a policy strike.
    if (commentCreatedAt) {
      const age = Date.now() - new Date(commentCreatedAt).getTime();
      if (Number.isFinite(age) && age > 7 * 24 * 60 * 60 * 1000) {
        return NextResponse.json({
          error: 'This comment is older than 7 days — Meta no longer allows a private reply to it. Reply publicly on the post instead.',
        }, { status: 422 });
      }
    }

    const res = await fetch(
      `https://graph.facebook.com/v25.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          message: { text: message },
        }),
      }
    );
    const data = await res.json();

    if (!res.ok) {
      console.error('[Facebook Private Reply Error]', data);
      const raw = data.error?.message || '';
      // Meta only allows ONE private reply per comment; surface that clearly.
      const friendly = /already|once|one private reply|10900|10903/i.test(`${raw} ${data.error?.error_subcode || ''}`)
        ? 'A private reply was already sent for this comment — Meta allows only one, ever. Continue the conversation in Messenger if they responded.'
        : raw || 'Failed to send private reply';
      return NextResponse.json({ error: friendly }, { status: res.status });
    }

    console.log(`[Facebook Private Reply] Sent for comment ${commentId} by ${auth.user?.email || 'admin'}`);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Facebook Private Reply Exception]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
