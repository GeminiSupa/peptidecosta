export const WHATSAPP_WORKFLOW_LABELS = Object.freeze([
  'Important',
  'Follow Up',
  'Awaiting Payment',
  'Awaiting Customer',
]);

export const WHATSAPP_PRIORITIES = new Set(['normal', 'high', 'urgent']);

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

export function sanitizeWhatsAppLabels(value) {
  if (!Array.isArray(value)) return [];
  const allowed = new Map(WHATSAPP_WORKFLOW_LABELS.map((label) => [label.toLowerCase(), label]));
  return [...new Set(value.map((label) => allowed.get(clean(label, 80).toLowerCase())).filter(Boolean))];
}

export function sanitizeWhatsAppPriority(value) {
  const priority = clean(value, 20).toLowerCase();
  return WHATSAPP_PRIORITIES.has(priority) ? priority : 'normal';
}

export function extractWhatsAppAdAttribution(message = {}) {
  const referral = message?.referral || message?.context?.referral || null;
  if (!referral || typeof referral !== 'object') return null;

  const sourceId = clean(referral.source_id || referral.ad_id || referral.sourceId, 200);
  const sourceUrl = clean(referral.source_url || referral.sourceUrl, 1000);
  const sourceType = clean(referral.source_type || referral.sourceType, 100);
  const headline = clean(referral.headline, 500);
  const body = clean(referral.body, 1000);
  const ctwaClid = clean(referral.ctwa_clid || message?.ctwa_clid, 500);
  const mediaType = clean(referral.media_type || referral.mediaType, 100);

  if (![sourceId, sourceUrl, sourceType, headline, body, ctwaClid, mediaType].some(Boolean)) return null;

  return {
    leadSource: 'whatsapp_ad',
    utmSource: 'meta',
    utmMedium: 'paid_social',
    details: {
      source_id: sourceId || null,
      source_url: sourceUrl || null,
      source_type: sourceType || null,
      headline: headline || null,
      body: body || null,
      ctwa_clid: ctwaClid || null,
      media_type: mediaType || null,
    },
  };
}

export function mergeWhatsAppLeadQualification(existing, attribution) {
  const current = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  if (!attribution?.details) return current;
  return {
    ...current,
    whatsapp_ad: {
      ...(current.whatsapp_ad && typeof current.whatsapp_ad === 'object' ? current.whatsapp_ad : {}),
      ...attribution.details,
    },
  };
}

export function conversationNeedsHumanReply(conversation = {}) {
  if (conversation.status === 'resolved') return false;
  if (typeof conversation.needs_human_reply === 'boolean') return conversation.needs_human_reply;
  const inbound = new Date(conversation.last_inbound_at || 0).getTime();
  const human = new Date(conversation.last_human_outbound_at || 0).getTime();
  return Number.isFinite(inbound) && inbound > 0 && (!Number.isFinite(human) || inbound > human);
}

export function viewerHasUnread(conversation = {}) {
  if (conversation.viewer_manually_unread) return true;
  const inbound = new Date(conversation.last_inbound_at || 0).getTime();
  const seen = new Date(conversation.viewer_last_seen_at || 0).getTime();
  return Number.isFinite(inbound) && inbound > 0 && (!Number.isFinite(seen) || inbound > seen);
}
