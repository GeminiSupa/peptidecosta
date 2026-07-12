import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const {
      commentId,
      postId,
      commenterName = 'Facebook Commenter',
      commentText = '',
      postPermalink = '',
    } = await request.json();

    const cleanCommentId = String(commentId || '').trim();
    if (!cleanCommentId) {
      return NextResponse.json({ error: 'commentId is required.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const contactValue = `facebook_comment_${cleanCommentId}`;
    const now = new Date().toISOString();
    const note = [
      `Hot lead from Facebook comment.`,
      commenterName ? `Name: ${commenterName}` : '',
      commentText ? `Comment: ${commentText}` : '',
      postPermalink ? `Post: ${postPermalink}` : '',
    ].filter(Boolean).join('\n');

    const { data: lead, error: leadError } = await supabase
      .from('catalog_leads')
      .upsert({
        contact_method: 'facebook_comment',
        contact_value: contactValue,
        language: 'es',
        status: 'Hot',
        notes: note,
        last_contacted_at: null,
        utm_source: 'facebook',
        utm_medium: 'comment',
        utm_campaign: postId || cleanCommentId,
        referrer: postPermalink || 'Facebook Page comment',
      }, { onConflict: 'contact_value' })
      .select('id')
      .single();

    if (leadError) {
      console.error('[Facebook Comment Lead] Save failed:', leadError);
      return NextResponse.json({ error: leadError.message }, { status: 500 });
    }

    await supabase.from('facebook_notifications').insert({
      type: 'lead',
      sender_name: commenterName || 'Facebook Commenter',
      sender_id: cleanCommentId,
      content: `Hot lead marked from Facebook comment.\n${commentText || ''}`.trim(),
      status: 'unread',
      raw_payload: {
        commentId: cleanCommentId,
        postId,
        commenterName,
        commentText,
        postPermalink,
        leadId: lead?.id || null,
        markedBy: auth.user?.email || null,
        markedAt: now,
      },
      external_link: postPermalink || null,
    });

    return NextResponse.json({ success: true, leadId: lead?.id || null });
  } catch (error) {
    console.error('[Facebook Comment Lead] Exception:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
