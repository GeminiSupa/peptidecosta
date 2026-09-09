'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  FileCheck2,
  FlaskConical,
  Globe2,
  Headphones,
  Languages,
  Loader2,
  LockKeyhole,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { buildLandingLeadPayload } from '@/lib/landingLead.mjs';
import {
  DEFAULT_LANDING_LEAD_SETTINGS,
  LANDING_LEAD_SETTINGS_ID,
  localizedQuestion,
  normalizeLandingLeadSettings,
} from '@/lib/landingLeadSettings.mjs';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  getFacebookReviewUrl,
  getTrustpilotReviewUrl,
  TRUSTPILOT_RATING,
  TRUSTPILOT_REVIEW_COUNT,
} from '@/lib/businessLinks';
import { useBusinessLinks } from '@/hooks/useBusinessLinks';
import { useTrustpilotRating } from '@/hooks/useTrustpilotRating';
import LeadFormTrap, { useLeadFormTrap } from '@/components/LeadFormTrap';
import { isDiallablePhone } from '@/lib/leadContact.mjs';
import './landing.css';

const SESSION_KEY = 'pcr_landing_enquiry_seen';

const COPY = {
  en: {
    nav: { why: 'Why us', trust: 'Trust', faq: 'FAQ', request: 'Request information', catalog: 'Browse catalog' },
    eyebrow: 'Research support, built around you',
    heroTitle: 'Find the right research options without the guesswork.',
    heroText: 'Tell us what you are exploring. A specialist will review your requirements, confirm current availability, and contact you with clear next steps.',
    heroCta: 'Get started today',
    heroCatalog: 'Browse the catalog',
    heroNote: 'Takes about 60 seconds. No purchase required.',
    heroCardEyebrow: 'Personalized guidance',
    heroCardTitle: 'A clearer way to plan your research order.',
    heroCardPoints: ['Current inventory', 'Batch documentation', 'Delivery options', 'Volume guidance'],
    stat1: 'Local support', stat1Text: 'English and Spanish',
    stat2: 'Documented', stat2Text: 'COA and batch details',
    stat3: 'Responsive', stat3Text: 'A specialist follows up',
    whyEyebrow: 'Why Peptides Costa Rica',
    whyTitle: 'Practical support at every step.',
    whyText: 'We combine transparent product information with responsive local service so qualified researchers can make informed purchasing decisions.',
    proof: [
      ['Inventory clarity', 'Get current product and stock information instead of relying on an outdated list.'],
      ['Batch documentation', 'Review available COA and batch details before placing an order.'],
      ['Straightforward delivery', 'We confirm the options available for your location and timeline.'],
      ['Human support', 'A real specialist reviews your answers and responds in your preferred language.'],
    ],
    proofCta: 'Receive personalized guidance',
    trustEyebrow: 'Independent feedback',
    trustTitle: 'Built on responsive service and transparency.',
    reviews: 'reviews',
    factsEyebrow: 'What you can expect',
    factsTitle: 'One enquiry. A useful, personal response.',
    facts: [
      ['Fast review', 'Your answers give our team the context needed to reply efficiently.'],
      ['Bilingual team', 'Choose English or Spanish for your follow-up.'],
      ['Clear availability', 'We confirm what is currently available before you make a decision.'],
      ['Location-aware', 'Delivery guidance is based on the location you select.'],
      ['First-party contact', 'Your details go directly into our secure CRM for follow-up.'],
      ['No pressure', 'Submitting an enquiry does not commit you to a purchase.'],
    ],
    compliance: 'Products are supplied strictly for laboratory research use. They are not intended for human consumption, diagnosis, treatment, or medical advice.',
    faqEyebrow: 'Frequently asked questions',
    faqTitle: 'Before you enquire.',
    faqs: [
      ['What happens after I submit?', 'A team member reviews your answers, checks relevant availability and documentation, then contacts you using the details you provided.'],
      ['How quickly will someone respond?', 'Most enquiries are reviewed promptly during business hours. Timing can vary with request volume and the details needed.'],
      ['Do I have to place an order?', 'No. The enquiry is designed to help you understand available research options before making any decision.'],
      ['Can I request documentation first?', 'Yes. Tell the specialist which product area you are researching and ask for the available batch or COA information.'],
      ['Where do you deliver?', 'We confirm the options currently available for your selected location during follow-up.'],
      ['Will you give medical advice?', 'No. We do not provide medical advice. All products and information are for laboratory research purposes only.'],
      ['How will you use my details?', 'We use them to answer your enquiry and, only with your consent, send occasional product or stock updates. You can unsubscribe at any time.'],
    ],
    closingEyebrow: 'Ready when you are',
    closingTitle: 'Get a clearer answer for your research requirements.',
    closingText: 'Four quick questions help us make the first reply more useful.',
    closingCta: 'Request more information',
    footerBlurb: 'Reliable research supply, clear documentation, and responsive bilingual support.',
    footerRequest: 'Request information',
    legal: 'For laboratory research use only. Not for human consumption or medical use.',
    modal: {
      close: 'Close enquiry', back: 'Back', step: 'Step', of: 'of',
      titles: ['What are you researching?', 'Where do you need delivery?', 'What volume are you considering?', 'Which language should we reply in?', 'Where should our specialist contact you?'],
      subtitles: ['Choose the area closest to your current research.', 'We will confirm the options available for that location.', 'An estimate is enough—you are not committing to an order.', 'Your specialist will use this language for follow-up.', 'Enter your details and we will take it from here.'],
      category: ['Weight management research', 'Recovery and healing', 'Longevity and healthy aging', 'Performance and hormones', 'Cognitive or sleep research', 'Other research area'],
      location: ['Costa Rica', 'United States', 'Another location'],
      volume: ['1–4 vials', '5–9 vials', '10+ vials', 'Not sure yet'],
      languages: [['English', 'en'], ['Spanish', 'es']],
      firstName: 'First name', lastName: 'Last name (optional)', email: 'Email address', phone: 'Phone number', alternatePhone: 'Alternate contact number (optional)',
      consent: 'I agree to be contacted about this enquiry and to receive occasional product and stock updates by email or phone. I can unsubscribe at any time. Products are for research use only.',
      submit: 'Get my personalized guidance', sending: 'Sending securely…',
      required: 'Please complete all required fields and accept the consent statement.',
      emailError: 'Please enter a valid email address.', phoneError: 'Please enter a valid phone number.', sendError: 'We could not save your enquiry. Your answers are still here—please try again.',
      successTitle: 'Thank you, {name}.', successText: 'Your enquiry is safely in our CRM. A specialist will review it and contact you shortly.',
      nextTitle: 'What happens next', next: ['We review your research requirements.', 'We confirm relevant availability and documentation.', 'A specialist contacts you in your preferred language.'],
      inbox: 'Please check your email, including the spam folder, for our reply.', done: 'Done',
    },
  },
  es: {
    nav: { why: 'Por qué nosotros', trust: 'Confianza', faq: 'Preguntas', request: 'Solicitar información', catalog: 'Ver catálogo' },
    eyebrow: 'Apoyo de investigación, pensado para usted',
    heroTitle: 'Encuentre las opciones de investigación correctas sin adivinar.',
    heroText: 'Cuéntenos qué está explorando. Un especialista revisará sus requisitos, confirmará la disponibilidad actual y le contactará con los próximos pasos claros.',
    heroCta: 'Comenzar ahora',
    heroCatalog: 'Ver el catálogo',
    heroNote: 'Toma aproximadamente 60 segundos. No requiere compra.',
    heroCardEyebrow: 'Orientación personalizada',
    heroCardTitle: 'Una forma más clara de planificar su pedido de investigación.',
    heroCardPoints: ['Inventario actual', 'Documentación de lote', 'Opciones de entrega', 'Orientación por volumen'],
    stat1: 'Soporte local', stat1Text: 'Español e inglés',
    stat2: 'Documentado', stat2Text: 'COA y detalles de lote',
    stat3: 'Atención directa', stat3Text: 'Un especialista le responde',
    whyEyebrow: 'Por qué Peptides Costa Rica',
    whyTitle: 'Apoyo práctico en cada paso.',
    whyText: 'Combinamos información transparente con servicio local ágil para que investigadores calificados puedan tomar decisiones informadas.',
    proof: [
      ['Inventario claro', 'Reciba información actual de productos y existencias, no una lista desactualizada.'],
      ['Documentación de lote', 'Revise los COA y detalles de lote disponibles antes de ordenar.'],
      ['Entrega sencilla', 'Confirmamos las opciones disponibles para su ubicación y plazo.'],
      ['Atención humana', 'Un especialista real revisa sus respuestas y contesta en su idioma preferido.'],
    ],
    proofCta: 'Recibir orientación personalizada',
    trustEyebrow: 'Opiniones independientes',
    trustTitle: 'Basado en servicio ágil y transparencia.',
    reviews: 'reseñas',
    factsEyebrow: 'Qué puede esperar',
    factsTitle: 'Una consulta. Una respuesta útil y personal.',
    facts: [
      ['Revisión rápida', 'Sus respuestas dan a nuestro equipo el contexto para responder eficientemente.'],
      ['Equipo bilingüe', 'Elija español o inglés para el seguimiento.'],
      ['Disponibilidad clara', 'Confirmamos qué está disponible antes de que tome una decisión.'],
      ['Según ubicación', 'La orientación de entrega se basa en la ubicación seleccionada.'],
      ['Contacto directo', 'Sus datos entran directamente a nuestro CRM seguro para seguimiento.'],
      ['Sin presión', 'Enviar una consulta no le compromete a comprar.'],
    ],
    compliance: 'Los productos se suministran estrictamente para uso de investigación en laboratorio. No están destinados al consumo humano, diagnóstico, tratamiento ni asesoramiento médico.',
    faqEyebrow: 'Preguntas frecuentes',
    faqTitle: 'Antes de consultar.',
    faqs: [
      ['¿Qué sucede después de enviar?', 'Un miembro del equipo revisa sus respuestas, verifica disponibilidad y documentación relevante, y luego le contacta usando los datos proporcionados.'],
      ['¿Qué tan rápido responderán?', 'La mayoría de consultas se revisa pronto durante horario laboral. El tiempo puede variar según el volumen y los detalles necesarios.'],
      ['¿Tengo que hacer un pedido?', 'No. La consulta le ayuda a comprender las opciones de investigación disponibles antes de decidir.'],
      ['¿Puedo solicitar documentación primero?', 'Sí. Indique qué área de producto está investigando y solicite la información de lote o COA disponible.'],
      ['¿Dónde realizan entregas?', 'Confirmamos durante el seguimiento las opciones actualmente disponibles para la ubicación seleccionada.'],
      ['¿Dan asesoramiento médico?', 'No. No brindamos asesoramiento médico. Todos los productos e información son exclusivamente para investigación de laboratorio.'],
      ['¿Cómo usarán mis datos?', 'Los usamos para responder su consulta y, solo con su consentimiento, enviar actualizaciones ocasionales de productos o inventario. Puede cancelar cuando quiera.'],
    ],
    closingEyebrow: 'Cuando esté listo',
    closingTitle: 'Obtenga una respuesta más clara para sus requisitos de investigación.',
    closingText: 'Cuatro preguntas rápidas nos ayudan a hacer más útil la primera respuesta.',
    closingCta: 'Solicitar más información',
    footerBlurb: 'Suministro confiable para investigación, documentación clara y soporte bilingüe.',
    footerRequest: 'Solicitar información',
    legal: 'Solo para investigación de laboratorio. No apto para consumo humano ni uso médico.',
    modal: {
      close: 'Cerrar consulta', back: 'Atrás', step: 'Paso', of: 'de',
      titles: ['¿Qué está investigando?', '¿Dónde necesita entrega?', '¿Qué volumen está considerando?', '¿En qué idioma debemos responder?', '¿Dónde debe contactarle nuestro especialista?'],
      subtitles: ['Elija el área más cercana a su investigación actual.', 'Confirmaremos las opciones disponibles para esa ubicación.', 'Una estimación es suficiente; no se compromete a comprar.', 'Su especialista usará este idioma para el seguimiento.', 'Ingrese sus datos y nosotros nos encargamos del resto.'],
      category: ['Investigación de control de peso', 'Recuperación y reparación', 'Longevidad y envejecimiento saludable', 'Rendimiento y hormonas', 'Investigación cognitiva o del sueño', 'Otra área de investigación'],
      location: ['Costa Rica', 'Estados Unidos', 'Otra ubicación'],
      volume: ['1–4 viales', '5–9 viales', '10+ viales', 'Aún no estoy seguro'],
      languages: [['Español', 'es'], ['Inglés', 'en']],
      firstName: 'Nombre', lastName: 'Apellido (opcional)', email: 'Correo electrónico', phone: 'Número de teléfono', alternatePhone: 'Número alternativo (opcional)',
      consent: 'Acepto que me contacten sobre esta consulta y recibir actualizaciones ocasionales de productos e inventario por correo o teléfono. Puedo cancelar en cualquier momento. Los productos son solo para investigación.',
      submit: 'Obtener mi orientación personalizada', sending: 'Enviando de forma segura…',
      required: 'Complete todos los campos obligatorios y acepte la declaración de consentimiento.',
      emailError: 'Ingrese un correo electrónico válido.', phoneError: 'Ingrese un número de teléfono válido.', sendError: 'No pudimos guardar su consulta. Sus respuestas siguen aquí; inténtelo de nuevo.',
      successTitle: 'Gracias, {name}.', successText: 'Su consulta está segura en nuestro CRM. Un especialista la revisará y le contactará pronto.',
      nextTitle: 'Qué sucede ahora', next: ['Revisamos sus requisitos de investigación.', 'Confirmamos disponibilidad y documentación relevantes.', 'Un especialista le contacta en su idioma preferido.'],
      inbox: 'Revise su correo, incluida la carpeta de spam, para encontrar nuestra respuesta.', done: 'Listo',
    },
  },
};

const PROOF_ICONS = [PackageCheck, FileCheck2, Truck, Headphones];
const FACT_ICONS = [Clock3, Languages, CircleCheck, MapPin, LockKeyhole, UserRoundCheck];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fireEvent(event, data = {}) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
}

async function postWithRetry(payload, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/leads/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.ok) return response;
      const error = new Error(`lead_${response.status}`);
      error.status = response.status;
      if (response.status < 500 && response.status !== 429) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (error.status && error.status < 500 && error.status !== 429) throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw lastError;
}

function LeadModal({ open, onClose, lang, source, utm, onSubmitted, settings }) {
  const c = COPY[lang].modal;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', alternatePhone: '', consent: false });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocus = useRef(null);
  const sendingRef = useRef(false);
  // Keyed on `open`: this modal auto-opens on a timer or a scroll depth, so
  // the time that matters is from the moment it appeared, not from page load.
  const { trapRef, trapFields } = useLeadFormTrap(open);

  useEffect(() => { sendingRef.current = sending; }, [sending]);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    document.documentElement.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => closeRef.current?.focus(), 30);
    const onKey = (event) => {
      if (event.key === 'Escape' && !sendingRef.current) onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      // :not([tabindex="-1"]) keeps the honeypot out of the cycle — it is the
      // one input in here a visitor must never land on.
      const items = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]):not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const questions = settings.questions;
  const localizedQuestions = questions.map((question) => localizedQuestion(question, lang));
  const contactStep = questions.length;
  const totalSteps = contactStep + 1;
  const answerLabels = questions.map((question) => answers[question.id]?.label).filter(Boolean);

  const choose = (option) => {
    const question = localizedQuestions[step];
    setAnswers((current) => ({ ...current, [question.id]: { id: option.id, label: option.label } }));
    fireEvent('enquiry_answer', { step: step + 1, answerKey: question.id, answer: option.id });
    setError('');
    setTimeout(() => {
      setStep((current) => Math.min(current + 1, contactStep));
      fireEvent('enquiry_step', { step: step + 2 });
    }, 180);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    const email = form.email.trim();
    if (!form.firstName.trim() || !email || !form.phone.trim() || !form.consent) {
      setError(c.required); fireEvent('enquiry_validation_error', { reason: 'required' }); return;
    }
    if (!EMAIL_RE.test(email)) {
      setError(c.emailError); fireEvent('enquiry_validation_error', { reason: 'email' }); return;
    }
    // Was its own `phoneDigits.length < 8`; the shared rule so the three lead
    // forms and the route cannot drift to different ideas of a real number.
    if (!isDiallablePhone(form.phone)) {
      setError(c.phoneError); fireEvent('enquiry_validation_error', { reason: 'phone' }); return;
    }

    setSending(true);
    setError('');
    const payload = buildLandingLeadPayload({
      form,
      answers,
      questions,
      language: lang,
      source,
      utm,
      consentText: lang === 'en' ? settings.consentEn : settings.consentEs,
      consentVersion: settings.consentVersion,
    });
    try {
      await postWithRetry({ ...payload, ...trapFields() });
      setSent(true);
      onSubmitted();
      fireEvent('generate_lead', {
        preferredLanguage: answers.language?.id || lang,
        category: answers.category?.id || '',
        location: answers.location?.id || '',
        volume: answers.volume?.id || '',
        source,
      });
      if (typeof window.gtag === 'function') window.gtag('event', 'generate_lead', { event_category: 'landing_page', source });
    } catch (sendError) {
      console.error('[landing] lead submit failed:', sendError?.message || 'unknown');
      setError(c.sendError);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="lead-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) onClose(); }}>
      <section className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title" ref={dialogRef}>
        <button ref={closeRef} type="button" className="lead-modal-close" onClick={onClose} aria-label={c.close} disabled={sending}><X size={20} /></button>

        {!sent && (
          <div className="lead-modal-progress" aria-label={`${c.step} ${step + 1} ${c.of} ${totalSteps}`}>
            <span>{c.step} {step + 1} {c.of} {totalSteps}</span>
            <div><i style={{ width: `${((step + 1) / totalSteps) * 100}%` }} /></div>
          </div>
        )}

        {sent ? (
          <div className="lead-success">
            <span className="lead-success-icon"><Check size={28} /></span>
            <p className="lead-modal-kicker">Peptides Costa Rica</p>
            <h2 id="lead-modal-title">{c.successTitle.replace('{name}', form.firstName.trim())}</h2>
            <p>{c.successText}</p>
            <div className="lead-success-summary">
              {answerLabels.map((label) => <span key={label}><Check size={13} /> {label}</span>)}
            </div>
            <div className="lead-next">
              <strong>{c.nextTitle}</strong>
              {c.next.map((item, index) => <p key={item}><b>{index + 1}</b>{item}</p>)}
            </div>
            <p className="lead-inbox"><FileCheck2 size={17} />{c.inbox}</p>
            <button type="button" className="lead-primary lead-primary-full" onClick={onClose}>{c.done}</button>
          </div>
        ) : (
          <>
            <div className="lead-answer-chips">
              {answerLabels.slice(0, step).filter(Boolean).map((label, index) => (
                <button type="button" key={`${label}-${index}`} onClick={() => setStep(index)}><Check size={12} />{label}</button>
              ))}
            </div>
            <header className="lead-modal-heading">
              <p className="lead-modal-kicker">Peptides Costa Rica</p>
              <h2 id="lead-modal-title">{step < contactStep ? localizedQuestions[step].title : c.titles[4]}</h2>
              <p>{step < contactStep ? localizedQuestions[step].subtitle : c.subtitles[4]}</p>
            </header>

            {step < contactStep ? (
              <div className={`lead-option-grid lead-option-grid-${step}`}>
                {localizedQuestions[step].options.map((option) => {
                  const selected = answers[localizedQuestions[step].id]?.id === option.id;
                  return (
                    <button type="button" key={option.id} className={selected ? 'is-selected' : ''} onClick={() => choose(option)}>
                      <span>{option.label}</span><ArrowRight size={17} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <form className="lead-contact-form" onSubmit={submit} noValidate>
                <LeadFormTrap inputRef={trapRef} />
                <div className="lead-form-row">
                  <label><span>{c.firstName} *</span><input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} autoComplete="given-name" /></label>
                  <label><span>{c.lastName}</span><input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} autoComplete="family-name" /></label>
                </div>
                <label><span>{c.email} *</span><input type="email" inputMode="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" /></label>
                <div className="lead-form-row">
                  <label><span>{c.phone} *</span><input type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" /></label>
                  <label><span>{c.alternatePhone}</span><input type="tel" inputMode="tel" value={form.alternatePhone} onChange={(event) => setForm({ ...form, alternatePhone: event.target.value })} /></label>
                </div>
                <label className="lead-consent"><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /><span>{lang === 'en' ? settings.consentEn : settings.consentEs}</span></label>
                {error && <p className="lead-form-error" role="alert">{error}</p>}
                <button type="submit" className="lead-primary lead-primary-full" disabled={sending} aria-busy={sending}>
                  {sending ? <><Loader2 className="lead-spin" size={18} />{c.sending}</> : <>{c.submit}<ArrowRight size={18} /></>}
                </button>
              </form>
            )}

            {step > 0 && <button type="button" className="lead-modal-back" onClick={() => setStep((current) => current - 1)}>{c.back}</button>}
          </>
        )}
      </section>
    </div>
  );
}

export default function LeadGenerationLandingPage() {
  const [lang, setLang] = useState('es');
  const { links } = useBusinessLinks();
  const { rating: liveTrustpilotRating, reviewCount: liveTrustpilotCount } = useTrustpilotRating();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTrigger, setModalTrigger] = useState('');
  const [source, setSource] = useState('adwords_lp');
  const [utm, setUtm] = useState({ utm_source: '', utm_medium: '', utm_campaign: '' });
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState(-1);
  const [leadSettings, setLeadSettings] = useState(DEFAULT_LANDING_LEAD_SETTINGS);
  const started = useRef(false);
  const c = COPY[lang];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('lang');
    const nextLang = requested === 'en' || requested === 'es'
      ? requested
      : (navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es');
    setLang(nextLang);
    document.documentElement.lang = nextLang;
    setSource(params.get('source')?.slice(0, 60) || 'adwords_lp');
    setUtm({
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let active = true;
    supabase
      .from('site_settings')
      .select('value')
      .eq('id', LANDING_LEAD_SETTINGS_ID)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.warn('[landing] Lead settings fallback:', error.message);
        setLeadSettings(normalizeLandingLeadSettings(data?.value));
      });
    return () => { active = false; };
  }, []);

  const openModal = useCallback((trigger) => {
    if (submitted) return;
    started.current = true;
    setModalTrigger(trigger);
    setModalOpen(true);
    fireEvent('enquiry_open', { trigger });
    fireEvent('enquiry_start', { trigger });
  }, [submitted]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    fireEvent('enquiry_close', { trigger: modalTrigger });
  }, [modalTrigger]);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === '1'; } catch { seen = false; }
    if (seen || submitted || !leadSettings.autoOpenEnabled) return undefined;
    const timer = setTimeout(() => {
      if (!started.current && !submitted) {
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* preview/privacy mode */ }
        openModal(`timer-${leadSettings.timeTriggerMs}ms`);
      }
    }, leadSettings.timeTriggerMs);
    return () => clearTimeout(timer);
  }, [leadSettings.autoOpenEnabled, leadSettings.timeTriggerMs, openModal, submitted]);

  useEffect(() => {
    if (submitted) return undefined;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && (window.scrollY / max) * 100 >= leadSettings.scrollTriggerPct && !started.current) openModal(`scroll-${leadSettings.scrollTriggerPct}`);
    };
    const onMouseOut = (event) => {
      if (leadSettings.exitIntentEnabled && event.clientY <= 0 && !event.relatedTarget && !started.current && window.innerWidth >= 1040) openModal('exit-intent');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mouseout', onMouseOut);
    return () => { window.removeEventListener('scroll', onScroll); document.removeEventListener('mouseout', onMouseOut); };
  }, [leadSettings.exitIntentEnabled, leadSettings.scrollTriggerPct, openModal, submitted]);

  const switchLanguage = () => {
    const next = lang === 'en' ? 'es' : 'en';
    setLang(next);
    document.documentElement.lang = next;
    fireEvent('language_switch', { language: next });
  };

  const cta = (location) => {
    fireEvent('cta_click', { location });
    openModal(location);
  };

  const ratingCards = useMemo(() => [
    { name: 'Google', rating: '5.0', color: '#f4b400', href: links.googleReviewUrl || links.googleMapsUrl, detail: lang === 'en' ? 'Customer rating' : 'Calificación de clientes' },
    { name: 'Trustpilot', rating: liveTrustpilotRating, color: '#00b67a', href: getTrustpilotReviewUrl(lang, links), detail: `${liveTrustpilotCount} ${c.reviews}` },
    { name: 'Facebook', rating: '5.0', color: '#1877f2', href: getFacebookReviewUrl(links), detail: lang === 'en' ? 'Community rating' : 'Calificación de la comunidad' },
  ], [c.reviews, lang, links, liveTrustpilotRating, liveTrustpilotCount]);

  return (
    <div className="lead-lp">
      <header className="lead-header">
        <div className="lead-container lead-header-inner">
          <Link href="/" className="lead-brand" aria-label="Peptides Costa Rica home"><Image src="/logo.webp" alt="Peptides Costa Rica" width={64} height={54} priority /></Link>
          <nav aria-label="Landing page navigation">
            <a href="#why">{c.nav.why}</a><a href="#trust">{c.nav.trust}</a><a href="#faq">{c.nav.faq}</a>
          </nav>
          <div className="lead-header-actions">
            <button type="button" className="lead-lang" onClick={switchLanguage}><Globe2 size={16} />{lang === 'en' ? 'ES' : 'EN'}</button>
            <Link className="lead-catalog-link" href={`/catalog?lang=${lang}`} onClick={() => fireEvent('catalog_click', { location: 'header' })}>{c.nav.catalog}<ArrowRight size={15} /></Link>
            <button type="button" className="lead-header-cta" onClick={() => cta('header')}>{c.nav.request}</button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="lead-hero">
          <div className="lead-hero-glow lead-hero-glow-one" /><div className="lead-hero-glow lead-hero-glow-two" />
          <div className="lead-container lead-hero-grid">
            <div className="lead-hero-copy">
              <span className="lead-eyebrow"><Sparkles size={15} />{c.eyebrow}</span>
              <h1>{c.heroTitle}</h1>
              <p>{c.heroText}</p>
              <div className="lead-hero-actions">
                <button type="button" className="lead-primary" onClick={() => cta('hero')}>{c.heroCta}<ArrowRight size={18} /></button>
                <Link className="lead-secondary" href={`/catalog?lang=${lang}`} onClick={() => fireEvent('catalog_click', { location: 'hero' })}>{c.heroCatalog}<ArrowRight size={18} /></Link>
                <span><ShieldCheck size={16} />{c.heroNote}</span>
              </div>
              <div className="lead-mini-proof"><BadgeCheck size={17} /><span>{lang === 'en' ? 'Trusted local support • Research-use only' : 'Soporte local confiable • Solo para investigación'}</span></div>
            </div>
            <div className="lead-hero-visual" aria-label={c.heroCardTitle}>
              <div className="lead-orbit lead-orbit-one" /><div className="lead-orbit lead-orbit-two" />
              <Image src="/modern_3d_vials_group.png" alt="Peptides Costa Rica research vials" width={650} height={520} priority sizes="(max-width: 760px) 100vw, 50vw" />
              <div className="lead-guidance-card">
                <span>{c.heroCardEyebrow}</span><strong>{c.heroCardTitle}</strong>
                <div>{c.heroCardPoints.map((item) => <small key={item}><Check size={13} />{item}</small>)}</div>
              </div>
            </div>
          </div>
          <div className="lead-container lead-stats">
            {[[c.stat1, c.stat1Text, Globe2], [c.stat2, c.stat2Text, FileCheck2], [c.stat3, c.stat3Text, UserRoundCheck]].map(([title, text, Icon]) => (
              <div key={title}><Icon size={21} /><span><strong>{title}</strong><small>{text}</small></span></div>
            ))}
          </div>
        </section>

        <section className="lead-section" id="why">
          <div className="lead-container">
            <div className="lead-section-heading"><span className="lead-eyebrow">{c.whyEyebrow}</span><h2>{c.whyTitle}</h2><p>{c.whyText}</p></div>
            <div className="lead-proof-grid">
              {c.proof.map(([title, text], index) => { const Icon = PROOF_ICONS[index]; return <article key={title}><i><Icon size={23} /></i><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>; })}
            </div>
            <div className="lead-centered"><button type="button" className="lead-primary" onClick={() => cta('after-proof')}>{c.proofCta}<ArrowRight size={18} /></button></div>
            <div className="lead-compliance"><FlaskConical size={20} /><p>{c.compliance}</p></div>
          </div>
        </section>

        <section className="lead-section lead-trust" id="trust">
          <div className="lead-container">
            <div className="lead-section-heading"><span className="lead-eyebrow">{c.trustEyebrow}</span><h2>{c.trustTitle}</h2></div>
            <div className="lead-ratings">
              {ratingCards.map((card) => (
                <a key={card.name} href={card.href} target="_blank" rel="noopener noreferrer" style={{ '--rating': card.color }} aria-label={`${card.name} ${card.rating} out of 5`}>
                  <div><strong>{card.name}</strong><span>{card.detail}</span></div>
                  <b>{card.rating}</b>
                  <div className="lead-stars">{[0,1,2,3,4].map((star) => <Star key={star} size={15} fill="currentColor" />)}</div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="lead-section lead-facts">
          <div className="lead-container">
            <div className="lead-section-heading"><span className="lead-eyebrow">{c.factsEyebrow}</span><h2>{c.factsTitle}</h2></div>
            <div className="lead-facts-grid">
              {c.facts.map(([title, text], index) => { const Icon = FACT_ICONS[index]; return <article key={title}><Icon size={21} /><div><h3>{title}</h3><p>{text}</p></div></article>; })}
            </div>
          </div>
        </section>

        <section className="lead-section lead-faq" id="faq">
          <div className="lead-container lead-faq-grid">
            <div className="lead-section-heading"><span className="lead-eyebrow">{c.faqEyebrow}</span><h2>{c.faqTitle}</h2><p>{lang === 'en' ? 'Clear answers before you share your details.' : 'Respuestas claras antes de compartir sus datos.'}</p></div>
            <div className="lead-faq-list">
              {c.faqs.map(([question, answer], index) => {
                const active = openFaq === index;
                return <article key={question} className={active ? 'is-open' : ''}><button type="button" onClick={() => { setOpenFaq(active ? -1 : index); fireEvent('faq_open', { question: index + 1 }); }} aria-expanded={active}><span>{question}</span><ChevronDown size={19} /></button>{active && <p>{answer}</p>}</article>;
              })}
            </div>
          </div>
        </section>

        <section className="lead-closing">
          <div className="lead-container lead-closing-inner">
            <div><span className="lead-eyebrow">{c.closingEyebrow}</span><h2>{c.closingTitle}</h2><p>{c.closingText}</p></div>
            <button type="button" className="lead-primary lead-primary-light" onClick={() => cta('closing')}>{c.closingCta}<ArrowRight size={18} /></button>
          </div>
        </section>
      </main>

      <footer className="lead-footer">
        <div className="lead-container lead-footer-grid">
          <div><Link href="/" className="lead-footer-brand" aria-label="Peptides Costa Rica home"><Image src="/logo.webp" alt="Peptides Costa Rica" width={190} height={85} /></Link><p>{c.footerBlurb}</p></div>
          <div><strong>{lang === 'en' ? 'Explore' : 'Explorar'}</strong><Link href={`/catalog?lang=${lang}`}>{lang === 'en' ? 'Catalog' : 'Catálogo'}</Link><Link href={`/about?lang=${lang}`}>{lang === 'en' ? 'About us' : 'Nosotros'}</Link><Link href={`/faq?lang=${lang}`}>FAQ</Link></div>
          <div><strong>{lang === 'en' ? 'Policies' : 'Políticas'}</strong><Link href="/privacy-policy">{lang === 'en' ? 'Privacy' : 'Privacidad'}</Link><Link href="/shipping-policy">{lang === 'en' ? 'Shipping' : 'Envíos'}</Link><Link href="/return-refund-policy">{lang === 'en' ? 'Returns' : 'Devoluciones'}</Link></div>
          <div><strong>{lang === 'en' ? 'Contact' : 'Contacto'}</strong><a href="mailto:info@peptidescostarica.net">info@peptidescostarica.net</a><button type="button" onClick={() => cta('footer')}>{c.footerRequest}</button></div>
        </div>
        <div className="lead-container lead-footer-bottom"><span>© {new Date().getFullYear()} Peptides Costa Rica</span><span>{c.legal}</span></div>
      </footer>

      <button type="button" className="lead-floating-cta" onClick={() => cta('floating')}><Sparkles size={17} />{c.heroCta}</button>

      <LeadModal open={modalOpen} onClose={closeModal} lang={lang} source={source} utm={utm} settings={leadSettings} onSubmitted={() => setSubmitted(true)} />
    </div>
  );
}
