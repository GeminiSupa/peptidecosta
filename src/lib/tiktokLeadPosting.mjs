import crypto from 'node:crypto';

export const TIKTOK_LEAD_SOURCE = 'tiktok_form';
export const TIKTOK_ASSIGNEE_EMAIL = 'surfyesi@hotmail.com';
export const TIKTOK_LEAD_EMAIL_SUBJECT = 'New Lead From TikTok Forms';

const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

const scalar = (value, limit) => (
  value == null || typeof value === 'object' ? '' : clean(value, limit)
);

function booleanValue(value) {
  if (value === true || value === 1) return true;
  return ['true', 'yes', 'y', '1', 'accepted', 'opted_in'].includes(
    String(value ?? '').trim().toLowerCase(),
  );
}

function normalizeAnswers(value) {
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((entry, index) => ({
      questionId: scalar(entry?.question_id ?? entry?.questionId ?? entry?.name, 80)
        || `field-${index + 1}`,
      question: scalar(entry?.question ?? entry?.label ?? entry?.name, 180)
        || `Form field ${index + 1}`,
      answer: scalar(entry?.answer ?? entry?.value ?? entry?.values?.[0], 500),
    })).filter((entry) => entry.answer);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).slice(0, 30).map(([question, answer], index) => ({
      questionId: clean(question, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
        || `field-${index + 1}`,
      question: clean(question, 180) || `Form field ${index + 1}`,
      answer: scalar(Array.isArray(answer) ? answer.join(', ') : answer, 500),
    })).filter((entry) => entry.answer);
  }

  return [];
}

/** Normalize the small, stable posting contract documented for connectors. */
export function normalizeTikTokLeadPost(body = {}) {
  const firstName = scalar(body.first_name ?? body.firstName, 80);
  const lastName = scalar(body.last_name ?? body.lastName, 80);
  const suppliedName = scalar(body.full_name ?? body.name, 160);
  const campaignId = scalar(body.campaign_id ?? body.campaignId, 160);
  const campaignName = scalar(body.campaign_name ?? body.campaignName, 200);
  const formId = scalar(body.form_id ?? body.formId, 160);
  const formName = scalar(body.form_name ?? body.formName, 200);

  return {
    externalLeadId: scalar(
      body.lead_id ?? body.leadId ?? body.external_id ?? body.externalId,
      180,
    ).replace(/[^a-z0-9.:-]/gi, ''),
    name: suppliedName || [firstName, lastName].filter(Boolean).join(' ') || 'TikTok lead',
    email: scalar(body.email, 200).toLowerCase(),
    phone: scalar(body.phone ?? body.phone_number ?? body.phoneNumber, 60),
    language: String(body.language || '').trim().toLowerCase().startsWith('en') ? 'en' : 'es',
    campaignId,
    campaignName,
    formId,
    formName,
    adId: scalar(body.ad_id ?? body.adId, 160),
    adName: scalar(body.ad_name ?? body.adName, 200),
    submittedAt: scalar(body.submitted_at ?? body.submittedAt ?? body.create_time, 80),
    marketingConsent: booleanValue(body.marketing_consent ?? body.marketingConsent),
    whatsappConsent: booleanValue(body.whatsapp_consent ?? body.whatsappConsent),
    answers: normalizeAnswers(body.answers ?? body.custom_fields ?? body.customFields),
    campaign: campaignName || campaignId || formName || formId,
  };
}

/** Constant-time comparison for the server-to-server bearer credential. */
export function isAuthorizedTikTokLeadPost(authorization, configuredSecret) {
  const supplied = String(authorization || '').replace(/^Bearer\s+/i, '').trim();
  const expected = String(configuredSecret || '').trim();
  if (!supplied || !expected) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function leadNotificationEmailSubject(source, { name = '', slaMinutes = 15 } = {}) {
  if (String(source || '').trim().toLowerCase() === TIKTOK_LEAD_SOURCE) {
    return TIKTOK_LEAD_EMAIL_SUBJECT;
  }
  const sourceLabel = source === 'adwords_lp' ? 'AdWords lead' : 'Landing-page lead';
  const slaLabel = slaMinutes ? ` (${slaMinutes} min)` : '';
  return `${sourceLabel}${slaLabel} — ${String(name || 'New lead').trim()}`;
}

export function tikTokSubmissionRef(externalLeadId) {
  return `TikTok Instant Form · Lead ${clean(externalLeadId, 180)}`;
}
