const TIMEOUT_MS = 8000;
export const CHATWOOT_LEAD_SETTING_ID = 'google_ads_chatwoot';

const clean = (value) => String(value ?? '').trim();

export async function loadChatwootLeadEnabled(supabase) {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('id', CHATWOOT_LEAD_SETTING_ID)
      .maybeSingle();
    if (error) throw error;
    return data?.value?.enabled !== false;
  } catch (error) {
    // Keep the integration on when an older deployment has not created the
    // setting row yet. The admin switch writes that row on its first change.
    console.warn('[Chatwoot] Could not read the admin switch; using enabled:', error.message);
    return true;
  }
}

function readConfig(env) {
  const baseUrl = clean(env.CHATWOOT_BASE_URL).replace(/\/+$/, '');
  const accountId = clean(env.CHATWOOT_ACCOUNT_ID);
  const inboxId = clean(env.CHATWOOT_INBOX_ID);
  const accessToken = clean(env.CHATWOOT_API_ACCESS_TOKEN);
  return {
    baseUrl,
    accountId,
    inboxId,
    accessToken,
    configured: Boolean(baseUrl && accountId && inboxId && accessToken),
  };
}

async function chatwootRequest(url, { accessToken = '', fetchImpl, method = 'GET', body } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { api_access_token: accessToken } : {}),
    },
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

function contactSourceId(contact, inboxId) {
  if (clean(contact?.source_id)) return clean(contact.source_id);
  const inbox = (contact?.contact_inboxes || []).find((entry) => (
    String(entry?.inbox?.id ?? entry?.inbox_id ?? '') === String(inboxId)
  ));
  return clean(inbox?.source_id);
}

// Chatwoot only accepts +<country code><number>, up to 15 digits, no leading 0.
// A number typed in local format ("0300 1234567") fails that, and Chatwoot then
// refuses the whole contact — so such a number is left off the contact and the
// agent still reads it in the chat message.
export function chatwootPhone(phone) {
  const digits = clean(phone).replace(/\D/g, '');
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : '';
}

async function findExistingContact({ config, identifier, fetchImpl }) {
  const url = `${config.baseUrl}/api/v1/accounts/${config.accountId}/contacts/search?q=${encodeURIComponent(identifier)}`;
  const result = await chatwootRequest(url, { accessToken: config.accessToken, fetchImpl });
  const contacts = Array.isArray(result?.payload) ? result.payload : [];
  return contacts.find((contact) => clean(contact?.identifier) === identifier) || null;
}

export function buildChatwootLeadMessage({
  leadId,
  name,
  email,
  phone,
  source,
  qualificationLines = [],
  campaign,
  dueAt,
}) {
  // No owner line: the chat itself is assigned to the agent, and a name typed
  // into the message goes stale the moment someone reassigns it.
  const title = source === 'tiktok_form'
    ? 'New TikTok form lead'
    : (source === 'glp1_lp' ? 'New Google Ads lead — /glp-1' : (source === 'adwords_lp' ? 'New Google Ads lead — /lp' : 'New lead'));
  return [
    title,
    `Name: ${clean(name) || 'Not provided'}`,
    `Email: ${clean(email) || 'Not provided'}`,
    `Phone: ${clean(phone) || 'Not provided'}`,
    ...qualificationLines.map(clean).filter(Boolean),
    campaign ? `Campaign: ${clean(campaign)}` : null,
    dueAt ? `Response due: ${new Date(dueAt).toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })} Costa Rica time` : null,
    `CRM lead ID: ${clean(leadId)}`,
  ].filter(Boolean).join('\n');
}

/**
 * Assigns the chat to the Chatwoot agent whose login email matches the CRM
 * owner. The message is already delivered by now, so a failure here only
 * leaves the chat unassigned — it is reported, never thrown.
 */
async function assignConversation({ config, conversationId, assigneeEmail, fetchImpl }) {
  const wanted = clean(assigneeEmail).toLowerCase();
  if (!wanted) return { assigneeId: null };
  try {
    const agents = await chatwootRequest(
      `${config.baseUrl}/api/v1/accounts/${config.accountId}/agents`,
      { accessToken: config.accessToken, fetchImpl },
    );
    const agent = (Array.isArray(agents) ? agents : [])
      .find((entry) => clean(entry?.email).toLowerCase() === wanted);
    if (!agent?.id) return { assigneeId: null, error: `No Chatwoot agent uses ${wanted}` };
    await chatwootRequest(
      `${config.baseUrl}/api/v1/accounts/${config.accountId}/conversations/${conversationId}/assignments`,
      { accessToken: config.accessToken, fetchImpl, method: 'POST', body: { assignee_id: agent.id } },
    );
    return { assigneeId: agent.id };
  } catch (error) {
    return { assigneeId: null, error: clean(error?.message) || 'Chatwoot assignment failed' };
  }
}

/**
 * The catalog_leads columns that record one delivery attempt, so the Leads tab
 * can show it. `enabled` false means the admin switch was off.
 */
export function chatwootLeadColumns(result, { enabled = true, at = new Date().toISOString() } = {}) {
  let status;
  if (!enabled) status = 'off';
  else if (!result?.configured) status = 'not_configured';
  else if (!result.sent) status = 'failed';
  else if (result.assignmentError) status = 'unassigned';
  else status = 'sent';
  return {
    chatwoot_status: status,
    chatwoot_error: clean(result?.error || result?.assignmentError).slice(0, 500) || null,
    chatwoot_conversation_id: result?.conversationId || null,
    chatwoot_contact_id: result?.contactId || null,
    chatwoot_conversation_status: result?.sent ? 'open' : null,
    chatwoot_assignee_email: clean(result?.assigneeEmail) || null,
    chatwoot_conversation_url: result?.conversationUrl || null,
    chatwoot_synced_at: at,
  };
}

/**
 * Opens a Chatwoot conversation for one accepted Google Ads form submission.
 * The API token stays server-side; a Chatwoot outage never changes whether the
 * CRM lead itself was accepted.
 */
export async function sendAdLeadToChatwoot({
  leadId,
  name,
  email,
  phone,
  source,
  qualificationLines,
  campaign,
  assigneeEmail,
  dueAt,
  env = process.env,
  fetchImpl = fetch,
}) {
  const config = readConfig(env);
  if (!config.configured) return { configured: false, sent: false };
  if (!leadId) return { configured: true, sent: false, error: 'A CRM lead ID is required' };

  try {
    const inbox = await chatwootRequest(
      `${config.baseUrl}/api/v1/accounts/${config.accountId}/inboxes/${config.inboxId}`,
      { accessToken: config.accessToken, fetchImpl },
    );
    const inboxIdentifier = clean(inbox?.inbox_identifier);
    if (!inboxIdentifier) throw new Error('The Chatwoot inbox has no API identifier');

    const identifier = `google-ads-lead-${leadId}`;
    const contactsUrl = `${config.baseUrl}/public/api/v1/inboxes/${inboxIdentifier}/contacts`;
    const contactName = clean(name) || `Google Ads lead ${leadId}`;
    const phoneNumber = chatwootPhone(phone);
    const createContact = (body) => chatwootRequest(contactsUrl, { fetchImpl, method: 'POST', body });
    let contact;
    try {
      contact = await createContact({
        identifier,
        name: contactName,
        ...(clean(email) ? { email: clean(email) } : {}),
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      });
    } catch (error) {
      if (error.status !== 422) throw error;
      contact = await findExistingContact({ config, identifier, fetchImpl });
      // 422 without a contact of ours means Chatwoot disliked the email or
      // phone (bad format, or already on another contact). Both are in the
      // message anyway, so open the chat without them rather than lose it.
      if (!contact) contact = await createContact({ identifier, name: contactName });
    }

    const sourceId = contactSourceId(contact, config.inboxId);
    if (!sourceId) throw new Error('Chatwoot did not return a contact source ID');

    const conversation = await chatwootRequest(
      `${contactsUrl}/${encodeURIComponent(sourceId)}/conversations`,
      { fetchImpl, method: 'POST', body: { source_id: sourceId } },
    );
    if (!conversation?.id) throw new Error('Chatwoot did not return a conversation ID');

    const content = buildChatwootLeadMessage({
      leadId, name, email, phone, source, qualificationLines, campaign, dueAt,
    });
    const message = await chatwootRequest(
      `${contactsUrl}/${encodeURIComponent(sourceId)}/conversations/${conversation.id}/messages`,
      { fetchImpl, method: 'POST', body: { content, message_type: 'incoming', private: false } },
    );

    const assignment = await assignConversation({
      config, conversationId: conversation.id, assigneeEmail, fetchImpl,
    });

    return {
      configured: true,
      sent: true,
      contactId: contact?.id || null,
      conversationId: conversation.id,
      conversationUrl: `${config.baseUrl}/app/accounts/${config.accountId}/conversations/${conversation.id}`,
      messageId: message?.id || null,
      assigneeId: assignment.assigneeId,
      assigneeEmail: assignment.assigneeId ? clean(assigneeEmail).toLowerCase() : null,
      ...(assignment.error ? { assignmentError: assignment.error } : {}),
    };
  } catch (error) {
    return { configured: true, sent: false, error: clean(error?.message) || 'Chatwoot delivery failed' };
  }
}
