const clean = (value, limit = 300) => String(value ?? '').trim().slice(0, limit);

export const LANDING_LEAD_SETTINGS_ID = 'lead_landing_page';

export const DEFAULT_LANDING_LEAD_SETTINGS = {
  // Who a new landing lead goes to. 'round_robin' spreads them across every
  // eligible agent; 'fixed' sends every one to assignedAgentEmail. The AdWords
  // campaign is starting with a single agent and is expected to move back to
  // rotation once it settles, so this is a setting rather than a code change —
  // switching it should not need a developer or a deploy.
  assignmentMode: 'round_robin',
  assignedAgentEmail: '',
  autoOpenEnabled: true,
  timeTriggerMs: 5000,
  scrollTriggerPct: 55,
  exitIntentEnabled: true,
  responseSlaMinutes: 15,
  consentVersion: '2026-08',
  consentEn: 'I agree to be contacted about this enquiry and to receive occasional product and stock updates by email or phone. I can unsubscribe at any time. Products are for research use only.',
  consentEs: 'Acepto que me contacten sobre esta consulta y recibir actualizaciones ocasionales de productos e inventario por correo o teléfono. Puedo cancelar en cualquier momento. Los productos son solo para investigación.',
  questions: [
    {
      id: 'category',
      titleEn: 'What are you researching?',
      titleEs: '¿Qué está investigando?',
      subtitleEn: 'Choose the area closest to your current research.',
      subtitleEs: 'Elija el área más cercana a su investigación actual.',
      options: [
        { id: 'weight', labelEn: 'Weight management research', labelEs: 'Investigación de control de peso' },
        { id: 'recovery', labelEn: 'Recovery and healing', labelEs: 'Recuperación y reparación' },
        { id: 'longevity', labelEn: 'Longevity and healthy aging', labelEs: 'Longevidad y envejecimiento saludable' },
        { id: 'performance', labelEn: 'Performance and hormones', labelEs: 'Rendimiento y hormonas' },
        { id: 'cognitive', labelEn: 'Cognitive or sleep research', labelEs: 'Investigación cognitiva o del sueño' },
        { id: 'other', labelEn: 'Other research area', labelEs: 'Otra área de investigación' },
      ],
    },
    {
      id: 'location',
      titleEn: 'Where do you need delivery?',
      titleEs: '¿Dónde necesita entrega?',
      subtitleEn: 'We will confirm the options available for that location.',
      subtitleEs: 'Confirmaremos las opciones disponibles para esa ubicación.',
      options: [
        { id: 'cr', labelEn: 'Costa Rica', labelEs: 'Costa Rica' },
        { id: 'us', labelEn: 'United States', labelEs: 'Estados Unidos' },
        { id: 'other', labelEn: 'Another location', labelEs: 'Otra ubicación' },
      ],
    },
    {
      id: 'volume',
      titleEn: 'What volume are you considering?',
      titleEs: '¿Qué volumen está considerando?',
      subtitleEn: 'An estimate is enough—you are not committing to an order.',
      subtitleEs: 'Una estimación es suficiente; no se compromete a comprar.',
      options: [
        { id: '1-4', labelEn: '1–4 vials', labelEs: '1–4 viales' },
        { id: '5-9', labelEn: '5–9 vials', labelEs: '5–9 viales' },
        { id: '10-plus', labelEn: '10+ vials', labelEs: '10+ viales' },
        { id: 'unsure', labelEn: 'Not sure yet', labelEs: 'Aún no estoy seguro' },
      ],
    },
    {
      id: 'language',
      titleEn: 'Which language should we reply in?',
      titleEs: '¿En qué idioma debemos responder?',
      subtitleEn: 'Your specialist will use this language for follow-up.',
      subtitleEs: 'Su especialista usará este idioma para el seguimiento.',
      options: [
        { id: 'en', labelEn: 'English', labelEs: 'Inglés' },
        { id: 'es', labelEn: 'Spanish', labelEs: 'Español' },
      ],
    },
  ],
};

const safeId = (value, fallback) => clean(value, 60).toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || fallback;

function normalizeOption(option, index, questionId) {
  return {
    id: safeId(option?.id, `${questionId}-option-${index + 1}`),
    labelEn: clean(option?.labelEn, 160) || `Option ${index + 1}`,
    labelEs: clean(option?.labelEs, 160) || clean(option?.labelEn, 160) || `Opción ${index + 1}`,
  };
}

function normalizeQuestion(question, index) {
  const id = safeId(question?.id, `question-${index + 1}`);
  const options = Array.isArray(question?.options)
    ? question.options.slice(0, 12).map((option, optionIndex) => normalizeOption(option, optionIndex, id))
    : [];
  return {
    id,
    titleEn: clean(question?.titleEn, 180) || `Question ${index + 1}`,
    titleEs: clean(question?.titleEs, 180) || clean(question?.titleEn, 180) || `Pregunta ${index + 1}`,
    subtitleEn: clean(question?.subtitleEn, 260),
    subtitleEs: clean(question?.subtitleEs, 260),
    options: options.length ? options : [normalizeOption({}, 0, id)],
  };
}

export function normalizeLandingLeadSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const suppliedQuestions = Array.isArray(source.questions) ? source.questions : null;
  const questions = (suppliedQuestions || DEFAULT_LANDING_LEAD_SETTINGS.questions)
    .slice(0, 10)
    .map(normalizeQuestion);
  return {
    ...DEFAULT_LANDING_LEAD_SETTINGS,
    assignmentMode: source.assignmentMode === 'fixed' ? 'fixed' : 'round_robin',
    assignedAgentEmail: clean(source.assignedAgentEmail, 200).toLowerCase(),
    autoOpenEnabled: source.autoOpenEnabled !== false,
    timeTriggerMs: Math.min(60000, Math.max(0, Number(source.timeTriggerMs) || DEFAULT_LANDING_LEAD_SETTINGS.timeTriggerMs)),
    scrollTriggerPct: Math.min(95, Math.max(10, Number(source.scrollTriggerPct) || DEFAULT_LANDING_LEAD_SETTINGS.scrollTriggerPct)),
    exitIntentEnabled: source.exitIntentEnabled !== false,
    responseSlaMinutes: Math.min(1440, Math.max(5, Number(source.responseSlaMinutes) || DEFAULT_LANDING_LEAD_SETTINGS.responseSlaMinutes)),
    consentVersion: clean(source.consentVersion, 40) || DEFAULT_LANDING_LEAD_SETTINGS.consentVersion,
    consentEn: clean(source.consentEn, 800) || DEFAULT_LANDING_LEAD_SETTINGS.consentEn,
    consentEs: clean(source.consentEs, 800) || DEFAULT_LANDING_LEAD_SETTINGS.consentEs,
    questions: questions.length ? questions : DEFAULT_LANDING_LEAD_SETTINGS.questions.map(normalizeQuestion),
  };
}

export function localizedQuestion(question, language = 'es') {
  const en = language === 'en';
  return {
    ...question,
    title: en ? question.titleEn : question.titleEs,
    subtitle: en ? question.subtitleEn : question.subtitleEs,
    options: question.options.map((option) => ({
      ...option,
      label: en ? option.labelEn : option.labelEs,
    })),
  };
}

