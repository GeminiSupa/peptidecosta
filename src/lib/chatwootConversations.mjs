// Reads a lead's Chatwoot conversations and posts agent replies for the
// Chatwoot tab in the Lead Profile. Deliberately separate from
// chatwootLead.mjs, which opens the conversation when a lead arrives and is
// left untouched: both files use the same CHATWOOT_* variables and token.

const TIMEOUT_MS = 8000;
// Chatwoot returns 20 messages per page; 50 pages is 1,000 messages, far past
// any real lead chat, and stops a bad cursor from looping forever.
const MAX_MESSAGE_PAGES = 50;
export const CHATWOOT_REPLY_MAX_LENGTH = 4000;
export const CHATWOOT_STATUSES = ['open', 'pending', 'snoozed', 'resolved'];

const clean = (value) => String(value ?? '').trim();

// Same variables chatwootLead.mjs reads. The inbox ID is not needed here: a
// lead's conversations are listed through the contact, whatever inbox they
// are in.
export function readChatwootApiConfig(env = process.env) {
  const baseUrl = clean(env.CHATWOOT_BASE_URL).replace(/\/+$/, '');
  const accountId = clean(env.CHATWOOT_ACCOUNT_ID);
  const accessToken = clean(env.CHATWOOT_API_ACCESS_TOKEN);
  return {
    baseUrl,
    accountId,
    accessToken,
    configured: Boolean(baseUrl && accountId && accessToken),
  };
}

/** The contact identifier chatwootLead.mjs gives every lead it sends over. */
export function chatwootLeadIdentifier(leadId) {
  return `google-ads-lead-${clean(leadId)}`;
}

async function chatwootGet(config, path, fetchImpl) {
  return chatwootCall(config, path, { fetchImpl });
}

async function chatwootCall(config, path, { fetchImpl, method = 'GET', body } = {}) {
  const response = await fetchImpl(`${config.baseUrl}/api/v1/accounts/${config.accountId}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', api_access_token: config.accessToken },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = clean(payload?.message || payload?.error || payload?.errors?.[0])
      || `Chatwoot returned ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/**
 * Finds the lead's Chatwoot contact by the identifier the lead was sent with.
 * Falls back to the contact ID the CRM already stored for the lead (the
 * webhook records it), so a chat linked some other way still shows up.
 */
export async function findLeadChatwootContactId({ config, lead, fetchImpl = fetch }) {
  const identifier = chatwootLeadIdentifier(lead?.id);
  const result = await chatwootGet(
    config,
    `/contacts/search?q=${encodeURIComponent(identifier)}`,
    fetchImpl,
  );
  const contacts = Array.isArray(result?.payload) ? result.payload : [];
  const match = contacts.find((contact) => clean(contact?.identifier) === identifier);
  if (match?.id) return match.id;
  return lead?.chatwoot_contact_id || null;
}

export function normalizeChatwootStatus(status) {
  const value = clean(status).toLowerCase();
  return CHATWOOT_STATUSES.includes(value) ? value : 'open';
}

function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Chatwoot message_type: 0 incoming (the lead), 1 outgoing (an agent),
// 2 activity (status changes, assignments), 3 template (sent by the system).
function messageKind(type) {
  const value = clean(type).toLowerCase();
  if (value === '0' || value === 'incoming') return 'incoming';
  if (value === '2' || value === 'activity') return 'activity';
  return 'outgoing';
}

export function normalizeChatwootMessage(message) {
  return {
    id: message?.id ?? null,
    kind: messageKind(message?.message_type),
    private: Boolean(message?.private),
    content: clean(message?.content),
    createdAt: toIso(message?.created_at),
    senderName: clean(message?.sender?.name || message?.sender?.available_name),
    attachments: (Array.isArray(message?.attachments) ? message.attachments : [])
      .map((attachment) => ({
        url: clean(attachment?.data_url),
        type: clean(attachment?.file_type) || 'file',
      }))
      .filter((attachment) => attachment.url),
  };
}

export function normalizeChatwootConversation(conversation, config) {
  const assignee = conversation?.meta?.assignee || null;
  return {
    id: conversation?.id ?? null,
    status: normalizeChatwootStatus(conversation?.status),
    inboxId: conversation?.inbox_id ?? null,
    assigneeName: clean(assignee?.name || assignee?.available_name),
    createdAt: toIso(conversation?.created_at),
    lastActivityAt: toIso(conversation?.last_activity_at || conversation?.timestamp),
    url: conversation?.id
      ? `${config.baseUrl}/app/accounts/${config.accountId}/conversations/${conversation.id}`
      : null,
  };
}

async function listContactConversations({ config, contactId, fetchImpl }) {
  const result = await chatwootGet(config, `/contacts/${encodeURIComponent(contactId)}/conversations`, fetchImpl);
  const list = Array.isArray(result?.payload) ? result.payload : [];
  return list.filter((conversation) => conversation?.id);
}

/** Every message in one conversation, oldest first. */
export async function listConversationMessages({ config, conversationId, fetchImpl = fetch }) {
  const byId = new Map();
  let before = null;
  for (let page = 0; page < MAX_MESSAGE_PAGES; page += 1) {
    const query = before ? `?before=${encodeURIComponent(before)}` : '';
    const result = await chatwootGet(
      config,
      `/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
      fetchImpl,
    );
    const batch = Array.isArray(result?.payload) ? result.payload : [];
    const fresh = batch.filter((message) => message?.id != null && !byId.has(message.id));
    if (!fresh.length) break;
    for (const message of fresh) byId.set(message.id, message);
    before = Math.min(...fresh.map((message) => Number(message.id)));
    if (!Number.isFinite(before)) break;
  }
  return [...byId.values()]
    .sort((a, b) => Number(a.created_at) - Number(b.created_at) || Number(a.id) - Number(b.id))
    .map(normalizeChatwootMessage);
}

/**
 * Everything the Chatwoot tab shows for one lead: its conversations, newest
 * activity first, each with its full message history.
 */
export async function loadLeadChatwootConversations({ lead, env = process.env, fetchImpl = fetch }) {
  const config = readChatwootApiConfig(env);
  if (!config.configured) return { configured: false, contactId: null, conversations: [] };

  const contactId = await findLeadChatwootContactId({ config, lead, fetchImpl });
  if (!contactId) return { configured: true, contactId: null, conversations: [] };

  const raw = await listContactConversations({ config, contactId, fetchImpl });
  const conversations = await Promise.all(raw.map(async (conversation) => ({
    ...normalizeChatwootConversation(conversation, config),
    messages: await listConversationMessages({ config, conversationId: conversation.id, fetchImpl }),
  })));
  conversations.sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')));
  return { configured: true, contactId, conversations };
}

/**
 * Posts an agent reply. The conversation must belong to this lead's contact,
 * so the endpoint can't be pointed at some other customer's chat.
 */
export async function sendLeadChatwootReply({
  lead,
  conversationId,
  content,
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = readChatwootApiConfig(env);
  if (!config.configured) {
    const error = new Error('Chatwoot is not configured');
    error.status = 503;
    throw error;
  }
  const text = clean(content);
  if (!text) {
    const error = new Error('Type a message before sending');
    error.status = 400;
    throw error;
  }
  if (text.length > CHATWOOT_REPLY_MAX_LENGTH) {
    const error = new Error(`Messages can be at most ${CHATWOOT_REPLY_MAX_LENGTH} characters`);
    error.status = 400;
    throw error;
  }

  const contactId = await findLeadChatwootContactId({ config, lead, fetchImpl });
  const owned = contactId
    ? await listContactConversations({ config, contactId, fetchImpl })
    : [];
  if (!owned.some((conversation) => String(conversation.id) === String(conversationId))) {
    const error = new Error('That conversation does not belong to this lead');
    error.status = 404;
    throw error;
  }

  const message = await chatwootCall(
    config,
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { fetchImpl, method: 'POST', body: { content: text, message_type: 'outgoing', private: false } },
  );
  return normalizeChatwootMessage(message);
}
