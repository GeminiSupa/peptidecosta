const clean = (value, limit = 200) => String(value ?? '').trim().slice(0, limit);

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
  return [
    qualification.category ? `Research interest: ${qualification.category}` : null,
    qualification.location ? `Delivery location: ${qualification.location}` : null,
    qualification.volume ? `Estimated volume: ${qualification.volume}` : null,
    `Preferred reply language: ${language}`,
    qualification.alternatePhone ? `Alternate contact number: ${qualification.alternatePhone}` : null,
  ].filter(Boolean);
}

export function hasLandingQualification(qualification = {}) {
  return Boolean(qualification.category || qualification.location || qualification.volume);
}

export function buildLandingLeadPayload({ form, answers, language, source, utm = {} }) {
  const name = [form.firstName, form.lastName].map((value) => clean(value, 80)).filter(Boolean).join(' ');
  return {
    name,
    email: clean(form.email, 200).toLowerCase(),
    phone: clean(form.phone, 40),
    alternate_phone: clean(form.alternatePhone, 40),
    language: language === 'en' ? 'en' : 'es',
    preferred_reply_language: answers.language === 'en' ? 'en' : 'es',
    category: clean(answers.category, 100),
    location: clean(answers.location, 100),
    volume: clean(answers.volume, 100),
    source: clean(source, 60) || 'adwords_lp',
    utm_source: clean(utm.utm_source, 120),
    utm_medium: clean(utm.utm_medium, 120),
    utm_campaign: clean(utm.utm_campaign, 120),
  };
}
