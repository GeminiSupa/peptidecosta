"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ExternalLink, FileText, Loader2, MessageCircle, Minus, Paperclip, Send, UserRound, X } from 'lucide-react';

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

function readProfile() {
  if (typeof window === 'undefined') return { name: '', email: '', phone: '' };
  try {
    const parsed = JSON.parse(localStorage.getItem(VISITOR_PROFILE_KEY) || '{}');
    return {
      name: parsed.name || '',
      email: parsed.email || '',
      phone: parsed.phone || '',
    };
  } catch {
    return { name: '', email: '', phone: '' };
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(VISITOR_PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

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
  const [profile, setProfile] = useState({ name: '', email: '', phone: '' });
  const [conversation, setConversation] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('es');
  const [showPrompt, setShowPrompt] = useState(false);
  const [ratingSent, setRatingSent] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const shouldHide = pathname?.startsWith('/admin');

  useEffect(() => {
    if (shouldHide) return;
    setVisitorId(getVisitorId());
    setProfile(readProfile());
    setLang(localStorage.getItem('lang') || 'es');
  }, [shouldHide]);

  useEffect(() => {
    if (typeof window === 'undefined' || shouldHide) return undefined;
    const interval = setInterval(() => {
      setLang(localStorage.getItem('lang') || 'es');
    }, 800);
    return () => clearInterval(interval);
  }, [shouldHide]);

  const copy = useMemo(() => ({
    title: lang === 'en' ? 'Live support' : 'Soporte en vivo',
    subtitle: lang === 'en' ? 'Usually replies in a few minutes' : 'Respondemos pronto',
    welcome: lang === 'en'
      ? 'Hi. Send us a message here and our team will reply in this chat.'
      : 'Hola. Escríbanos aquí y nuestro equipo responderá en este chat.',
    name: lang === 'en' ? 'Name' : 'Nombre',
    email: lang === 'en' ? 'Email' : 'Correo',
    phone: lang === 'en' ? 'Phone optional' : 'Teléfono opcional',
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
    error: lang === 'en'
      ? 'Chat is temporarily unavailable. Please use the contact form or email us.'
      : 'El chat no está disponible temporalmente. Use el formulario de contacto o escríbanos por correo.',
    unread: lang === 'en' ? 'New reply' : 'Nueva respuesta',
  }), [lang]);

  const messages = conversation?.messages || [];
  const hasAgentReply = messages.some((message) => message.senderType === 'agent');
  const needsProfile = !profile.name && !profile.email && messages.length === 0;

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
    if (!silent) setPolling(true);
    try {
      const response = await fetch(`/api/live-chat?visitorId=${encodeURIComponent(visitorId)}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load chat');
      setError('');
      setConversation(data.conversation || null);
    } catch (err) {
      if (!silent) setError(err.message || 'Could not load chat');
    } finally {
      if (!silent) setPolling(false);
    }
  }, [visitorId]);

  useEffect(() => {
    if (!visitorId || shouldHide) return undefined;
    fetchConversation({ silent: true });
    const interval = setInterval(() => fetchConversation({ silent: true }), POLL_MS);
    return () => clearInterval(interval);
  }, [fetchConversation, visitorId, shouldHide]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, isOpen, isMinimized]);

  const updateProfile = (key, value) => {
    setProfile((prev) => {
      const next = { ...prev, [key]: value };
      saveProfile(next);
      return next;
    });
  };

  const sendMessage = async (overrideMessage = null) => {
    const message = String(overrideMessage ?? input).trim();
    if (!message || loading || uploading || !visitorId) return;
    setLoading(true);
    setInput('');
    try {
      const response = await fetch('/api/live-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          message,
          visitorName: profile.name,
          visitorEmail: profile.email,
          visitorPhone: profile.phone,
          pageUrl: window.location.href,
          referrer: document.referrer,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send message');
      setError('');
      setConversation(data.conversation || null);
    } catch (err) {
      setError(err.message || copy.error);
      setInput(message);
    } finally {
      setLoading(false);
    }
  };

  const uploadAttachment = async (file) => {
    if (!file || uploading || loading || !visitorId) return;
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
      form.append('visitorPhone', profile.phone);
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
          visitorPhone: profile.phone,
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
          <div style={{
            position: 'fixed',
            left: '24px',
            bottom: '96px',
            zIndex: 9999,
            width: '280px',
            maxWidth: 'calc(100vw - 48px)',
            background: '#fff',
            color: '#0f172a',
            border: '1px solid #dbeafe',
            borderRadius: '16px',
            boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)',
            padding: '14px',
          }}>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
                setShowPrompt(false);
              }}
              aria-label="Dismiss"
              style={{ position: 'absolute', right: '8px', top: '8px', border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', paddingRight: '22px' }}>{copy.prompt}</div>
            <button
              type="button"
              onClick={() => { setShowPrompt(false); setIsOpen(true); setIsMinimized(false); }}
              style={{ marginTop: '10px', border: 0, borderRadius: '10px', background: '#0f766e', color: '#fff', padding: '8px 10px', fontWeight: 800, cursor: 'pointer' }}
            >
              {copy.start}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => { setShowPrompt(false); setIsOpen(true); setIsMinimized(false); }}
          aria-label={copy.title}
          style={{
            position: 'fixed',
            left: '24px',
            bottom: '24px',
            zIndex: 9999,
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: '1px solid rgba(14, 165, 233, 0.5)',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)',
            color: '#fff',
            boxShadow: '0 14px 38px rgba(8, 47, 73, 0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <MessageCircle size={28} />
        </button>
      </>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '24px',
        bottom: '24px',
        zIndex: 9999,
        width: '370px',
        maxWidth: 'calc(100vw - 48px)',
        height: isMinimized ? '64px' : '560px',
        maxHeight: 'calc(100vh - 96px)',
        background: '#0f172a',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        borderRadius: '18px',
        boxShadow: '0 24px 70px rgba(2, 6, 23, 0.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 160ms ease',
      }}
    >
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
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
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {copy.title}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#ccfbf1' }}>
              {conversation?.unreadForVisitor ? copy.unread : copy.subtitle}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setIsMinimized((value) => !value); }}
            aria-label="Minimize"
            style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', padding: '4px' }}
          >
            {isMinimized ? <MessageCircle size={18} /> : <Minus size={18} />}
          </button>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setIsOpen(false); }}
            aria-label="Close"
            style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer', padding: '4px' }}
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
                <input value={profile.name} onChange={(e) => updateProfile('name', e.target.value)} placeholder={copy.name} style={inputStyle} />
                <input value={profile.email} onChange={(e) => updateProfile('email', e.target.value)} placeholder={copy.email} style={inputStyle} />
                <input value={profile.phone} onChange={(e) => updateProfile('phone', e.target.value)} placeholder={copy.phone} style={inputStyle} />
              </div>
            )}

            {messages.length === 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {copy.quickQuestions.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => sendMessage(copy.quickMessages[index])}
                    style={{
                      border: '1px solid #bae6fd',
                      background: '#ecfeff',
                      color: '#075985',
                      borderRadius: '999px',
                      padding: '8px 10px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) => {
              const isVisitor = message.senderType === 'visitor';
              return (
                <div key={message.id} style={{
                  alignSelf: isVisitor ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
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
                  }}>
                    {message.message}
                    {message.attachments?.length > 0 && (
                      <div style={{ display: 'grid', gap: '8px', marginTop: message.message ? '9px' : 0 }}>
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
                    {formatTime(message.createdAt)}
                  </div>
                </div>
              );
            })}

            {(loading || polling) && (
              <div style={{ color: '#64748b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={14} className="animate-spin" /> {loading ? copy.sending : ''}
              </div>
            )}
            {uploading && (
              <div style={{ color: '#64748b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={14} className="animate-spin" /> {copy.uploading}
              </div>
            )}
            {error && <div style={{ color: '#b91c1c', fontSize: '0.78rem' }}>{copy.error}</div>}
            {!hasAgentReply && messages.length > 0 && (
              <div style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center' }}>
                {copy.subtitle}
              </div>
            )}
            {hasAgentReply && !ratingSent && (
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

          <div style={{
            padding: '12px',
            borderTop: '1px solid #e2e8f0',
            background: '#fff',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
          }}>
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
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '14px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#0f766e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: loading || uploading ? 'not-allowed' : 'pointer',
                flexShrink: 0,
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
              style={{
                flex: 1,
                minHeight: '42px',
                maxHeight: '110px',
                resize: 'none',
                border: '1px solid #cbd5e1',
                borderRadius: '14px',
                padding: '10px 12px',
                outline: 'none',
                color: '#0f172a',
                fontSize: '0.88rem',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || uploading || !input.trim()}
              aria-label="Send"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '14px',
                border: 0,
                background: input.trim() && !loading && !uploading ? '#0f766e' : '#94a3b8',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: input.trim() && !loading && !uploading ? 'pointer' : 'not-allowed',
                flexShrink: 0,
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
