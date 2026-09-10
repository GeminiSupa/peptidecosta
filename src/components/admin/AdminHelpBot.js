'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { ADMIN_MODULES, resolveAdminTabAccess } from '@/lib/adminModules';
import { isSubUser } from '@/lib/subUserTier.mjs';
import { Bot, ChevronDown, Globe, Loader2, Send, Sparkles, X } from 'lucide-react';

const TAB_LABELS = {
  home: 'Home', orders: 'Pedidos', fulfillment: 'Despacho',
  live_chat: 'Chat en vivo', leads: 'Leads', prospects: 'Prospector',
  carts: 'Carritos', spreadsheet: 'Productos', customers: 'Clientes',
  inquiries: 'Consultas', share: 'Links', reviews: 'Reseñas',
  messenger: 'Facebook Inbox', marketing: 'Marketing Studio',
  affiliates: 'Afiliados y Promos', deals: 'Deal of the Week',
  my_qr: 'Mi QR', my_team: 'Mi equipo', my_earnings: 'Mis ganancias',
  broadcasts: 'Anuncios masivos', analytics: 'Analítica',
  cms: 'CMS / Sitio web', website: 'Sitio marketing',
  whatsapp_ai: 'WhatsApp', wa_session: 'Dispositivo WA',
  team: 'Gestión de equipo', team_chat: 'Chat de equipo',
  payment_test: 'Prueba de pagos',
};

const TAB_CHIPS = {
  es: {
    orders:      '¿Cómo proceso un pedido?',
    carts:       '¿Cómo recupero un carrito abandonado?',
    leads:       '¿Cómo doy seguimiento a un lead?',
    spreadsheet: '¿Cómo agrego un producto?',
    broadcasts:  '¿Cómo envío un anuncio masivo?',
    whatsapp_ai: '¿Cómo funciona el AI de WhatsApp?',
    affiliates:  '¿Cómo funcionan las ventas flash?',
    customers:   '¿Cómo veo el perfil de un cliente?',
    analytics:   '¿Cómo leo la analítica?',
    live_chat:   '¿Cómo respondo en el chat en vivo?',
  },
  en: {
    orders:      'How do I process an order?',
    carts:       'How to recover an abandoned cart?',
    leads:       'How do I follow up on a lead?',
    spreadsheet: 'How do I add a product?',
    broadcasts:  'How do I send a broadcast?',
    whatsapp_ai: 'How does WhatsApp AI reply work?',
    affiliates:  'How do flash sales and promo codes work?',
    customers:   'How do I view a customer profile?',
    analytics:   'How do I read the analytics?',
    live_chat:   'How do I reply in live chat?',
  },
};

const FALLBACK_CHIPS = {
  es: ['¿Qué secciones tengo disponibles?', '¿Cómo proceso un pedido?', '¿Cómo contacto a un cliente?'],
  en: ['What sections do I have access to?', 'How do I process an order?', 'How do I contact a customer?'],
};

function renderMarkdown(text) {
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<div class="ahb-step"><span>$1</span><span class="ahb-step-text">$2</span></div>');
  html = html.replace(/^[-•] (.+)$/gm, '<div class="ahb-bullet"><span class="ahb-bullet-dot"></span><span>$1</span></div>');
  html = html.replace(/→/g, '<span class="ahb-arrow">→</span>');
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

export default function AdminHelpBot({ activeTab = '', profile = null }) {
  const isSuperAdmin = Boolean(profile?.is_superadmin);
  const isSubUserProfile = isSubUser(profile);
  const firstName = (
    profile?.full_name?.split(' ')[0] ||
    profile?.name?.split(' ')[0] ||
    profile?.display_name?.split(' ')[0] ||
    profile?.email?.split('@')[0] ||
    null
  )?.trim() || null;

  const allowedTabIds = useMemo(() => {
    if (!profile) return null;
    return ADMIN_MODULES.filter((m) => resolveAdminTabAccess(m.id, profile)).map((m) => m.id);
  }, [profile]);

  // ── Language state: null = not chosen yet, 'es' | 'en' once picked ──────
  const [lang, setLang] = useState(null);

  const chips = useMemo(() => {
    if (!lang) return [];
    const dict = TAB_CHIPS[lang];
    if (!allowedTabIds) return FALLBACK_CHIPS[lang];
    const picked = allowedTabIds.filter((id) => dict[id]).slice(0, 6).map((id) => dict[id]);
    return picked.length ? picked : FALLBACK_CHIPS[lang];
  }, [allowedTabIds, lang]);

  // Welcome text — shows after language chosen
  const welcomeText = useMemo(() => {
    if (!lang) return null;
    if (!profile) {
      return lang === 'es'
        ? '¡Hola! Soy **Omer**, tu asistente de admin. Pregúntame cómo usar cualquier función del sistema.'
        : "Hi! I'm **Omer**, your admin assistant. Ask me anything about how to use the system.";
    }
    const agentGreeting = firstName
      ? (lang === 'es' ? `¡Hola, **${firstName}**!` : `Hi, **${firstName}**!`)
      : (lang === 'es' ? '¡Hola!' : 'Hi!');

    if (isSuperAdmin) {
      return lang === 'es'
        ? `${agentGreeting} Soy **Omer**, tu asistente de admin. Como **Super Admin** tienes acceso a todo el sistema.\n\nPregúntame lo que necesites o elige un tema rápido abajo.`
        : `${agentGreeting} I'm **Omer**, your admin assistant. As **Super Admin** you have access to the full system.\n\nAsk me anything or pick a quick topic below.`;
    }
    if (isSubUserProfile) {
      return lang === 'es'
        ? `${agentGreeting} Soy **Omer**. Tienes acceso a **Mis Ganancias** y **Mi QR**. Pregúntame lo que necesites.`
        : `${agentGreeting} I'm **Omer**. You have access to **My Earnings** and **My QR**. Ask me anything.`;
    }
    const sectionNames = (allowedTabIds || []).map((id) => TAB_LABELS[id] || id).filter(Boolean).slice(0, 8).join(', ');
    return lang === 'es'
      ? `${agentGreeting} Soy **Omer**, tu asistente de admin. Tienes acceso a: **${sectionNames}**.\n\nPregúntame cómo usar cualquiera de esas secciones, o elige un tema abajo.`
      : `${agentGreeting} I'm **Omer**, your admin assistant. You have access to: **${sectionNames}**.\n\nAsk me how to use any of those sections, or pick a quick topic below.`;
  }, [lang, profile, isSuperAdmin, isSubUserProfile, firstName, allowedTabIds]);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pulsing, setPulsing] = useState(true);
  const [chipsVisible, setChipsVisible] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const conversationStarted = useRef(false);

  // Once language is chosen, show the welcome message
  useEffect(() => {
    if (!lang || !welcomeText || conversationStarted.current) return;
    setMessages([{ role: 'assistant', text: welcomeText }]);
    setChipsVisible(true);
  }, [lang, welcomeText]);

  // If profile loads while welcome is showing, refresh it
  useEffect(() => {
    if (!lang || !welcomeText || conversationStarted.current) return;
    setMessages([{ role: 'assistant', text: welcomeText }]);
  }, [welcomeText]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(() => setPulsing(false), 6000); return () => clearTimeout(t); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { if (open && lang) setTimeout(() => inputRef.current?.focus(), 150); }, [open, lang]);

  function chooseLang(chosen) {
    setLang(chosen);
  }

  async function sendMessage(text) {
    const question = text.trim();
    if (!question || loading) return;

    conversationStarted.current = true;
    setInput('');
    setChipsVisible(false);
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    const doFetch = () => adminFetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'help_bot',
        prompt: question,
        context: { activeTab, allowedTabs: allowedTabIds, isSuperAdmin, isSubUser: isSubUserProfile, lang },
      }),
    });

    try {
      let res = await doFetch();
      // Retry once on 429 / 503 (Gemini high demand)
      if (res.status === 429 || res.status === 503) {
        await new Promise((r) => setTimeout(r, 2000));
        res = await doFetch();
      }

      const data = await res.json();

      if (!res.ok) {
        const isOverload = res.status === 429 || res.status === 503;
        const errMsg = isOverload
          ? (lang === 'es'
            ? '⏳ Omer está ocupado en este momento. Por favor espera unos segundos e intenta de nuevo.'
            : '⏳ Omer is busy right now. Please wait a moment and try again.')
          : `⚠️ ${data?.error || `Error ${res.status}`}`;
        setMessages((prev) => [...prev, { role: 'assistant', text: errMsg }]);
        return;
      }

      const reply = data?.text?.trim() ||
        (lang === 'es' ? '*(Sin respuesta — intenta reformular tu pregunta)*' : '*(No response — try rephrasing your question)*');
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: lang === 'es'
          ? `⚠️ Error de conexión: ${err.message}`
          : `⚠️ Connection error: ${err.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  const headerSubtitle = !lang
    ? 'Elige tu idioma · Choose your language'
    : isSuperAdmin
      ? (lang === 'es' ? 'Super Admin · Acceso completo' : 'Super Admin · Full access')
      : isSubUserProfile
        ? (lang === 'es' ? 'Sub-usuario · Acceso limitado' : 'Sub-user · Limited access')
        : allowedTabIds
          ? (lang === 'es' ? `${allowedTabIds.length} secciones disponibles` : `${allowedTabIds.length} sections available`)
          : (lang === 'es' ? 'Asistente del sistema' : 'System assistant');

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        className={`ahb-trigger${pulsing ? ' ahb-trigger--pulse' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Omer · Admin Assistant"
        title="Omer · Admin Assistant"
      >
        {open ? <ChevronDown size={20} /> : <Bot size={20} />}
        {!open && <span>Omer</span>}
      </button>

      {open && (
        <div className="ahb-panel" role="dialog" aria-label="Omer Admin Assistant">
          {/* Header */}
          <div className="ahb-header">
            <div className="ahb-header-left">
              <div className="ahb-avatar"><Sparkles size={14} /></div>
              <div>
                <strong>Omer</strong>
                <span>{headerSubtitle}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {lang && (
                <button
                  type="button"
                  className="ahb-lang-toggle"
                  onClick={() => { setLang(null); conversationStarted.current = false; setMessages([]); setChipsVisible(true); }}
                  title="Change language"
                >
                  <Globe size={14} />
                </button>
              )}
              <button type="button" className="ahb-close" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Language picker — shown before any chat */}
          {!lang ? (
            <div className="ahb-lang-screen">
              <div className="ahb-lang-icon"><Bot size={32} /></div>
              <p className="ahb-lang-title">Hola 👋 — Hi 👋</p>
              <p className="ahb-lang-sub">Soy <strong>Omer</strong>, tu asistente de admin.<br/>I'm <strong>Omer</strong>, your admin assistant.</p>
              <p className="ahb-lang-prompt">Elige tu idioma · Choose your language</p>
              <div className="ahb-lang-btns">
                <button type="button" className="ahb-lang-btn" onClick={() => chooseLang('es')}>
                  <span>🇨🇷</span> Español
                </button>
                <button type="button" className="ahb-lang-btn" onClick={() => chooseLang('en')}>
                  <span>🇬🇧</span> English
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="ahb-messages">
                {messages.map((msg, i) => (
                  <div key={i} className={`ahb-msg ahb-msg--${msg.role}`}>
                    {msg.role === 'assistant' && <div className="ahb-msg-avatar"><Bot size={12} /></div>}
                    <div
                      className="ahb-msg-bubble"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                    />
                  </div>
                ))}

                {chipsVisible && messages.length === 1 && chips.length > 0 && (
                  <div className="ahb-chips">
                    {chips.map((chip) => (
                      <button key={chip} type="button" className="ahb-chip" onClick={() => sendMessage(chip)}>
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {loading && (
                  <div className="ahb-msg ahb-msg--assistant">
                    <div className="ahb-msg-avatar"><Bot size={12} /></div>
                    <div className="ahb-msg-bubble ahb-typing"><span /><span /><span /></div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="ahb-input-row">
                <textarea
                  ref={inputRef}
                  className="ahb-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={lang === 'es' ? 'Pregunta lo que necesites…' : 'Ask anything about the system…'}
                  rows={1}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="ahb-send"
                  onClick={() => sendMessage(input)}
                  disabled={loading || !input.trim()}
                  aria-label={lang === 'es' ? 'Enviar' : 'Send'}
                >
                  {loading ? <Loader2 size={16} className="ahb-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        .ahb-trigger {
          position: fixed; bottom: 28px; right: 28px; z-index: 9000;
          display: flex; align-items: center; gap: 7px; padding: 12px 18px;
          background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
          color: #fff; border: none; border-radius: 50px;
          font-size: 0.85rem; font-weight: 600; cursor: pointer;
          box-shadow: 0 4px 24px rgba(124,58,237,0.45), 0 2px 8px rgba(0,0,0,0.4);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          letter-spacing: 0.01em;
        }
        .ahb-trigger:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 8px 32px rgba(124,58,237,0.6); }
        .ahb-trigger:active { transform: scale(0.97); }
        .ahb-trigger--pulse { animation: ahb-pulse 2s ease-in-out 3; }
        @keyframes ahb-pulse {
          0%,100% { box-shadow: 0 4px 24px rgba(124,58,237,0.45); }
          50% { box-shadow: 0 4px 40px rgba(124,58,237,0.9), 0 0 0 8px rgba(124,58,237,0.15); }
        }
        .ahb-panel {
          position: fixed; bottom: 90px; right: 28px; z-index: 8999;
          width: 390px; max-width: calc(100vw - 40px);
          height: 540px; max-height: calc(100vh - 120px);
          display: flex; flex-direction: column;
          background: #0b132b;
          border: 1px solid rgba(124,58,237,0.35); border-radius: 20px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.7);
          animation: ahb-slide-up 0.22s cubic-bezier(0.34,1.56,0.64,1);
          overflow: hidden;
        }
        @keyframes ahb-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ahb-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; flex-shrink: 0;
          background: linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(79,70,229,0.15) 100%);
          border-bottom: 1px solid rgba(124,58,237,0.2);
        }
        .ahb-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .ahb-avatar {
          width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          display: flex; align-items: center; justify-content: center;
          color: #fff; box-shadow: 0 0 12px rgba(124,58,237,0.5);
        }
        .ahb-header-left > div:last-child { display: flex; flex-direction: column; gap: 1px; min-width: 0; overflow: hidden; }
        .ahb-header strong { font-size: 0.88rem; color: #e2e8f0; font-weight: 700; display: block; white-space: nowrap; }
        .ahb-header span { font-size: 0.68rem; color: #a78bfa; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ahb-close, .ahb-lang-toggle {
          background: transparent; border: none; color: #64748b; cursor: pointer;
          padding: 4px; border-radius: 6px; display: flex; align-items: center;
          transition: color 0.15s, background 0.15s; flex-shrink: 0;
        }
        .ahb-close:hover, .ahb-lang-toggle:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }

        /* Language picker screen */
        .ahb-lang-screen {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 32px 24px; gap: 10px; text-align: center;
        }
        .ahb-lang-icon {
          width: 56px; height: 56px; border-radius: 50%; margin-bottom: 6px;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          display: flex; align-items: center; justify-content: center;
          color: #fff; box-shadow: 0 0 24px rgba(124,58,237,0.5);
        }
        .ahb-lang-title { font-size: 1.2rem; font-weight: 700; color: #e2e8f0; margin: 0; }
        .ahb-lang-sub { font-size: 0.82rem; color: #94a3b8; margin: 0; line-height: 1.5; }
        .ahb-lang-sub strong { color: #a78bfa; }
        .ahb-lang-prompt { font-size: 0.78rem; color: #64748b; margin: 6px 0 4px; }
        .ahb-lang-btns { display: flex; gap: 12px; margin-top: 4px; }
        .ahb-lang-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 24px; border-radius: 14px; border: none; cursor: pointer;
          font-size: 0.9rem; font-weight: 700;
          background: rgba(124,58,237,0.15); color: #c4b5fd;
          border: 1px solid rgba(124,58,237,0.35);
          transition: background 0.15s, transform 0.15s, border-color 0.15s;
        }
        .ahb-lang-btn span { font-size: 1.3rem; }
        .ahb-lang-btn:hover {
          background: rgba(124,58,237,0.3); border-color: rgba(124,58,237,0.7);
          transform: translateY(-2px);
        }

        /* Messages */
        .ahb-messages {
          flex: 1; overflow-y: auto; overflow-x: hidden;
          padding: 14px 14px 8px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .ahb-messages::-webkit-scrollbar { width: 4px; }
        .ahb-messages::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.3); border-radius: 4px; }
        .ahb-msg { display: flex; align-items: flex-start; gap: 8px; width: 100%; min-width: 0; }
        .ahb-msg--user { flex-direction: row-reverse; }
        .ahb-msg-avatar {
          width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          display: flex; align-items: center; justify-content: center;
          color: #fff; margin-top: 2px;
        }
        .ahb-msg-bubble {
          max-width: calc(100% - 36px);
          min-width: 0;
          padding: 10px 13px; border-radius: 14px;
          font-size: 0.82rem; line-height: 1.6; color: #e2e8f0;
          word-break: break-word;
          overflow-wrap: break-word;
          overflow: hidden;
        }
        .ahb-msg--assistant .ahb-msg-bubble {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07);
          border-top-left-radius: 4px;
        }
        .ahb-msg--user .ahb-msg-bubble {
          background: linear-gradient(135deg, rgba(124,58,237,0.35) 0%, rgba(79,70,229,0.25) 100%);
          border: 1px solid rgba(124,58,237,0.3); border-top-right-radius: 4px; text-align: right;
        }
        .ahb-msg-bubble strong { color: #a78bfa; font-weight: 700; }

        /* Numbered steps */
        .ahb-step {
          display: flex; gap: 8px; align-items: flex-start;
          margin: 4px 0; word-break: break-word;
        }
        .ahb-step > span:first-child {
          min-width: 20px; width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
          background: rgba(124,58,237,0.35); color: #a78bfa;
          font-size: 0.7rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center; margin-top: 1px;
        }
        .ahb-step-text { flex: 1; min-width: 0; word-break: break-word; overflow-wrap: break-word; }

        /* Bullets */
        .ahb-bullet {
          display: flex; gap: 8px; align-items: flex-start;
          padding-left: 4px; margin: 3px 0; word-break: break-word;
        }
        .ahb-bullet-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #7c3aed;
          flex-shrink: 0; margin-top: 5px;
        }
        .ahb-bullet > span:last-child { flex: 1; min-width: 0; word-break: break-word; overflow-wrap: break-word; }
        .ahb-arrow { color: #a78bfa; font-weight: 700; margin: 0 2px; }

        /* Typing indicator */
        .ahb-typing {
          display: flex !important; align-items: center;
          gap: 5px; padding: 12px 16px !important; min-width: 52px;
        }
        .ahb-typing span {
          width: 7px; height: 7px; border-radius: 50%; background: #7c3aed;
          animation: ahb-dot 1.2s ease-in-out infinite; display: block;
        }
        .ahb-typing span:nth-child(2) { animation-delay: 0.2s; }
        .ahb-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes ahb-dot {
          0%,80%,100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1.15); opacity: 1; }
        }

        /* Quick chips */
        .ahb-chips { display: flex; flex-wrap: wrap; gap: 7px; padding: 2px 0 4px 32px; }
        .ahb-chip {
          padding: 5px 11px; border-radius: 20px;
          border: 1px solid rgba(124,58,237,0.4); background: rgba(124,58,237,0.1);
          color: #c4b5fd; font-size: 0.75rem; cursor: pointer; line-height: 1.4;
          text-align: left; transition: background 0.15s, border-color 0.15s, transform 0.12s;
          word-break: break-word; overflow-wrap: break-word;
        }
        .ahb-chip:hover { background: rgba(124,58,237,0.22); border-color: rgba(124,58,237,0.7); transform: translateY(-1px); }

        /* Input row */
        .ahb-input-row {
          display: flex; align-items: flex-end; gap: 8px;
          padding: 10px 12px 12px; flex-shrink: 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          background: rgba(6,11,19,0.6);
        }
        .ahb-input {
          flex: 1; min-width: 0; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(124,58,237,0.25); border-radius: 12px;
          color: #e2e8f0; font-size: 0.83rem; padding: 10px 12px;
          resize: none; outline: none; font-family: inherit;
          line-height: 1.45; transition: border-color 0.18s;
          max-height: 100px; overflow-y: auto;
          word-break: break-word;
        }
        .ahb-input:focus { border-color: rgba(124,58,237,0.6); box-shadow: 0 0 0 3px rgba(124,58,237,0.12); }
        .ahb-input::placeholder { color: #475569; }
        .ahb-input:disabled { opacity: 0.5; }
        .ahb-send {
          width: 38px; height: 38px; border-radius: 10px; border: none; flex-shrink: 0;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          color: #fff; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: opacity 0.15s, transform 0.15s;
          box-shadow: 0 2px 10px rgba(124,58,237,0.4);
        }
        .ahb-send:hover:not(:disabled) { transform: scale(1.07); }
        .ahb-send:disabled { opacity: 0.4; cursor: default; }
        .ahb-spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 480px) {
          .ahb-panel { right: 12px; bottom: 80px; width: calc(100vw - 24px); }
          .ahb-trigger { right: 16px; bottom: 20px; }
        }
      `}</style>
    </>
  );
}
