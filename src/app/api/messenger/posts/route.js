import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getPageAccessToken } from '@/lib/facebookPageToken';

// Live Facebook Post + Comments feed for the admin dashboard.
// Requires the page token to have `pages_read_user_content` (Standard Access is
// enough for the page's own content). Reports comment counts and whether the
// Page has publicly replied to each comment.
const PAGE_ID = process.env.FACEBOOK_PAGE_ID || process.env.MESSENGER_PAGE_ID || '';
const GRAPH = 'https://graph.facebook.com/v25.0';

async function resolvePageId(token) {
  if (PAGE_ID) return PAGE_ID;
  const me = await (await fetch(`${GRAPH}/me?access_token=${token}`)).json();
  if (me.error) throw new Error(metaErrorMessage(me.error));
  return me.id;
}

function metaErrorMessage(error) {
  const code = error?.code;
  if (code === 190) return 'Facebook Page access token is invalid or expired. Renew it in Meta Business settings.';
  if (code === 10 || code === 200) return 'Meta blocked this action. The Page token likely needs pages_manage_posts/pages_read_engagement approval.';
  if (code === 4 || code === 17 || code === 32 || code === 613) return 'Meta rate limit hit. Wait a few minutes and try again.';
  return error?.message || 'Meta API request failed.';
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const PAGE_ACCESS_TOKEN = await getPageAccessToken();
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'FACEBOOK_PAGE_ACCESS_TOKEN is not configured.' }, { status: 500 });
    }

    let pageId;
    try {
      pageId = await resolvePageId(PAGE_ACCESS_TOKEN);
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '12', 10) || 12, 25);

    const fields = [
      'id',
      'message',
      'created_time',
      'permalink_url',
      'shares',
      'reactions.summary(true)',
      'comments.summary(true).limit(40){id,message,from,created_time,comments.limit(5){from}}',
    ].join(',');

    const url = `${GRAPH}/${pageId}/published_posts?fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${PAGE_ACCESS_TOKEN}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    if (json.error) {
      return NextResponse.json({ error: metaErrorMessage(json.error), code: json.error.code }, { status: 502 });
    }

    let scheduledPosts = [];
    let leadAds = [];
    try {
      const scheduledFields = ['id', 'message', 'scheduled_publish_time', 'created_time'].join(',');
      const scheduledUrl = `${GRAPH}/${pageId}/scheduled_posts?fields=${encodeURIComponent(scheduledFields)}&limit=10&access_token=${PAGE_ACCESS_TOKEN}`;
      const scheduledRes = await fetch(scheduledUrl, { cache: 'no-store' });
      const scheduledJson = await scheduledRes.json();
      if (!scheduledJson.error) {
        scheduledPosts = (scheduledJson.data || []).map((p) => ({
          id: p.id,
          message: (p.message || '').trim() || '(scheduled post)',
          scheduledTime: p.scheduled_publish_time ? Number(p.scheduled_publish_time) * 1000 : null,
          createdTime: p.created_time,
        }));
      }
    } catch (scheduledErr) {
      console.warn('[Messenger Posts] Scheduled posts unavailable:', scheduledErr.message);
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data: leadRows, error: leadError } = await supabase
        .from('facebook_notifications')
        .select('id,sender_name,email,phone,content,status,created_at,raw_payload,external_link')
        .eq('type', 'lead')
        .order('created_at', { ascending: false })
        .limit(25);
      if (leadError) throw leadError;
      leadAds = (leadRows || []).map((row) => ({
        id: row.id,
        name: row.sender_name || 'Facebook Lead',
        email: row.email || '',
        phone: row.phone || '',
        status: row.status || 'unread',
        createdAt: row.created_at,
        content: row.content || '',
        campaign: row.raw_payload?.form_id || row.raw_payload?.campaign_name || row.raw_payload?.utm_campaign || '',
        source: row.raw_payload?.platform || 'Facebook Lead Ads',
        externalLink: row.external_link || null,
      }));
    } catch (leadErr) {
      console.warn('[Messenger Posts] Lead Ads inbox unavailable:', leadErr.message);
    }

    let totalComments = 0;
    let totalReplied = 0;

    const posts = (json.data || []).map((p) => {
      const rawComments = (p.comments && p.comments.data) || [];
      const comments = rawComments.map((c) => {
        const replies = (c.comments && c.comments.data) || [];
        const pageReplied = replies.some((r) => r.from && r.from.id === pageId);
        return {
          id: c.id,
          message: c.message || '',
          from: (c.from && c.from.name) || 'Facebook User',
          fromId: (c.from && c.from.id) || null,
          createdTime: c.created_time,
          pageReplied,
        };
      });
      const commentCount = (p.comments && p.comments.summary && p.comments.summary.total_count) || comments.length;
      const repliedCount = comments.filter((c) => c.pageReplied).length;
      totalComments += commentCount;
      totalReplied += repliedCount;

      const text = (p.message || '').trim();
      return {
        id: p.id,
        message: text || '(photo / no text)',
        createdTime: p.created_time,
        permalink: p.permalink_url || null,
        reactions: (p.reactions && p.reactions.summary && p.reactions.summary.total_count) || 0,
        shares: (p.shares && p.shares.count) || 0,
        commentCount,
        repliedCount,
        comments,
      };
    });
    const topPosts = [...posts]
      .sort((a, b) => {
        const scoreA = (a.reactions || 0) + (a.commentCount || 0) * 3 + (a.shares || 0) * 5;
        const scoreB = (b.reactions || 0) + (b.commentCount || 0) * 3 + (b.shares || 0) * 5;
        return scoreB - scoreA;
      })
      .slice(0, 5)
      .map((post) => ({
        id: post.id,
        message: post.message,
        permalink: post.permalink,
        reactions: post.reactions,
        comments: post.commentCount,
        shares: post.shares,
        score: (post.reactions || 0) + (post.commentCount || 0) * 3 + (post.shares || 0) * 5,
      }));

    return NextResponse.json({
      pageId,
      summary: {
        posts: posts.length,
        scheduled: scheduledPosts.length,
        leadAds: leadAds.length,
        totalComments,
        totalReplied,
        replyRate: totalComments ? Math.round((totalReplied / totalComments) * 100) : 0,
      },
      scheduledPosts,
      leadAds,
      topPosts,
      posts,
    });
  } catch (err) {
    console.error('[Messenger Posts] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const PAGE_ACCESS_TOKEN = await getPageAccessToken();
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'FACEBOOK_PAGE_ACCESS_TOKEN is not configured.' }, { status: 500 });
    }

    const { message = '', link = '', imageUrl = '', scheduledAt = '' } = await request.json();
    const cleanMessage = String(message || '').trim();
    const cleanLink = String(link || '').trim();
    const cleanImageUrl = String(imageUrl || '').trim();
    const cleanScheduledAt = String(scheduledAt || '').trim();

    if (!cleanMessage && !cleanLink && !cleanImageUrl) {
      return NextResponse.json({ error: 'Add a message, link, or image URL before publishing.' }, { status: 400 });
    }

    let scheduledTimestamp = null;
    if (cleanScheduledAt) {
      const scheduledMs = new Date(cleanScheduledAt).getTime();
      if (!Number.isFinite(scheduledMs)) {
        return NextResponse.json({ error: 'Scheduled time is invalid.' }, { status: 400 });
      }
      const minMs = Date.now() + 10 * 60 * 1000;
      const maxMs = Date.now() + 75 * 24 * 60 * 60 * 1000;
      if (scheduledMs < minMs) {
        return NextResponse.json({ error: 'Schedule at least 10 minutes in the future for Facebook scheduled posts.' }, { status: 400 });
      }
      if (scheduledMs > maxMs) {
        return NextResponse.json({ error: 'Facebook scheduled posts must be within about 75 days.' }, { status: 400 });
      }
      scheduledTimestamp = Math.floor(scheduledMs / 1000);
    }

    const pageId = await resolvePageId(PAGE_ACCESS_TOKEN);
    const isPhotoPost = Boolean(cleanImageUrl);
    const endpoint = isPhotoPost ? `${GRAPH}/${pageId}/photos` : `${GRAPH}/${pageId}/feed`;
    const params = new URLSearchParams();
    params.set('access_token', PAGE_ACCESS_TOKEN);

    if (isPhotoPost) {
      params.set('url', cleanImageUrl);
      if (cleanMessage || cleanLink) {
        params.set('caption', [cleanMessage, cleanLink].filter(Boolean).join('\n\n'));
      }
    } else {
      if (cleanMessage) params.set('message', cleanMessage);
      if (cleanLink) params.set('link', cleanLink);
    }

    if (scheduledTimestamp) {
      params.set('published', 'false');
      params.set('scheduled_publish_time', String(scheduledTimestamp));
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      console.error('[Messenger Posts] Publish error:', data);
      return NextResponse.json({
        error: metaErrorMessage(data.error),
        metaCode: data.error?.code,
      }, { status: res.status || 502 });
    }

    console.log(`[Messenger Posts] ${scheduledTimestamp ? 'Scheduled' : 'Published'} Page post by ${auth.user?.email || 'admin'}`);
    return NextResponse.json({
      success: true,
      scheduled: Boolean(scheduledTimestamp),
      postId: data.post_id || data.id,
      raw: data,
    });
  } catch (err) {
    console.error('[Messenger Posts] Publish exception:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
