// Reads the account's Chatwoot conversations and posts agent replies for the
// Chatwoot inbox tab. Deliberately separate from chatwootLead.mjs, which opens
// a conversation when a lead arrives and is left untouched: both files use the
// same CHATWOOT_* variables and token.

const TIMEOUT_MS = 8000;
// Chatwoot returns 20 messages per page; 50 pages is 1,000 messages, far past
// any real lead chat, and stops a bad cursor from looping forever.
const MAX_MESSAGE_PAGES = 50;
export const CHATWOOT_REPLY_MAX_LENGTH = 4000;
export const CHATWOOT_STATUSES = ['open', 'pending', 'snoozed', 'resolved'];

const clean = (value) => String(value ?? '').trim();

// Same variables chatwootLead.mjs reads. The inbox ID is not needed here: the
// tab lists the account's conversations, whatever inbox they are in.
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

// The account conversation list nests its payload under `data`, unlike the
// per-contact list, so both shapes are accepted.
function conversationPayload(result) {
  if (Array.isArray(result?.data?.payload)) return result.data.payload;
  if (Array.isArray(result?.payload)) return result.payload;
  return [];
}

/**
 * One page of the account's conversations for the Chatwoot inbox tab.
 * `status` may be one of CHATWOOT_STATUSES, or empty for all of them.
 */
export async function listAccountConversations({
  status = '',
  page = 1,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const config = readChatwootApiConfig(env);
  if (!config.configured) return { configured: false, conversations: [] };

  const wanted = clean(status).toLowerCase();
  const query = new URLSearchParams({ page: String(Math.max(1, Number(page) || 1)) });
  if (CHATWOOT_STATUSES.includes(wanted)) query.set('status', wanted);
  const result = await chatwootGet(config, `/conversations?${query.toString()}`, fetchImpl);

  const conversations = conversationPayload(result)
    .filter((conversation) => conversation?.id)
    .map((conversation) => ({
      ...normalizeChatwootConversation(conversation, config),
      contactName: clean(conversation?.meta?.sender?.name),
      contactIdentifier: clean(conversation?.meta?.sender?.identifier),
      unreadCount: Number(conversation?.unread_count) || 0,
      lastMessage: clean(
        [...(Array.isArray(conversation?.messages) ? conversation.messages : [])].pop()?.content,
      ),
    }));
  return { configured: true, conversations };
}

/** The lead this conversation came from, when it was opened by the CRM. */
export function leadIdFromChatwootIdentifier(identifier) {
  const match = clean(identifier).match(/^google-ads-lead-([0-9a-f-]{36})$/i);
  return match ? match[1] : '';
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

function replyValidationError(text) {
  if (!text) return 'Type a message before sending';
  if (text.length > CHATWOOT_REPLY_MAX_LENGTH) {
    return `Messages can be at most ${CHATWOOT_REPLY_MAX_LENGTH} characters`;
  }
  return '';
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** The full history of one conversation, for the Chatwoot inbox tab. */
export async function loadConversationMessages({ conversationId, env = process.env, fetchImpl = fetch }) {
  const config = readChatwootApiConfig(env);
  if (!config.configured) return { configured: false, messages: [] };
  const messages = await listConversationMessages({ config, conversationId, fetchImpl });
  return { configured: true, messages };
}

/** Posts an agent reply into one conversation of the account's inbox. */
export async function sendConversationReply({
  conversationId,
  content,
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = readChatwootApiConfig(env);
  if (!config.configured) throw fail('Chatwoot is not configured', 503);
  const text = clean(content);
  const invalid = replyValidationError(text);
  if (invalid) throw fail(invalid, 400);
  if (!clean(conversationId)) throw fail('A conversation is required', 400);

  const message = await chatwootCall(
    config,
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    { fetchImpl, method: 'POST', body: { content: text, message_type: 'outgoing', private: false } },
  );
  return normalizeChatwootMessage(message);
}
