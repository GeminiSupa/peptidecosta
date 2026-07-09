import { NextResponse } from 'next/server';

// Live Facebook Post + Comments feed for the admin dashboard.
// Requires the page token to have `pages_read_user_content` (Standard Access is
// enough for the page's own content). Reports comment counts and whether the
// Page has publicly replied to each comment.
const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID || process.env.MESSENGER_PAGE_ID || '';
const GRAPH = 'https://graph.facebook.com/v25.0';

export async function GET(request) {
  try {
    if (!PAGE_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'FACEBOOK_PAGE_ACCESS_TOKEN is not configured.' }, { status: 500 });
    }

    let pageId = PAGE_ID;
    if (!pageId) {
      const me = await (await fetch(`${GRAPH}/me?access_token=${PAGE_ACCESS_TOKEN}`)).json();
      if (me.error) return NextResponse.json({ error: me.error.message, code: me.error.code }, { status: 502 });
      pageId = me.id;
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
      return NextResponse.json({ error: json.error.message, code: json.error.code }, { status: 502 });
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

    return NextResponse.json({
      pageId,
      summary: {
        posts: posts.length,
        totalComments,
        totalReplied,
        replyRate: totalComments ? Math.round((totalReplied / totalComments) * 100) : 0,
      },
      posts,
    });
  } catch (err) {
    console.error('[Messenger Posts] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
