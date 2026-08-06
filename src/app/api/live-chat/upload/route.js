import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  buildLiveChatAttachmentPath,
  cleanLiveChatFileName,
  cleanLiveChatText,
  cleanOptionalText,
  ensureLiveChatAttachmentBucket,
  formatLiveChatConversation,
  getLiveChatAttachmentPreviewText,
  isMissingLiveChatTable,
  LIVE_CHAT_ATTACHMENT_BUCKET,
  normalizeVisitorId,
  signLiveChatAttachmentUrls,
  validateLiveChatAttachment,
} from '@/lib/liveChat';

export const runtime = 'nodejs';

const MESSAGE_LIMIT = 150;

function getRequestOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin) return origin;
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

async function loadConversation(supabase, visitorId) {
  const { data: conversation, error } = await supabase
    .from('live_chat_conversations')
    .select('*')
    .eq('visitor_id', visitorId)
    .maybeSingle();

  if (error) throw error;
  if (!conversation) return null;

  const { data: messages, error: messageError } = await supabase
    .from('live_chat_messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(MESSAGE_LIMIT);

  if (messageError) throw messageError;
  return signLiveChatAttachmentUrls(supabase, formatLiveChatConversation(conversation, messages || []));
}

export async function POST(request) {
  let uploadedPath = '';

  try {
    const form = await request.formData();
    const visitorId = normalizeVisitorId(form.get('visitorId'));
    const file = form.get('file');
    const validationError = validateLiveChatAttachment(file);

    if (!visitorId) return NextResponse.json({ error: 'visitorId is required' }, { status: 400 });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const supabase = getSupabaseAdmin();
    await ensureLiveChatAttachmentBucket(supabase);

    const visitorName = cleanOptionalText(form.get('visitorName'), 120);
    const visitorEmail = cleanOptionalText(form.get('visitorEmail'), 200);
    const visitorPhone = cleanOptionalText(form.get('visitorPhone'), 80);
    const pageUrl = cleanOptionalText(form.get('pageUrl'), 1000);
    const referrer = cleanOptionalText(form.get('referrer'), 1000);
    const caption = cleanLiveChatText(form.get('message'), 800);
    const fileName = cleanLiveChatFileName(file.name);
    const path = buildLiveChatAttachmentPath(visitorId, fileName, file.type);
    uploadedPath = path;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(LIVE_CHAT_ATTACHMENT_BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const now = new Date().toISOString();
    const attachment = {
      bucket: LIVE_CHAT_ATTACHMENT_BUCKET,
      path,
      name: fileName,
      type: file.type,
      size: file.size,
      kind: file.type.startsWith('image/') ? 'image' : 'file',
    };
    const preview = caption || getLiveChatAttachmentPreviewText([attachment]);

    const { data: conversation, error: upsertError } = await supabase
      .from('live_chat_conversations')
      .upsert({
        visitor_id: visitorId,
        visitor_name: visitorName,
        visitor_email: visitorEmail,
        visitor_phone: visitorPhone,
        page_url: pageUrl,
        referrer,
        status: 'open',
        last_message: preview,
        last_message_at: now,
        last_customer_message_at: now,
        unread_for_agent: true,
        unread_for_visitor: false,
        metadata: {
          userAgent: cleanOptionalText(request.headers.get('user-agent'), 500),
          origin: getRequestOrigin(request),
        },
        updated_at: now,
      }, { onConflict: 'visitor_id' })
      .select('*')
      .single();

    if (upsertError) throw upsertError;

    const { error: messageError } = await supabase
      .from('live_chat_messages')
      .insert({
        conversation_id: conversation.id,
        sender_type: 'visitor',
        sender_name: visitorName,
        sender_email: visitorEmail,
        message: caption || preview,
        metadata: { attachments: [attachment] },
      });

    if (messageError) throw messageError;

    const loaded = await loadConversation(supabase, visitorId);
    return NextResponse.json({ success: true, conversation: loaded });
  } catch (err) {
    if (uploadedPath) {
      try {
        await getSupabaseAdmin().storage.from(LIVE_CHAT_ATTACHMENT_BUCKET).remove([uploadedPath]);
      } catch {}
    }
    if (isMissingLiveChatTable(err)) {
      return NextResponse.json({ error: 'Live chat tables are not installed yet.' }, { status: 409 });
    }
    console.error('[live-chat/upload] POST failed:', err);
    return NextResponse.json({ error: err.message || 'Could not upload file.' }, { status: 500 });
  }
}
