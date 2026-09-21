import crypto from 'node:crypto';

const clean = (value) => String(value ?? '').trim();

function secureEqual(left, right) {
  const a = Buffer.from(clean(left));
  const b = Buffer.from(clean(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function unixOrDateToIso(value, fallback = new Date().toISOString()) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function messageDirection(value) {
  if (value === 0 || clean(value).toLowerCase() === 'incoming') return 'inbound';
  if (value === 1 || clean(value).toLowerCase() === 'outgoing') return 'outbound';
  return null;
}

function changedAttribute(payload, name) {
  const changes = Array.isArray(payload?.changed_attributes) ? payload.changed_attributes : [];
  return changes.some((entry) => entry && Object.prototype.hasOwnProperty.call(entry, name));
}

export function verifyChatwootSignature({
  rawBody,
  signature,
  timestamp,
  secret,
  nowMs = Date.now(),
  toleranceSeconds = 300,
}) {
  const supplied = clean(signature).toLowerCase();
  const signedAt = Number(timestamp);
  if (!secret || !rawBody || !supplied.startsWith('sha256=') || !Number.isFinite(signedAt)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - signedAt) > toleranceSeconds) return false;
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')}`;
  return secureEqual(supplied, expected);
}

export function chatwootEventKey({ deliveryId, rawBody }) {
  const supplied = clean(deliveryId);
  if (supplied) return supplied.slice(0, 200);
  return `body:${crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex')}`;
}

export function normalizeChatwootEvent(payload, receivedAt = new Date().toISOString()) {
  const event = clean(payload?.event).toLowerCase();
  const isMessage = event === 'message_created' || event === 'message_updated';
  const conversation = isMessage ? (payload?.conversation || {}) : (payload || {});
  const assignee = conversation?.meta?.assignee || payload?.meta?.assignee || payload?.assignee || null;
  const contact = conversation?.meta?.sender
    || payload?.contact
    || (clean(payload?.sender?.type).toLowerCase() === 'contact' ? payload.sender : null)
    || null;
  const direction = isMessage ? messageDirection(payload?.message_type) : null;
  const occurredAt = unixOrDateToIso(
    isMessage ? payload?.created_at : (payload?.timestamp || payload?.created_at),
    receivedAt,
  );
  const content = clean(payload?.content);

  return {
    event,
    accountId: payload?.account?.id ?? payload?.account_id ?? conversation?.account_id ?? null,
    inboxId: payload?.inbox?.id ?? payload?.inbox_id ?? conversation?.inbox_id ?? null,
    conversationId: conversation?.id ?? null,
    contactId: contact?.id ?? conversation?.contact_inbox?.contact_id ?? null,
    contactIdentifier: clean(contact?.identifier || payload?.contact?.identifier),
    contactName: clean(contact?.name),
    messageId: isMessage ? (payload?.id ?? null) : null,
    direction,
    private: Boolean(payload?.private),
    content,
    occurredAt,
    status: clean(conversation?.status).toLowerCase() || null,
    assigneeName: clean(assignee?.name || assignee?.available_name),
    assigneeEmail: clean(assignee?.email).toLowerCase(),
    assigneeChanged: changedAttribute(payload, 'assignee_id') || changedAttribute(payload, 'assignee'),
    statusChanged: event === 'conversation_status_changed' || changedAttribute(payload, 'status'),
  };
}

export function leadIdFromChatwootEvent(event) {
  const identifierMatch = event?.contactIdentifier.match(/^google-ads-lead-([0-9a-f-]{36})$/i);
  if (identifierMatch) return identifierMatch[1];
  const contentMatch = event?.content.match(/CRM lead ID:\s*([0-9a-f-]{36})/i);
  return contentMatch ? contentMatch[1] : '';
}

export function isChatwootLeadSeedMessage(event, leadId) {
  return event?.event === 'message_created'
    && event?.direction === 'inbound'
    && new RegExp(`CRM lead ID:\\s*${clean(leadId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(event?.content || '');
}

export function buildChatwootLeadUpdates(event, lead, receivedAt = new Date().toISOString()) {
  const updates = {
    chatwoot_conversation_id: event.conversationId,
    chatwoot_contact_id: event.contactId || lead.chatwoot_contact_id || null,
    chatwoot_last_event_type: event.event,
    chatwoot_last_event_at: event.occurredAt,
    chatwoot_synced_at: receivedAt,
  };

  if (event.status) updates.chatwoot_conversation_status = event.status;
  if (event.assigneeName) {
    updates.chatwoot_assignee_name = event.assigneeName;
    updates.sales_agent = event.assigneeName;
  }
  if (event.assigneeEmail) updates.chatwoot_assignee_email = event.assigneeEmail;

  if (event.event === 'message_created' && !event.private && event.direction) {
    updates.chatwoot_message_count = Math.max(0, Number(lead.chatwoot_message_count) || 0) + 1;
    updates.chatwoot_last_message_at = event.occurredAt;
    updates.chatwoot_last_message_direction = event.direction;
    if (event.direction === 'outbound') {
      updates.last_contacted_at = event.occurredAt;
      if (!lead.chatwoot_first_response_at) {
        updates.chatwoot_first_response_at = event.occurredAt;
        const started = new Date(lead.last_enquiry_at || lead.created_at).getTime();
        const replied = new Date(event.occurredAt).getTime();
        if (Number.isFinite(started) && Number.isFinite(replied)) {
          updates.chatwoot_first_response_seconds = Math.max(0, Math.round((replied - started) / 1000));
        }
      }
    }
  }

  if (event.status === 'resolved') updates.chatwoot_resolved_at = event.occurredAt;
  if (event.statusChanged && event.status && event.status !== 'resolved') updates.chatwoot_resolved_at = null;
  return updates;
}

export function chatwootCrmNotification(event, lead, eventKey) {
  const leadName = clean(lead?.name) || clean(event?.contactName) || 'Lead';
  const common = {
    type: 'chatwoot',
    link_tab: 'leads',
    link_ref: lead?.id,
    recipient_email: event?.assigneeEmail || null,
    event_key: `chatwoot:${eventKey}`,
    created_at: event?.occurredAt,
  };

  if (event?.event === 'message_created' && event.direction === 'inbound'
      && !event.private && !isChatwootLeadSeedMessage(event, lead?.id)) {
    return {
      ...common,
      title: `New Chatwoot message from ${leadName}`,
      body: clean(event.content).slice(0, 180) || 'The contact sent a new message.',
    };
  }
  if (event?.statusChanged && event.status === 'resolved') {
    return { ...common, title: 'Chatwoot conversation resolved', body: leadName };
  }
  if (event?.statusChanged && event.status === 'open' && lead?.chatwoot_conversation_status === 'resolved') {
    return { ...common, title: 'Chatwoot conversation reopened', body: leadName };
  }
  if (event?.assigneeChanged && event.assigneeName) {
    return { ...common, title: 'Chatwoot conversation assigned', body: `${leadName} → ${event.assigneeName}` };
  }
  return null;
}
