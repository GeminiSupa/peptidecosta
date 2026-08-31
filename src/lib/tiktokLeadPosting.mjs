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

/**
 * What the lead actually is, from the source the form stamped on it.
 *
 * Everything that was not TikTok used to be called a landing-page lead, which
 * was true of the ad funnel and of nothing else: the storefront Contáctenos
 * dialog posts to the same route from the home page hero, the catalog, the FAQ
 * and the affiliate pages, and every one of those arrived in the shared inbox
 * announcing itself as a landing-page lead. Someone triaging could not tell an
 * enquiry off the website from a lead the company had paid for.
 *
 * Matched on the `adwords` prefix rather than the exact `adwords_lp`, so the
 * standalone AdWordsLeadForm's own `adwords_landing` is recognised too. A
 * bought-traffic page posting some other source of its own is labelled an
 * enquiry — the wrong way round, but it still alerts, and its answers are in
 * the body either way.
 */
export function leadNotificationTitle(source) {
  const value = String(source || '').trim().toLowerCase();
  if (value === TIKTOK_LEAD_SOURCE) return 'New TikTok form lead';
  if (value.startsWith('adwords')) return 'New AdWords lead';
  return 'New website enquiry';
}

/**
 * The subject line, which has to answer "where from, who, how urgent" before
 * anyone opens it.
 *
 * `hasDeadline` is what the clock is allowed to depend on. It read
 * `slaMinutes ? ...` before, and slaMinutes is a setting rather than a fact
 * about this lead, so every alert claimed a 15-minute response clock —
 * including the ones the route deliberately never set a deadline on. An
 * enquiry with no deadline that says (15 min) is not urgent, it is wrong, and
 * a subject that cries wolf on the unqualified ones is how the qualified ones
 * stop being read.
 */
export function leadNotificationEmailSubject(
  source,
  { name = '', slaMinutes = 15, hasDeadline = false } = {},
) {
  if (String(source || '').trim().toLowerCase() === TIKTOK_LEAD_SOURCE) {
    return TIKTOK_LEAD_EMAIL_SUBJECT;
  }
  const sourceLabel = leadNotificationTitle(source).replace(/^New /, '');
  const label = sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1);
  const slaLabel = hasDeadline && slaMinutes ? ` (${slaMinutes} min)` : '';
  return `${label}${slaLabel} — ${String(name || 'New lead').trim()}`;
}

export function tikTokSubmissionRef(externalLeadId) {
  return `TikTok Instant Form · Lead ${clean(externalLeadId, 180)}`;
}
