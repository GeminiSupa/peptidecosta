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

/**
 * Country codes offered beside the phone box, Costa Rica first because it is
 * both the default and where most visitors are.
 *
 * Deliberately a short list rather than all ~200: a visitor scrolling past
 * Kazakhstan to reach Costa Rica is worse served than one from an unlisted
 * country typing their number in full, which still validates.
 */
// `digits` is an exact local length, set only where it is genuinely fixed —
// Costa Rica is always 8, the North American plan always 10. Everywhere else is
// left to the 7-digit floor rather than guessed at, because a wrong length here
// turns a real customer away at the door.
// Both spellings, because the widget runs in Spanish by default and a list
// reading "Mexico, Spain, Germany" under Spanish labels is the one place the
// language slips.
export const LIVE_CHAT_DIAL_CODES = [
  { code: '+506', label: 'Costa Rica', labelEs: 'Costa Rica', digits: 8 },
  { code: '+1', label: 'USA / Canada', labelEs: 'EE. UU. / Canadá', digits: 10 },
  { code: '+52', label: 'Mexico', labelEs: 'México' },
  { code: '+502', label: 'Guatemala', labelEs: 'Guatemala' },
  { code: '+503', label: 'El Salvador', labelEs: 'El Salvador' },
  { code: '+504', label: 'Honduras', labelEs: 'Honduras' },
  { code: '+505', label: 'Nicaragua', labelEs: 'Nicaragua' },
  { code: '+507', label: 'Panama', labelEs: 'Panamá' },
  { code: '+57', label: 'Colombia', labelEs: 'Colombia' },
  { code: '+58', label: 'Venezuela', labelEs: 'Venezuela' },
  { code: '+51', label: 'Peru', labelEs: 'Perú' },
  { code: '+593', label: 'Ecuador', labelEs: 'Ecuador' },
  { code: '+56', label: 'Chile', labelEs: 'Chile' },
  { code: '+54', label: 'Argentina', labelEs: 'Argentina' },
  { code: '+55', label: 'Brazil', labelEs: 'Brasil' },
  { code: '+34', label: 'Spain', labelEs: 'España' },
  { code: '+44', label: 'United Kingdom', labelEs: 'Reino Unido' },
  { code: '+49', label: 'Germany', labelEs: 'Alemania' },
  { code: '+33', label: 'France', labelEs: 'Francia' },
  { code: '+39', label: 'Italy', labelEs: 'Italia' },
  { code: '+61', label: 'Australia', labelEs: 'Australia' },
  { code: '+92', label: 'Pakistan', labelEs: 'Pakistán' },
  { code: '+91', label: 'India', labelEs: 'India' },
];

/** The country name in the language the widget is running in. */
export function dialCodeLabel(entry, lang) {
  if (!entry) return '';
  return lang === 'en' ? entry.label : (entry.labelEs || entry.label);
}

export const DEFAULT_LIVE_CHAT_DIAL_CODE = '+506';

export function isLiveChatDialCode(value) {
  return LIVE_CHAT_DIAL_CODES.some((entry) => entry.code === value);
}

// Longest first, so +506 is never mistaken for +50 or +5.
const DIAL_CODES_BY_LENGTH = [...LIVE_CHAT_DIAL_CODES]
  .map((entry) => entry.code)
  .sort((a, b) => b.length - a.length);

/**
 * A stored number split back into a country code and the local part, so a
 * visitor returning to the widget sees the picker on the country they chose
 * rather than their code sitting in the text box.
 *
 * Numbers saved before the picker existed are bare local ones, and fall
 * through to the default country — which is what they were.
 */
export function splitLiveChatPhone(value) {
  const phone = String(value || '').trim();
  for (const code of DIAL_CODES_BY_LENGTH) {
    if (phone.startsWith(code)) {
      return { dialCode: code, localNumber: phone.slice(code.length).trim() };
    }
  }
  return { dialCode: DEFAULT_LIVE_CHAT_DIAL_CODE, localNumber: phone };
}

/**
 * The country code and local number joined into the one string stored against
 * the lead. Empty when there is no local number: a bare "+506" is a country,
 * not a phone number, and must not read as one in the CRM.
 */
export function composeLiveChatPhone(dialCode, localNumber) {
  const local = String(localNumber || '').trim();
  if (!local) return '';
  const code = isLiveChatDialCode(dialCode) ? dialCode : DEFAULT_LIVE_CHAT_DIAL_CODE;
  // Already carries its own country code, so it is used as typed rather than
  // prefixed twice.
  if (local.startsWith('+')) return local;
  return `${code} ${local}`;
}

/**
 * A chat cannot start until we can reach the person back: a name, plus an email
 * or a phone number.
 *
 * The fields are checked for being usable, not merely non-empty. "a" in the
 * email box would pass a blank check and leave the CRM holding a lead nobody
 * can answer, which is the exact thing the requirement exists to prevent. The
 * tests are deliberately loose on format beyond that — a real customer turned
 * away by a strict pattern costs more than a typo that an agent can query.
 */
export function isUsableEmail(value) {
  const email = String(value || '').trim();
  // One @, something either side, and a dot in the domain. Nothing stricter:
  // real addresses break every "clever" pattern.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export const LIVE_CHAT_MIN_PHONE_DIGITS = 7;

export function isUsablePhone(value) {
  // The country code is taken off before counting, or it would pad the number
  // towards the minimum on its own: "+506 1234" is 7 digits but only 4 of them
  // are a phone number.
  const { dialCode, localNumber } = splitLiveChatPhone(value);
  // Digits only, so "6062 6224", "6062-6224" and "6062.6224" are all the same
  // number — a visitor should never be rejected over a dash.
  const digits = localNumber.replace(/\D/g, '').length;

  const country = LIVE_CHAT_DIAL_CODES.find((entry) => entry.code === dialCode);
  if (country?.digits) return digits === country.digits;
  return digits >= LIVE_CHAT_MIN_PHONE_DIGITS;
}

/**
 * Which requirements a profile still fails: 'name', 'contact', or both. An
 * array rather than a boolean so the widget can say what is actually missing
 * instead of a blanket "fill in the form".
 */
export function missingLiveChatContact({ name, email, phone } = {}) {
  const missing = [];
  if (!String(name || '').trim()) missing.push('name');
  if (!isUsableEmail(email) && !isUsablePhone(phone)) missing.push('contact');
  return missing;
}

export function canStartLiveChat(profile) {
  return missingLiveChatContact(profile).length === 0;
}

// Whether the pre-chat form (name/email/phone) should be on screen.
// `knownVisitor` MUST be the load-time answer to "did we already have this
// visitor's details", never a value derived from the fields as they are typed:
// deriving it live flipped it true on the first keystroke of the name and
// unmounted the inputs mid-entry, so nobody ever reached email or phone and
// every chat arrived in the CRM unqualified.
export function shouldShowVisitorProfileForm({
  knownVisitor = false,
  messageCount = 0,
  showDetails = false,
} = {}) {
  if (showDetails) return true;
  return !knownVisitor && messageCount === 0;
}

// The inbox status chips. `new` is a work queue rather than a stored status:
// it is everything still live that nobody has claimed, so a chat leaves it the
// moment an agent takes it (by assigning, or just by replying). Keeping this
// here rather than inline in the component means the list and the chip counts
// can never drift apart.
export function matchesLiveChatStatusFilter(conversation, statusFilter) {
  if (!conversation) return false;
  if (statusFilter === 'all') return true;
  if (statusFilter === 'new') {
    return conversation.status !== 'resolved' && !conversation.assignedTo;
  }
  return conversation.status === statusFilter;
}

export function matchesLiveChatOwnerFilter(conversation, ownerFilter, currentUserId) {
  if (!conversation) return false;
  if (ownerFilter === 'mine') return Boolean(currentUserId) && conversation.assignedTo === currentUserId;
  if (ownerFilter === 'unassigned') return !conversation.assignedTo;
  return true;
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
