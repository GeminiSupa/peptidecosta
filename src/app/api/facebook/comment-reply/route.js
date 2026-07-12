import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getPageAccessToken } from '@/lib/facebookPageToken';

const GRAPH = 'https://graph.facebook.com/v25.0';

function friendlyMetaError(err) {
  const code = err?.code;
  if (code === 190) return 'Facebook Page access token is invalid or expired. Renew it in Meta Business settings.';
  if (code === 10 || code === 200) return 'Meta blocked this reply. The Page token likely needs pages_manage_engagement approval.';
  if (code === 4 || code === 17 || code === 32 || code === 613) return 'Meta rate limit hit. Wait a few minutes before replying again.';
  return err?.message || 'Failed to reply to comment.';
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { commentId, message } = await request.json();
    const cleanCommentId = String(commentId || '').trim();
    const cleanMessage = String(message || '').trim();

    if (!cleanCommentId || !cleanMessage) {
      return NextResponse.json({ error: 'commentId and message are required.' }, { status: 400 });
    }

    const PAGE_ACCESS_TOKEN = await getPageAccessToken();
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'Facebook Page Access Token not configured.' }, { status: 500 });
    }

    const params = new URLSearchParams();
    params.set('access_token', PAGE_ACCESS_TOKEN);
    params.set('message', cleanMessage);

    const res = await fetch(`${GRAPH}/${cleanCommentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('[Facebook Comment Reply Error]', data);
      return NextResponse.json({
        error: friendlyMetaError(data.error),
        metaCode: data.error?.code,
      }, { status: res.status || 502 });
    }

    console.log(`[Facebook Comment Reply] Sent to ${cleanCommentId} by ${auth.user?.email || 'admin'}`);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Facebook Comment Reply Exception]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
