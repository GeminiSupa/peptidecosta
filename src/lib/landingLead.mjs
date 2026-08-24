const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

export const LANDING_LEAD_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const emailIdentity = (value) => clean(value, 200).toLowerCase();

const phoneIdentity = (value) => {
  let digits = clean(value, 40).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `506${digits}`;
  else if (digits.length === 10) digits = `1${digits}`;
  return digits;
};

const noteValue = (notes, labelPattern) => {
  const match = String(notes || '').match(new RegExp(`^${labelPattern}\\s*(.+)$`, 'im'));
  return match?.[1]?.trim() || '';
};

/**
 * Suppress rapid repeats only when both contact channels identify the same
 * person. Requiring both avoids hiding a legitimate enquiry where a household
 * shares an email or somebody corrects a mistyped phone number. Older enquiries
 * can alert again so a real customer returning later is not lost forever.
 */
export function isDuplicateLandingLeadSubmission(
  existing = {},
  incoming = {},
  now = Date.now(),
  windowMs = LANDING_LEAD_DUPLICATE_WINDOW_MS,
) {
  const incomingEmail = emailIdentity(incoming.email);
  const incomingPhone = phoneIdentity(incoming.phone);
  if (!incomingEmail || !incomingPhone || !existing?.id) return false;

  const contactMethod = String(existing.contact_method || '').trim().toLowerCase();
  const existingEmail = emailIdentity(
    existing.email
      || (contactMethod === 'email' ? existing.contact_value : '')
      || noteValue(existing.notes, 'Email:'),
  );
  const existingPhone = phoneIdentity(
    existing.phone
      || (contactMethod !== 'email' ? existing.contact_value : '')
      || noteValue(existing.notes, 'Phone \\(WhatsApp/SMS\\):'),
  );
  if (existingEmail !== incomingEmail || existingPhone !== incomingPhone) return false;

  const lastSeen = Date.parse(
    existing.last_enquiry_at || existing.updated_at || existing.created_at || '',
  );
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const elapsed = nowMs - lastSeen;
  return Number.isFinite(lastSeen)
    && Number.isFinite(nowMs)
    && elapsed >= 0
    && elapsed < windowMs;
}

export const LANDING_QUALIFICATION_FIELDS = [
  'category',
  'location',
  'volume',
  'preferred_reply_language',
  'alternate_phone',
];

export function normalizeLandingQualification(body = {}) {
  return {
    category: clean(body.category, 100),
    location: clean(body.location, 100),
    volume: clean(body.volume, 100),
    preferredReplyLanguage: body.preferred_reply_language === 'en' ? 'en' : 'es',
    alternatePhone: clean(body.alternate_phone, 40).replace(/[^\d+()\-\s]/g, '').trim(),
  };
}

export function landingQualificationNotes(qualification = {}) {
  const language = qualification.preferredReplyLanguage === 'en' ? 'English' : 'Spanish';
  const customAnswers = (qualification.answers || [])
    .filter((item) => !['category', 'location', 'volume', 'language'].includes(item.questionId))
    .map((item) => `${item.question}: ${item.answer}`);
  return [
    qualification.category ? `Research interest: ${qualification.category}` : null,
    qualification.location ? `Delivery location: ${qualification.location}` : null,
    qualification.volume ? `Estimated volume: ${qualification.volume}` : null,
    `Preferred reply language: ${language}`,
    qualification.alternatePhone ? `Alternate contact number: ${qualification.alternatePhone}` : null,
    ...customAnswers,
  ].filter(Boolean);
}

export function hasLandingQualification(qualification = {}) {
  return Boolean(
    qualification.category || qualification.location || qualification.volume ||
    qualification.answers?.length
  );
}

export function normalizeStructuredAnswers(value) {
  const rows = Array.isArray(value?.answers) ? value.answers : [];
  return {
    answers: rows.slice(0, 10).map((answer, index) => ({
      questionId: clean(answer?.questionId, 60) || `question-${index + 1}`,
      question: clean(answer?.question, 180),
      optionId: clean(answer?.optionId, 60),
      answer: clean(answer?.answer, 180),
    })).filter((answer) => answer.question && answer.answer),
  };
}

export function buildLandingLeadPayload({ form, answers, questions = [], language, source, utm = {}, consentText = '', consentVersion = '' }) {
  const name = [form.firstName, form.lastName].map((value) => clean(value, 80)).filter(Boolean).join(' ');
  const structuredAnswers = questions.map((question) => {
    const selected = answers[question.id];
    return selected ? {
      questionId: question.id,
      question: language === 'en' ? question.titleEn : question.titleEs,
      optionId: selected.id,
      answer: selected.label,
    } : null;
  }).filter(Boolean);
  const legacyValue = (key) => answers[key]?.label || answers[key] || '';
  const preferredLanguage = answers.language?.id || answers.language || language;
  return {
    name,
    email: clean(form.email, 200).toLowerCase(),
    phone: clean(form.phone, 40),
    alternate_phone: clean(form.alternatePhone, 40),
    language: language === 'en' ? 'en' : 'es',
    preferred_reply_language: preferredLanguage === 'en' ? 'en' : 'es',
    category: clean(legacyValue('category'), 100),
    location: clean(legacyValue('location'), 100),
    volume: clean(legacyValue('volume'), 100),
    qualification_data: { answers: structuredAnswers },
    marketing_consent: form.consent === true,
    consent_text: clean(consentText, 800),
    consent_version: clean(consentVersion, 40),
    source: clean(source, 60) || 'adwords_lp',
    utm_source: clean(utm.utm_source, 120),
    utm_medium: clean(utm.utm_medium, 120),
    utm_campaign: clean(utm.utm_campaign, 120),
  };
}
