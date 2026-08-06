export const LIVE_CHAT_STATUSES = new Set(['open', 'pending', 'resolved']);
export const LIVE_CHAT_PRIORITIES = new Set(['low', 'normal', 'high']);
export const LIVE_CHAT_ATTACHMENT_BUCKET = 'live-chat-attachments';
export const LIVE_CHAT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const LIVE_CHAT_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

export function normalizeVisitorId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
}

export function normalizeLiveChatStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return LIVE_CHAT_STATUSES.has(status) ? status : 'open';
}

export function normalizeLiveChatPriority(value) {
  const priority = String(value || '').trim().toLowerCase();
  return LIVE_CHAT_PRIORITIES.has(priority) ? priority : 'normal';
}

export function cleanLiveChatText(value, limit = 2000) {
  if (value == null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, limit);
}

// Rows stored before the widget stopped forwarding the click event to the API
// hold the literal string "[object Object]". cleanLiveChatText keeps new ones
// out; this keeps the old ones off the screen on both sides of the chat.
const UNRENDERABLE_MESSAGES = new Set(['[object Object]', 'undefined', 'null', 'NaN']);

export function renderLiveChatMessage(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return UNRENDERABLE_MESSAGES.has(text) ? '' : text;
}

export function cleanOptionalText(value, limit = 500) {
  const text = String(value || '').trim().slice(0, limit);
  return text || null;
}

// The visitor profile lives in the browser's localStorage, so a cleared browser
// or a second device sends blanks. Upserting those blanks would erase contact
// details the visitor already gave us and silently un-qualify the lead, so only
// the fields that actually carry a value are written.
export function buildVisitorIdentityPatch({ name, email, phone } = {}) {
  const patch = {};
  if (name) patch.visitor_name = name;
  if (email) patch.visitor_email = email;
  if (phone) patch.visitor_phone = phone;
  return patch;
}

export function normalizeLiveChatEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email.slice(0, 255) : '';
}

export function normalizeLiveChatPhone(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 32);
}

export function getLiveChatLeadContact(conversation) {
  const email = normalizeLiveChatEmail(conversation?.visitorEmail || conversation?.visitor_email);
  if (email) {
    return {
      method: 'email',
      value: email,
      email,
      phone: normalizeLiveChatPhone(conversation?.visitorPhone || conversation?.visitor_phone),
    };
  }

  const phone = normalizeLiveChatPhone(conversation?.visitorPhone || conversation?.visitor_phone);
  if (phone.length >= 8) {
    return {
      method: 'whatsapp',
      value: phone,
      email: '',
      phone,
    };
  }

  return null;
}

export function buildLiveChatLeadNote(conversation) {
  const messages = conversation?.messages || [];
  const firstVisitorMessage = messages.find((message) => message.senderType === 'visitor');
  const hasAttachment = messages.some((message) => message.attachments?.length > 0);

  return [
    'Lead captured from website live chat.',
    conversation?.visitorName ? `Name: ${conversation.visitorName}` : '',
    conversation?.visitorEmail ? `Email: ${conversation.visitorEmail}` : '',
    conversation?.visitorPhone ? `Phone: ${conversation.visitorPhone}` : '',
    firstVisitorMessage?.message ? `First message: ${firstVisitorMessage.message}` : '',
    hasAttachment ? 'Intent signal: uploaded payment screenshot/document.' : '',
    conversation?.pageUrl ? `Page: ${conversation.pageUrl}` : '',
    conversation?.referrer ? `Referrer: ${conversation.referrer}` : '',
  ].filter(Boolean).join('\n');
}

export function cleanLiveChatFileName(value) {
  const fallback = 'attachment';
  const cleaned = String(value || fallback)
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 140);
  return cleaned || fallback;
}

export function getLiveChatFileExtension(fileName, mimeType = '') {
  const nameExt = String(fileName || '').split('.').pop()?.toLowerCase();
  if (nameExt && /^[a-z0-9]{2,8}$/.test(nameExt)) return nameExt;
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

export function validateLiveChatAttachment(file) {
  if (!file || typeof file === 'string') {
    return 'File is required.';
  }
  if (file.size > LIVE_CHAT_ATTACHMENT_MAX_BYTES) {
    return 'File is too large. Maximum size is 8 MB.';
  }
  if (!LIVE_CHAT_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return 'Only images and PDF files can be uploaded.';
  }
  return '';
}

export function buildLiveChatAttachmentPath(visitorId, fileName, mimeType = '') {
  const cleanName = cleanLiveChatFileName(fileName);
  const extension = getLiveChatFileExtension(cleanName, mimeType);
  const baseName = cleanName.replace(/\.[^.]+$/, '') || 'attachment';
  const nonce = Math.random().toString(36).slice(2, 10);
  return `${visitorId}/${Date.now()}-${nonce}-${baseName}.${extension}`;
}

export function getLiveChatAttachmentPreviewText(attachments = []) {
  const count = attachments.length;
  if (count <= 0) return '';
  if (count === 1) return attachments[0]?.kind === 'image' ? 'Image uploaded' : 'File uploaded';
  return `${count} files uploaded`;
}

export async function ensureLiveChatAttachmentBucket(supabase) {
  const { data, error } = await supabase.storage.getBucket(LIVE_CHAT_ATTACHMENT_BUCKET);
  if (!error && data) return;

  const { error: createError } = await supabase.storage.createBucket(LIVE_CHAT_ATTACHMENT_BUCKET, {
    public: false,
    fileSizeLimit: LIVE_CHAT_ATTACHMENT_MAX_BYTES,
    allowedMimeTypes: [...LIVE_CHAT_ATTACHMENT_MIME_TYPES],
  });

  if (createError && !/already exists/i.test(createError.message || '')) {
    throw createError;
  }
}

export function formatLiveChatAttachment(value) {
  if (!value || typeof value !== 'object') return null;
  const bucket = cleanOptionalText(value.bucket, 120) || LIVE_CHAT_ATTACHMENT_BUCKET;
  const path = cleanOptionalText(value.path, 500);
  const name = cleanOptionalText(value.name, 180) || 'attachment';
  const type = cleanOptionalText(value.type, 120) || 'application/octet-stream';
  if (!path) return null;

  return {
    bucket,
    path,
    name,
    type,
    size: Number.isFinite(Number(value.size)) ? Number(value.size) : 0,
    kind: String(type).startsWith('image/') ? 'image' : 'file',
    url: cleanOptionalText(value.url, 2000) || '',
  };
}

export function formatLiveChatConversation(row, messages = []) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};

  return {
    id: row.id,
    visitorId: row.visitor_id,
    visitorName: row.visitor_name || 'Website visitor',
    visitorEmail: row.visitor_email || '',
    visitorPhone: row.visitor_phone || '',
    pageUrl: row.page_url || '',
    referrer: row.referrer || '',
    status: row.status || 'open',
    priority: row.priority || 'normal',
    assignedTo: row.assigned_to || null,
    assignedToEmail: row.assigned_to_email || '',
    assignedToName: row.assigned_to_name || '',
    lastMessage: row.last_message || '',
    lastMessageAt: row.last_message_at || row.updated_at || row.created_at,
    lastCustomerMessageAt: row.last_customer_message_at || null,
    lastAgentMessageAt: row.last_agent_message_at || null,
    unreadForAgent: Boolean(row.unread_for_agent),
    unreadForVisitor: Boolean(row.unread_for_visitor),
    metadata,
    leadContext: metadata.leadContext || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: messages.map(formatLiveChatMessage),
  };
}

export function formatLiveChatMessage(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const attachments = Array.isArray(metadata.attachments)
    ? metadata.attachments.map(formatLiveChatAttachment).filter(Boolean)
    : [];

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    senderName: row.sender_name || '',
    senderEmail: row.sender_email || '',
    message: row.message || '',
    attachments,
    createdAt: row.created_at,
  };
}

export async function signLiveChatAttachmentUrls(supabase, conversation) {
  const messages = [];
  for (const message of conversation?.messages || []) {
    const attachments = [];
    for (const attachment of message.attachments || []) {
      const next = { ...attachment };
      if (attachment.bucket === LIVE_CHAT_ATTACHMENT_BUCKET && attachment.path) {
        const { data } = await supabase.storage
          .from(LIVE_CHAT_ATTACHMENT_BUCKET)
          .createSignedUrl(attachment.path, 60 * 10);
        next.url = data?.signedUrl || '';
      }
      attachments.push(next);
    }
    messages.push({ ...message, attachments });
  }
  return { ...conversation, messages };
}

export function isMissingLiveChatTable(error) {
  if (!error) return false;
  const message = String(error.message || '');
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (/live_chat_/i.test(message) && /does not exist|schema cache|could not find/i.test(message))
  );
}
