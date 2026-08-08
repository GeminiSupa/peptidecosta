"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ExternalLink, FileText, Loader2, MessageCircle, Minus, Paperclip, Send, UserRound, X } from 'lucide-react';
import {
  DEFAULT_LIVE_CHAT_DIAL_CODE,
  LIVE_CHAT_DIAL_CODES,
  canStartLiveChat,
  composeLiveChatPhone,
  dialCodeLabel,
  isLiveChatDialCode,
  isUsablePhone,
  renderLiveChatMessage as messageText,
  missingLiveChatContact,
  shouldShowVisitorProfileForm,
  splitLiveChatPhone,
} from '@/lib/liveChat';
import {
  DAY_LABELS,
  DAY_LABELS_ES,
  formatDayHours,
  formatHour12,
  isLiveChatOnline,
  nextOpening,
  normalizeLiveChatAvailability,
  scheduleForDay,
} from '@/lib/liveChatAvailability.mjs';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { crHourAndDay } from '@/lib/crTime.mjs';

const VISITOR_ID_KEY = 'peptides_live_chat_visitor_id';
const VISITOR_PROFILE_KEY = 'peptides_live_chat_profile';
const PROMPT_DISMISSED_KEY = 'peptides_live_chat_prompt_dismissed';
const RATED_CONVERSATION_KEY = 'peptides_live_chat_rated_conversation';
const POLL_MS = 12000;

function createVisitorId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `lc_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `lc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getVisitorId() {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem(VISITOR_ID_KEY);
  if (existing) return existing;
  const next = createVisitorId();
  localStorage.setItem(VISITOR_ID_KEY, next);
  return next;
}

// `phone` holds the local number only; the country lives in `dialCode`. They
// are joined into one string when the number is sent, so the CRM keeps storing
// a whole number as it always did.
const EMPTY_PROFILE = { name: '', email: '', phone: '', dialCode: DEFAULT_LIVE_CHAT_DIAL_CODE };

function readProfile() {
  if (typeof window === 'undefined') return { ...EMPTY_PROFILE };
  try {
    const parsed = JSON.parse(localStorage.getItem(VISITOR_PROFILE_KEY) || '{}');
    // A profile saved before the picker existed holds the whole number in
    // `phone`, so it is split back apart rather than shown with its country
    // code sitting in the text box.
    const stored = splitLiveChatPhone(parsed.phone || '');
    return {
      name: parsed.name || '',
      email: parsed.email || '',
      phone: parsed.dialCode ? (parsed.phone || '') : stored.localNumber,
      dialCode: isLiveChatDialCode(parsed.dialCode) ? parsed.dialCode : stored.dialCode,
    };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(VISITOR_PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

// The staffed hours now live in the availability setting, so the copy below is
// built from whatever the dashboard has saved rather than a constant here. A
// visitor is never told a window nobody is actually working.

function formatTime(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [visitorId, setVisitorId] = useState('');
  const [profile, setProfile] = useState({ ...EMPTY_PROFILE });
  const [knownVisitor, setKnownVisitor] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  // Kept apart from `error`, which is for the chat itself failing.
  const [contactNotice, setContactNotice] = useState('');
  const [lang, setLang] = useState('es');
  const [showPrompt, setShowPrompt] = useState(false);
  const [ratingSent, setRatingSent] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [pending, setPending] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // The embed route is rendered inside a customer's iframe, where a fixed
  // launcher would anchor to the iframe box instead of the real viewport.
  const shouldHide = pathname?.startsWith('/admin') || pathname?.startsWith('/embed');

  useEffect(() => {
    if (shouldHide) return;
    setVisitorId(getVisitorId());
    const stored = readProfile();
    setProfile(stored);
    // "Known" now means we hold everything a chat requires, not just some
    // fragment of it — a visitor stored with only a name still has to be asked
    // for a way to reach them back. Read once at load, never derived from the
    // fields as they are typed: see shouldShowVisitorProfileForm.
    setKnownVisitor(canStartLiveChat({
      ...stored,
      phone: composeLiveChatPhone(stored.dialCode, stored.phone),
    }));
    setLang(localStorage.getItem('lang') || 'es');
  }, [shouldHide]);

  useEffect(() => {
    if (typeof window === 'undefined' || shouldHide) return undefined;
    const syncLang = () => {
      if (document.hidden) return;
      setLang(localStorage.getItem('lang') || 'es');
    };
    const interval = setInterval(syncLang, 1500);
    window.addEventListener('storage', syncLang);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', syncLang);
    };
  }, [shouldHide]);

  // Availability comes from the dashboard so a superadmin can force the chat
  // online or offline, or move the hours, without a deploy. Until the first
  // fetch lands (and if it fails) this falls back to the shipped schedule.
  const config = useMemo(() => normalizeLiveChatAvailability(availability), [availability]);

  // Recomputed whenever the config changes; the widget polls every 12s and
  // re-renders with it, so the clock never drifts far from what is shown.
  const { offline, todayHours, reopens } = useMemo(() => {
    const { hour, day } = crHourAndDay(new Date().toISOString());
    const today = scheduleForDay(config, day);
    return {
      offline: !isLiveChatOnline(config, hour, day),
      todayHours: today.ranges,
      reopens: nextOpening(config, day, hour),
    };
  }, [config]);

  // Today's own hours, not the week's — a visitor on a short Saturday should
  // not be told the Monday window.
  const closedToday = todayHours.length === 0;
  const hours = formatDayHours(todayHours, '');

  // "back Monday from 9am". Only reached when today is closed, so it never
  // competes with today's own hours for the same line.
  const reopensText = useMemo(() => {
    if (!reopens) return '';
    const dayName = (lang === 'en' ? DAY_LABELS : DAY_LABELS_ES)[reopens.day];
    return lang === 'en'
      ? `${dayName} from ${formatHour12(reopens.openHour)}`
      : `${dayName} desde las ${formatHour12(reopens.openHour)}`;
  }, [reopens, lang]);

  // What the visitor still has to supply before a chat can start. Checked
  // against the details as they stand right now — unlike the form's visibility,
  // which must not move while they are still typing into it.
  // The number as it leaves the widget: country code and local part joined. The
  // one value validated and sent, so what is checked is always what is stored.
  const composedPhone = useMemo(
    () => composeLiveChatPhone(profile.dialCode, profile.phone),
    [profile.dialCode, profile.phone],
  );

  // Memoized so the array is stable between renders and can be a dependency of
  // the copy below.
  const contactMissing = useMemo(
    () => missingLiveChatContact({ ...profile, phone: composedPhone }),
    [profile, composedPhone],
  );

  // A number was typed but does not pass — almost always a digit short or a
  // digit over. Told apart from an empty box so the nudge can say "check the
  // number" rather than "add a phone number" to somebody who plainly just did.
  const phoneIncomplete = Boolean(String(profile.phone || '').trim()) && !isUsablePhone(composedPhone);

  const copy = useMemo(() => ({
    title: lang === 'en' ? 'Live support' : 'Soporte en vivo',
    // Header strip: sits beside a 36px avatar and two buttons, so it has to fit
    // on one short line. Naming the hours is also more use to a visitor than
    // "during business hours" was.
    subtitle: offline
      ? (closedToday
        ? (lang === 'en' ? 'Offline · closed today' : 'Desconectados · cerrado hoy')
        : (lang === 'en' ? `Offline · open ${hours}` : `Desconectados · ${hours}`))
      : (lang === 'en' ? 'Usually replies in a few minutes' : 'Respondemos pronto'),
    // Message list: full width, so it can say it properly. This used to reuse
    // the header string, which is why one line had to serve two very different
    // spaces and fitted neither.
    // Three cases, because the hours are now per day: open later today, closed
    // today but back on a named day, and closed with no next opening at all —
    // where naming a time would be a promise nobody is going to keep.
    offlineNote: (() => {
      if (!closedToday) {
        return lang === 'en'
          ? `We are offline right now. Today our team replies ${hours}, Costa Rica time.`
          : `Estamos fuera de horario. Hoy nuestro equipo responde de ${hours}, hora de Costa Rica.`;
      }
      if (reopensText) {
        return lang === 'en'
          ? `We are closed today. Our team is back ${reopensText}, Costa Rica time.`
          : `Hoy estamos cerrados. Nuestro equipo vuelve el ${reopensText}, hora de Costa Rica.`;
      }
      return lang === 'en'
        ? 'We are offline right now. Leave a message and our team will reply here.'
        : 'Estamos fuera de horario. Déjenos un mensaje y le responderemos aquí.';
    })(),
    welcome: lang === 'en'
      ? 'Hi. Send us a message here and our team will reply in this chat.'
      : 'Hola. Escríbanos aquí y nuestro equipo responderá en este chat.',
    // Email and phone are each optional on their own but not together, which a
    // per-field "optional"/"required" label cannot say. The line above the
    // fields carries that rule instead.
    name: lang === 'en' ? 'Name' : 'Nombre',
    email: lang === 'en' ? 'Email' : 'Correo',
    phone: lang === 'en' ? 'Phone' : 'Teléfono',
    country: lang === 'en' ? 'Country code' : 'Código de país',
    contactRule: lang === 'en'
      ? 'Your name, and an email or phone number, so our team can reply.'
      : 'Su nombre, y un correo o teléfono, para que nuestro equipo pueda responderle.',
    // Named separately from the rule so the nudge after a blocked send says
    // what is actually missing rather than repeating the whole instruction.
    contactRequired: (() => {
      const needsName = contactMissing.includes('name');
      const needsReach = contactMissing.includes('contact');
      if (needsName && needsReach) {
        return lang === 'en'
          ? 'Please add your name and an email or phone number first.'
          : 'Por favor agregue su nombre y un correo o teléfono primero.';
      }
      if (needsName) {
        return lang === 'en' ? 'Please add your name first.' : 'Por favor agregue su nombre primero.';
      }
      if (phoneIncomplete) {
        return lang === 'en'
          ? 'That phone number does not look complete. Please check it.'
          : 'Ese número de teléfono no parece completo. Por favor revíselo.';
      }
      return lang === 'en'
        ? 'Please add an email or phone number so we can reply.'
        : 'Por favor agregue un correo o teléfono para poder responderle.';
    })(),
    placeholder: lang === 'en' ? 'Write a message...' : 'Escriba un mensaje...',
    sending: lang === 'en' ? 'Sending...' : 'Enviando...',
    uploading: lang === 'en' ? 'Uploading...' : 'Subiendo...',
    attach: lang === 'en' ? 'Attach screenshot or PDF' : 'Adjuntar imagen o PDF',
    uploaded: lang === 'en' ? 'Payment screenshot uploaded' : 'Comprobante de pago adjunto',
    prompt: lang === 'en' ? 'Need help choosing or completing an order?' : '¿Necesita ayuda con un producto o pedido?',
    start: lang === 'en' ? 'Start chat' : 'Abrir chat',
    quickQuestions: lang === 'en'
      ? ['Current availability', 'Shipping times', 'Payment options']
      : ['Disponibilidad', 'Tiempos de envío', 'Opciones de pago'],
    quickMessages: lang === 'en'
      ? [
        'Hi, can you help me confirm current availability?',
        'Hi, I have a question about shipping times.',
        'Hi, what payment options are available?',
      ]
      : [
        'Hola, ¿me pueden ayudar a confirmar disponibilidad actual?',
        'Hola, tengo una pregunta sobre los tiempos de envío.',
        'Hola, ¿qué opciones de pago tienen disponibles?',
      ],
    rating: lang === 'en' ? 'How was this chat?' : '¿Cómo fue este chat?',
    details: lang === 'en' ? 'Add your contact details' : 'Agregar sus datos de contacto',
    detailsHint: lang === 'en'
      ? 'So we can follow up if you close this chat.'
      : 'Para poder darle seguimiento si cierra el chat.',
    detailsDone: lang === 'en' ? 'Saved' : 'Guardado',
    error: lang === 'en'
      ? 'Chat is temporarily unavailable. Please use the contact form or email us.'
      : 'El chat no está disponible temporalmente. Use el formulario de contacto o escríbanos por correo.',
    unread: lang === 'en' ? 'New reply' : 'Nueva respuesta',
    // Screen-reader only, but a Spanish reader should not hit four English
    // words on the one part of the page it cannot see.
    dismiss: lang === 'en' ? 'Dismiss' : 'Descartar',
    minimize: lang === 'en' ? 'Minimize' : 'Minimizar',
    close: lang === 'en' ? 'Close' : 'Cerrar',
    send: lang === 'en' ? 'Send' : 'Enviar',
  }), [lang, offline, hours, closedToday, reopensText, contactMissing, phoneIncomplete]);


  const serverMessages = useMemo(() => conversation?.messages || [], [conversation]);
  // Anything the visitor sent that the server has not echoed back yet, so the
  // bubble appears the moment they hit send instead of after the round trip.
  const messages = useMemo(() => {
    if (pending.length === 0) return serverMessages;
    const seen = new Set(serverMessages.map((message) => messageText(message.message)));
    return [...serverMessages, ...pending.filter((message) => !seen.has(messageText(message.message)))];
  }, [pending, serverMessages]);
  const hasAgentReply = messages.some((message) => message.senderType === 'agent');
  const isResolved = conversation?.status === 'resolved';
  const hasContact = Boolean(profile.name || profile.email || profile.phone);
  const needsProfile = shouldShowVisitorProfileForm({
    knownVisitor,
    messageCount: serverMessages.length,
    showDetails,
  });

  // Once the conversation exists the gate is done: a visitor mid-conversation
  // is never blocked from replying, whatever we hold for them.
  const blockedUntilContact = serverMessages.length === 0 && contactMissing.length > 0;

  useEffect(() => {
    if (shouldHide || isOpen || conversation || localStorage.getItem(PROMPT_DISMISSED_KEY) === '1') return undefined;
    const timer = setTimeout(() => setShowPrompt(true), 7000);
    return () => clearTimeout(timer);
  }, [conversation, isOpen, shouldHide]);

  useEffect(() => {
    if (!conversation?.id) return;
    setRatingSent(localStorage.getItem(RATED_CONVERSATION_KEY) === conversation.id);
  }, [conversation?.id]);

  const fetchConversation = useCallback(async ({ silent = false } = {}) => {
    if (!visitorId) return;
    try {
      const response = await fetch(`/api/live-chat?visitorId=${encodeURIComponent(visitorId)}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load chat');
      setError('');
      setConversation(data.conversation || null);
      // Arrives on every poll, so flipping the toggle in the dashboard reaches
      // a visitor who already has the widget open.
      if (data.availability) setAvailability(data.availability);
    } catch (err) {
      if (!silent) setError(err.message || 'Could not load chat');
    }
  }, [visitorId]);

  useEffect(() => {
    if (!visitorId || shouldHide) return undefined;
    fetchConversation({ silent: true });
  }, [fetchConversation, visitorId, shouldHide]);

  useEffect(() => {
    if (!conversation?.id || shouldHide || !isSupabaseConfigured || !supabase) return undefined;
    const channel = supabase
      .channel(`chat-${conversation.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_chat_messages', filter: `conversation_id=eq.${conversation.id}` }, () => {
        fetchConversation({ silent: true });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_chat_conversations', filter: `id=eq.${conversation.id}` }, () => {
        fetchConversation({ silent: true });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [conversation?.id, fetchConversation, shouldHide]);

  // The realtime channel above only delivers if the live chat tables are both
  // published AND readable by `anon`, and they deliberately are not: visitors
  // are anonymous, so an anon read policy would let any visitor subscribe to
  // every other customer's chat (see enable-live-chat-realtime.sql). The open
  // panel therefore polls its own visitor-scoped endpoint. A closed widget and
  // a backgrounded tab cost nothing.
  useEffect(() => {
    if (shouldHide || !isOpen || isMinimized || !visitorId) return undefined;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetchConversation({ silent: true });
    }, 4000);
    return () => clearInterval(interval);
  }, [shouldHide, isOpen, isMinimized, visitorId, fetchConversation]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, isOpen, isMinimized]);

  // The panel goes full screen on phones, so the page behind it must not scroll.
  useEffect(() => {
    if (shouldHide) return undefined;
    const active = isOpen && !isMinimized;
    document.body.classList.toggle('lcw-open', active);
    return () => document.body.classList.remove('lcw-open');
  }, [isOpen, isMinimized, shouldHide]);

  const updateProfile = (key, value) => {
    setProfile((prev) => {
      const next = { ...prev, [key]: value };
      saveProfile(next);
      return next;
    });
  };

  const sendMessage = async (overrideMessage = null) => {
    const raw = typeof overrideMessage === 'string' ? overrideMessage : input;
    const message = String(raw ?? '').trim();
    if (!message || loading || uploading || !visitorId) return;
    // Checked here rather than only on the button, because the quick-question
    // chips call this directly and would otherwise start a chat we cannot reply
    // to.
    if (blockedUntilContact) {
      // Its own notice rather than setError: the error banner deliberately
      // shows one generic line whatever it is handed, which would tell the
      // visitor the chat is broken instead of what to fill in.
      setContactNotice(copy.contactRequired);
      setShowDetails(true);
      return;
    }
    setLoading(true);
    setInput('');
    setPending((prev) => [...prev, {
      id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderType: 'visitor',
      message,
      attachments: [],
      createdAt: new Date().toISOString(),
      optimistic: true,
    }]);
    try {
      const response = await fetch('/api/live-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          message,
          visitorName: profile.name,
          visitorEmail: profile.email,
          visitorPhone: composedPhone,
          pageUrl: window.location.href,
          referrer: document.referrer,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send message');
      setError('');
      setConversation(data.conversation || null);
      setShowDetails(false);
    } catch (err) {
      setError(err.message || copy.error);
      setInput(message);
    } finally {
      setPending((prev) => prev.filter((item) => item.message !== message));
      setLoading(false);
    }
  };

  const uploadAttachment = async (file) => {
    if (!file || uploading || loading || !visitorId) return;
    // An attachment opens a conversation just as a message does.
    if (blockedUntilContact) {
      // Its own notice rather than setError: the error banner deliberately
      // shows one generic line whatever it is handed, which would tell the
      // visitor the chat is broken instead of what to fill in.
      setContactNotice(copy.contactRequired);
      setShowDetails(true);
      return;
    }
    setUploading(true);
    const caption = input.trim();
    setInput('');
    try {
      const form = new FormData();
      form.append('visitorId', visitorId);
      form.append('file', file);
      form.append('message', caption || copy.uploaded);
      form.append('visitorName', profile.name);
      form.append('visitorEmail', profile.email);
      form.append('visitorPhone', composedPhone);
      form.append('pageUrl', window.location.href);
      form.append('referrer', document.referrer);

      const response = await fetch('/api/live-chat/upload', {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not upload file');
      setError('');
      setConversation(data.conversation || null);
    } catch (err) {
      setError(err.message || copy.error);
      setInput(caption);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendRating = async (score) => {
    if (!conversation?.id || ratingSent || !visitorId) return;
    setRatingSent(true);
    localStorage.setItem(RATED_CONVERSATION_KEY, conversation.id);
    try {
      const response = await fetch('/api/live-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          message: `Chat rating: ${score}/5`,
          visitorName: profile.name,
          visitorEmail: profile.email,
          visitorPhone: composedPhone,
          pageUrl: window.location.href,
          referrer: document.referrer,
        }),
      });
      const data = await response.json();
      if (response.ok) setConversation(data.conversation || conversation);
    } catch {}
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  if (shouldHide) return null;

  if (!isOpen) {
    return (
      <>
        {showPrompt && (
          <div className="lcw-prompt">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
                setShowPrompt(false);
              }}
              aria-label={copy.dismiss}
              style={{
                position: 'absolute', right: '8px', top: '8px',
                width: '44px', height: '44px', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                border: 0, background: 'transparent', color: '#64748b',
                cursor: 'pointer', borderRadius: '10px'
              }}
            >
              <X size={14} />
            </button>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', paddingRight: '44px' }}>{copy.prompt}</div>
            <button
              type="button"
              onClick={() => { setShowPrompt(false); setIsOpen(true); setIsMinimized(false); }}
              style={{
                minHeight: '44px', marginTop: '10px', border: 0,
                borderRadius: '10px', background: '#0f766e', color: '#fff',
                padding: '10px 14px', fontWeight: 800, cursor: 'pointer'
              }}
            >
              {copy.start}
            </button>
          </div>
        )}
        <button
          type="button"
          className="lcw-launcher"
          onClick={() => { setShowPrompt(false); setIsOpen(true); setIsMinimized(false); }}
          aria-label={copy.title}
        >
          <MessageCircle size={28} />
          {conversation?.unreadForVisitor && <span className="lcw-launcher-dot" aria-hidden="true" />}
        </button>
      </>
    );
  }

  return (
    <div className={`lcw-panel${isMinimized ? ' is-minimized' : ''}`} role="dialog" aria-label={copy.title}>
      <div
        onClick={() => setIsMinimized((value) => !value)}
        style={{
          height: '64px',
          padding: '0 16px',
          background: 'linear-gradient(135deg, #0f766e 0%, #0369a1 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {/* flex:1 so the title and status claim every pixel the buttons are not
            using. Without it this block sized to its content and the status
            line only ever got ~156px, which truncated even the online copy. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <UserRound size={18} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {copy.title}
            </div>
            {/* Truncated like the title above it. The header is a fixed 64px,
                and the offline subtitle ("Estamos desconectados. Responderemos
                en nuestro horario") wrapped to three lines and was cut in half
                by the panel's overflow, which looked broken when minimised. */}
            <div
              style={{
                fontSize: '0.72rem',
                color: '#ccfbf1',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={conversation?.unreadForVisitor ? copy.unread : copy.subtitle}
            >
              {conversation?.unreadForVisitor ? copy.unread : copy.subtitle}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setIsMinimized((value) => !value); }}
            aria-label={copy.minimize}
            className="lcw-header-btn"
          >
            {isMinimized ? <MessageCircle size={18} /> : <Minus size={18} />}
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setIsOpen(false); }}
            aria-label={copy.close}
            className="lcw-header-btn"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{
              alignSelf: 'flex-start',
              maxWidth: '86%',
              background: '#e2e8f0',
              color: '#0f172a',
              borderRadius: '16px 16px 16px 4px',
              padding: '11px 13px',
              fontSize: '0.86rem',
              lineHeight: 1.5,
            }}>
              {copy.welcome}
            </div>

            {needsProfile && (
              <div style={{
                display: 'grid',
                gap: '8px',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px',
              }}>
                {/* Before the chat starts these details are the requirement, so
                    the line states the rule. Afterwards the form is only ever
                    reopened by the visitor themselves, where the old "so we can
                    follow up" wording is the honest one. */}
                <div style={{ color: '#475569', fontSize: '0.74rem' }}>
                  {blockedUntilContact ? copy.contactRule : copy.detailsHint}
                </div>
                <input value={profile.name} onChange={(e) => updateProfile('name', e.target.value)} placeholder={copy.name} style={inputStyle} autoComplete="name" />
                <input value={profile.email} onChange={(e) => updateProfile('email', e.target.value)} placeholder={copy.email} style={inputStyle} type="email" inputMode="email" autoComplete="email" />
                {/* The country sits beside the number rather than being typed
                    into it, so a Costa Rican number arrives dialable without
                    the visitor having to know to write +506. */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    value={profile.dialCode}
                    onChange={(e) => updateProfile('dialCode', e.target.value)}
                    style={{ ...inputStyle, flex: '0 0 82px', minWidth: 0 }}
                    aria-label={copy.country}
                    title={copy.country}
                  >
                    {/* A closed select can only show its selected option's own
                        text, so that one row carries just the code and the rest
                        carry the country name — which is what keeps "+506" in
                        the form and "+506 Costa Rica" in the list. Staying with
                        a native select also keeps the OS picker on phones,
                        which beats any custom list on a small screen. */}
                    {LIVE_CHAT_DIAL_CODES.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.code === profile.dialCode ? entry.code : `${entry.code} ${dialCodeLabel(entry, lang)}`}
                      </option>
                    ))}
                  </select>
                  <input
                    value={profile.phone}
                    onChange={(e) => updateProfile('phone', e.target.value)}
                    placeholder={copy.phone}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                  />
                </div>
                {showDetails && (
                  <button type="button" onClick={() => setShowDetails(false)} className="lcw-ghost-btn">
                    {copy.detailsDone}
                  </button>
                )}
              </div>
            )}

            {/* Without this the visitor can never hand over contact details after
                the first message, which leaves every chat unqualified in the CRM. */}
            {!needsProfile && !hasContact && serverMessages.length > 0 && (
              <button type="button" onClick={() => setShowDetails(true)} className="lcw-ghost-btn" style={{ alignSelf: 'flex-start' }}>
                <UserRound size={13} /> {copy.details}
              </button>
            )}

            {messages.length === 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {copy.quickQuestions.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => sendMessage(copy.quickMessages[index])}
                    // Dimmed rather than removed while the details are missing:
                    // these chips are what tells a visitor what the chat is for,
                    // and clicking one still explains what is needed first.
                    style={{
                      border: '1px solid #bae6fd',
                      background: '#ecfeff',
                      color: '#075985',
                      borderRadius: '999px',
                      padding: '8px 10px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      opacity: blockedUntilContact ? 0.55 : 1,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) => {
              const isVisitor = message.senderType === 'visitor';
              const text = messageText(message.message);
              const hasAttachments = message.attachments?.length > 0;
              if (!text && !hasAttachments) return null;
              return (
                <div key={message.id} style={{
                  alignSelf: isVisitor ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  opacity: message.optimistic ? 0.65 : 1,
                }}>
                  <div style={{
                    background: isVisitor ? '#0891b2' : '#fff',
                    color: isVisitor ? '#fff' : '#0f172a',
                    border: isVisitor ? '1px solid #0891b2' : '1px solid #e2e8f0',
                    borderRadius: isVisitor ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '11px 13px',
                    fontSize: '0.86rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}>
                    {text}
                    {hasAttachments && (
                      <div style={{ display: 'grid', gap: '8px', marginTop: text ? '9px' : 0 }}>
                        {message.attachments.map((attachment) => (
                          <AttachmentPreview key={attachment.path} attachment={attachment} isVisitor={isVisitor} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{
                    color: '#64748b',
                    fontSize: '0.68rem',
                    marginTop: '4px',
                    textAlign: isVisitor ? 'right' : 'left',
                  }}>
                    {message.senderType === 'agent' && (message.senderName || 'Support') + ' · '}
                    {message.optimistic ? copy.sending : formatTime(message.createdAt)}
                  </div>
                </div>
              );
            })}

            {uploading && (
              <div style={{ color: '#64748b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={14} className="animate-spin" /> {copy.uploading}
              </div>
            )}
            {error && (
              <div style={{ color: '#b91c1c', fontSize: '0.78rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '8px 10px' }}>
                {copy.error}
              </div>
            )}
            {/* Gated on blockedUntilContact as well as on the notice itself, so
                filling the fields in clears it without needing to be dismissed. */}
            {contactNotice && blockedUntilContact && (
              <div style={{ color: '#92400e', fontSize: '0.78rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '8px 10px' }}>
                {contactNotice}
              </div>
            )}
            {!hasAgentReply && messages.length > 0 && (
              <div style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>
                {offline ? copy.offlineNote : copy.subtitle}
              </div>
            )}
            {/* Asking to rate while the agent is still mid-conversation reads as
                a brush-off, so wait until the thread is actually resolved. */}
            {hasAgentReply && isResolved && !ratingSent && (
              <div style={{ alignSelf: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ color: '#475569', fontSize: '0.76rem', marginBottom: '6px' }}>{copy.rating}</div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => sendRating(score)}
                      style={{ border: 0, background: '#f1f5f9', color: '#0f172a', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer', fontWeight: 800 }}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="lcw-composer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
              onChange={(event) => uploadAttachment(event.target.files?.[0])}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploading}
              aria-label={copy.attach}
              title={copy.attach}
              className="lcw-composer-btn"
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0f766e',
                cursor: loading || uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
            </button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={copy.placeholder}
              rows={1}
              className="lcw-textarea"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || uploading || !input.trim()}
              aria-label={copy.send}
              className="lcw-composer-btn"
              style={{
                border: 0,
                background: input.trim() && !loading && !uploading ? '#0f766e' : '#94a3b8',
                color: '#fff',
                cursor: input.trim() && !loading && !uploading ? 'pointer' : 'not-allowed',
              }}
            >
              <Send size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AttachmentPreview({ attachment, isVisitor }) {
  const linkColor = isVisitor ? '#ecfeff' : '#0369a1';
  const borderColor = isVisitor ? 'rgba(255,255,255,0.22)' : '#e2e8f0';
  const background = isVisitor ? 'rgba(255,255,255,0.12)' : '#f8fafc';

  if (attachment.kind === 'image' && attachment.url) {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" style={{ display: 'block', color: linkColor, textDecoration: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name || 'Uploaded image'}
          style={{
            display: 'block',
            width: '100%',
            maxHeight: '180px',
            objectFit: 'cover',
            borderRadius: '10px',
            border: `1px solid ${borderColor}`,
            background,
          }}
        />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '5px', fontSize: '0.72rem', fontWeight: 700 }}>
          Open image <ExternalLink size={12} />
        </span>
      </a>
    );
  }

  return (
    <a
      href={attachment.url || '#'}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        padding: '8px',
        background,
        color: linkColor,
        textDecoration: 'none',
        pointerEvents: attachment.url ? 'auto' : 'none',
      }}
    >
      <FileText size={16} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', fontWeight: 700 }}>
        {attachment.name || 'Attachment'}
      </span>
      {attachment.url && <ExternalLink size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
    </a>
  );
}


const inputStyle = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  padding: '9px 10px',
  color: '#0f172a',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
};
