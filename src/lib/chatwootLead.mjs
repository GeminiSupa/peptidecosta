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
  assignedAgent,
  dueAt,
}) {
  return [
    source === 'glp1_lp' ? 'New Google Ads lead — /glp-1' : 'New Google Ads lead — /lp',
    `Name: ${clean(name) || 'Not provided'}`,
    `Email: ${clean(email) || 'Not provided'}`,
    `Phone: ${clean(phone) || 'Not provided'}`,
    ...qualificationLines.map(clean).filter(Boolean),
    campaign ? `Campaign: ${clean(campaign)}` : null,
    assignedAgent ? `CRM owner: ${clean(assignedAgent)}` : 'CRM owner: Unassigned',
    dueAt ? `Response due: ${new Date(dueAt).toLocaleString('en-US', { timeZone: 'America/Costa_Rica' })} Costa Rica time` : null,
    `CRM lead ID: ${clean(leadId)}`,
  ].filter(Boolean).join('\n');
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
  assignedAgent,
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
    let contact;
    try {
      contact = await chatwootRequest(contactsUrl, {
        fetchImpl,
        method: 'POST',
        body: {
          identifier,
          name: clean(name) || `Google Ads lead ${leadId}`,
          ...(clean(email) ? { email: clean(email) } : {}),
          ...(clean(phone) ? { phone_number: clean(phone).startsWith('+') ? clean(phone) : `+${clean(phone)}` } : {}),
        },
      });
    } catch (error) {
      if (error.status !== 422) throw error;
      contact = await findExistingContact({ config, identifier, fetchImpl });
      if (!contact) throw error;
    }

    const sourceId = contactSourceId(contact, config.inboxId);
    if (!sourceId) throw new Error('Chatwoot did not return a contact source ID');

    const conversation = await chatwootRequest(
      `${contactsUrl}/${encodeURIComponent(sourceId)}/conversations`,
      { fetchImpl, method: 'POST', body: { source_id: sourceId } },
    );
    if (!conversation?.id) throw new Error('Chatwoot did not return a conversation ID');

    const content = buildChatwootLeadMessage({
      leadId, name, email, phone, source, qualificationLines, campaign, assignedAgent, dueAt,
    });
    const message = await chatwootRequest(
      `${contactsUrl}/${encodeURIComponent(sourceId)}/conversations/${conversation.id}/messages`,
      { fetchImpl, method: 'POST', body: { content, message_type: 'incoming', private: false } },
    );

    return {
      configured: true,
      sent: true,
      contactId: contact?.id || null,
      conversationId: conversation.id,
      messageId: message?.id || null,
    };
  } catch (error) {
    return { configured: true, sent: false, error: clean(error?.message) || 'Chatwoot delivery failed' };
  }
}
