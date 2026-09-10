'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { ADMIN_MODULES, resolveAdminTabAccess } from '@/lib/adminModules';
import { isSubUser } from '@/lib/subUserTier.mjs';
import { Bot, ChevronDown, Loader2, Send, Sparkles, X } from 'lucide-react';

// Map tab IDs → human-friendly names used in quick chips / welcome message
const TAB_LABELS = {
  home:         { en: 'Home / Dashboard',       es: 'Inicio / Panel' },
  orders:       { en: 'Orders',                 es: 'Pedidos' },
  fulfillment:  { en: 'Fulfillment',            es: 'Despacho' },
  live_chat:    { en: 'Live Chat',              es: 'Chat en vivo' },
  leads:        { en: 'Leads',                  es: 'Leads' },
  prospects:    { en: 'Prospector',             es: 'Prospector' },
  carts:        { en: 'Abandoned Carts',        es: 'Carritos abandonados' },
  spreadsheet:  { en: 'Products',               es: 'Productos' },
  customers:    { en: 'Customers (CRM)',        es: 'Clientes (CRM)' },
  inquiries:    { en: 'Inquiries',              es: 'Consultas' },
  share:        { en: 'Share Links',            es: 'Links de referido' },
  reviews:      { en: 'Reviews',                es: 'Reseñas' },
  messenger:    { en: 'Facebook Inbox',         es: 'Bandeja Facebook' },
  marketing:    { en: 'Marketing Studio',       es: 'Estudio de marketing' },
  affiliates:   { en: 'Affiliates & Promos',   es: 'Afiliados y promociones' },
  deals:        { en: 'Deal of the Week',       es: 'Oferta de la semana' },
  my_qr:        { en: 'My QR & Scans',         es: 'Mi QR y escaneos' },
  my_team:      { en: 'My Team',               es: 'Mi equipo' },
  my_earnings:  { en: 'My Earnings',           es: 'Mis ganancias' },
  broadcasts:   { en: 'Announcements',         es: 'Anuncios masivos' },
  analytics:    { en: 'Analytics',             es: 'Analítica' },
  cms:          { en: 'CMS / Website',         es: 'CMS / Sitio web' },
  website:      { en: 'Marketing Website',     es: 'Sitio de marketing' },
  whatsapp_ai:  { en: 'WhatsApp Inbox',        es: 'Bandeja WhatsApp' },
  wa_session:   { en: 'WhatsApp Device',       es: 'Dispositivo WhatsApp' },
  team:         { en: 'Team Management',       es: 'Gestión del equipo' },
  team_chat:    { en: 'Team Chat',             es: 'Chat del equipo' },
  payment_test: { en: 'Payment Test',          es: 'Prueba de pagos' },
};

// Quick-start chips per tab — shown when the bot opens
const TAB_CHIPS = {
  orders:      { en: 'How do I process an order?',         es: '¿Cómo proceso un pedido?' },
  carts:       { en: 'How to recover an abandoned cart?',  es: '¿Cómo recupero un carrito?' },
  leads:       { en: 'How do I follow up on a lead?',      es: '¿Cómo doy seguimiento a un lead?' },
  spreadsheet: { en: 'How do I add a product?',            es: '¿Cómo agrego un producto?' },
  broadcasts:  { en: 'How do I send a broadcast?',         es: '¿Cómo envío un anuncio masivo?' },
  whatsapp_ai: { en: 'How does WhatsApp AI reply work?',   es: '¿Cómo funciona el AI de WhatsApp?' },
  affiliates:  { en: 'How do flash sales work?',           es: '¿Cómo funcionan las ventas flash?' },
  customers:   { en: 'How do I view a customer profile?',  es: '¿Cómo veo el perfil de un cliente?' },
  analytics:   { en: 'How do I read the analytics?',       es: '¿Cómo leo la analítica?' },
  live_chat:   { en: 'How do I reply in live chat?',       es: '¿Cómo respondo en el chat en vivo?' },
};

// Fallback chips if nothing matches the agent's tabs
const FALLBACK_CHIPS = [
  { en: 'What can I do in this system?', es: '¿Qué puedo hacer en este sistema?' },
  { en: 'How do I process an order?',    es: '¿Cómo proceso un pedido?' },
  { en: 'How do I contact a customer?',  es: '¿Cómo contacto a un cliente?' },
];

function renderMarkdown(text) {
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<div class="ahb-step"><span>$1</span>$2</div>');
  html = html.replace(/^[-•] (.+)$/gm, '<div class="ahb-bullet">$1</div>');
  html = html.replace(/→/g, '<span class="ahb-arrow">→</span>');
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function detectLang() {
  if (typeof navigator === 'undefined') return 'es';
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
}

export default function AdminHelpBot({ activeTab = '', profile = null }) {
  const lang = detectLang();

  // ── Compute which tabs this agent can access ──────────────────────────────
  const allowedTabIds = useMemo(() => {
    if (!profile) return ADMIN_MODULES.map((m) => m.id); // not loaded yet → show all
    return ADMIN_MODULES
      .filter((m) => resolveAdminTabAccess(m.id, profile))
      .map((m) => m.id);
  }, [profile]);

  const isSuperAdmin = Boolean(profile?.is_superadmin);
  const isSubUserProfile = isSubUser(profile);

  // Human-readable list of allowed tabs for greeting
  const allowedTabNames = useMemo(
    () => allowedTabIds.map((id) => TAB_LABELS[id]?.[lang] || id).filter(Boolean),
    [allowedTabIds, lang],
  );

  // Quick chips: prefer chips for the agent's allowed tabs, up to 6
  const chips = useMemo(() => {
    const picked = allowedTabIds
      .filter((id) => TAB_CHIPS[id])
      .slice(0, 6)
      .map((id) => TAB_CHIPS[id]);
    return picked.length ? picked : FALLBACK_CHIPS;
  }, [allowedTabIds]);

  // Welcome message tailored to the agent's role
  const welcomeText = useMemo(() => {
    if (!profile) {
      return lang === 'en'
        ? "👋 Hi! I'm your **Admin Assistant**. Ask me anything about how to use the system."
        : '👋 ¡Hola! Soy tu **Asistente de Admin**. Pregúntame lo que quieras sobre el sistema.';
    }
    const name = profile.full_name?.split(' ')[0] || (lang === 'en' ? 'there' : '');
    const greeting = lang === 'en'
      ? `👋 Hi${name ? ` ${name}` : ''}! I'm your **Admin Assistant**.`
      : `👋 ¡Hola${name ? ` ${name}` : ''}! Soy tu **Asistente de Admin**.`;

    if (isSuperAdmin) {
      return lang === 'en'
        ? `${greeting} As **Super Admin** you have access to the entire system. Ask me how to use any feature.`
        : `${greeting} Como **Super Admin** tienes acceso a todo el sistema. Pregúntame cómo usar cualquier función.`;
    }

    if (isSubUserProfile) {
      return lang === 'en'
        ? `${greeting} You have access to **My Earnings** and **My QR & Scans**. Ask me anything about those.`
        : `${greeting} Tienes acceso a **Mis Ganancias** y **Mi QR y Escaneos**. Pregúntame lo que necesites.`;
    }

    const tabList = allowedTabNames.slice(0, 8).join(', ');
    return lang === 'en'
      ? `${greeting} You have access to: **${tabList}**.\n\nAsk me how to use any of those sections, or pick a quick topic below.`
      : `${greeting} Tienes acceso a: **${tabList}**.\n\nPregúntame cómo usar cualquiera de esas secciones, o elige un tema rápido abajo.`;
  }, [profile, isSuperAdmin, isSubUserProfile, allowedTabNames, lang]);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: welcomeText }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pulsing, setPulsing] = useState(true);
  const [chipsVisible, setChipsVisible] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Update welcome message if profile loads after mount
  useEffect(() => {
    setMessages([{ role: 'assistant', text: welcomeText }]);
    setChipsVisible(true);
  }, [welcomeText]);

  useEffect(() => {
    const t = setTimeout(() => setPulsing(false), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function sendMessage(text) {
    const question = text.trim();
    if (!question || loading) return;

    setInput('');
    setChipsVisible(false);
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    try {
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'help_bot',
          prompt: question,
          context: {
            activeTab,
            allowedTabs: allowedTabIds,          // ← agent's actual permissions
            isSuperAdmin,
            isSubUser: isSubUserProfile,
          },
        }),
      });
      const data = await res.json();
      const reply = data?.text?.trim()
        || (lang === 'en'
          ? "Sorry, I couldn't find an answer. Please try rephrasing or contact the system owner."
          : 'Lo siento, no encontré una respuesta. Intenta reformular tu pregunta o contacta al administrador.');
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: lang === 'en'
            ? '⚠️ Connection error. Please check your internet and try again.'
            : '⚠️ Error de conexión. Verifica tu internet e inténtalo de nuevo.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      {/* ─── Floating trigger button ─── */}
      <button
        type="button"
        className={`ahb-trigger${pulsing ? ' ahb-trigger--pulse' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Open admin help assistant"
        title="Admin Help Assistant"
      >
        {open ? <ChevronDown size={20} /> : <Bot size={20} />}
        {!open && <span>{lang === 'en' ? 'Help' : 'Ayuda'}</span>}
      </button>

      {/* ─── Chat panel ─── */}
      {open && (
        <div className="ahb-panel" role="dialog" aria-label="Admin Help Assistant">
          {/* Header */}
          <div className="ahb-header">
            <div className="ahb-header-left">
              <div className="ahb-avatar"><Sparkles size={14} /></div>
              <div>
                <strong>{lang === 'en' ? 'Admin Assistant' : 'Asistente Admin'}</strong>
                <span>
                  {isSuperAdmin
                    ? (lang === 'en' ? 'Super Admin · Full access' : 'Super Admin · Acceso completo')
                    : isSubUserProfile
                      ? (lang === 'en' ? 'Sub-User · Limited access' : 'Sub-usuario · Acceso limitado')
                      : (lang === 'en' ? `${allowedTabIds.length} sections available` : `${allowedTabIds.length} secciones disponibles`)}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="ahb-close"
              onClick={() => setOpen(false)}
              aria-label="Close help assistant"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="ahb-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ahb-msg ahb-msg--${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="ahb-msg-avatar"><Bot size={12} /></div>
                )}
                <div
                  className="ahb-msg-bubble"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                />
              </div>
            ))}

            {/* Quick-start chips */}
            {chipsVisible && messages.length === 1 && (
              <div className="ahb-chips">
                {chips.map((chip) => (
                  <button
                    key={chip.en}
                    type="button"
                    className="ahb-chip"
                    onClick={() => sendMessage(chip[lang])}
                  >
                    {chip[lang]}
                  </button>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="ahb-msg ahb-msg--assistant">
                <div className="ahb-msg-avatar"><Bot size={12} /></div>
                <div className="ahb-msg-bubble ahb-typing">
                  <span /><span /><span />
                </div>
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
              placeholder={lang === 'en' ? 'Ask anything about the system…' : 'Pregunta lo que necesites…'}
              rows={1}
              disabled={loading}
            />
            <button
              type="button"
              className="ahb-send"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              {loading ? <Loader2 size={16} className="ahb-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ─── Scoped styles ─── */}
      <style>{`
        .ahb-trigger {
          position: fixed;
          bottom: 28px;
          right: 28px;
          z-index: 9000;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 12px 18px;
          background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
          color: #fff;
          border: none;
          border-radius: 50px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 24px rgba(124,58,237,0.45), 0 2px 8px rgba(0,0,0,0.4);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          letter-spacing: 0.01em;
        }
        .ahb-trigger:hover {
          transform: translateY(-2px) scale(1.04);
          box-shadow: 0 8px 32px rgba(124,58,237,0.6), 0 2px 8px rgba(0,0,0,0.4);
        }
        .ahb-trigger:active { transform: scale(0.97); }
        .ahb-trigger--pulse { animation: ahb-pulse 2s ease-in-out 3; }
        @keyframes ahb-pulse {
          0%, 100% { box-shadow: 0 4px 24px rgba(124,58,237,0.45); }
          50% { box-shadow: 0 4px 40px rgba(124,58,237,0.9), 0 0 0 8px rgba(124,58,237,0.15); }
        }

        .ahb-panel {
          position: fixed;
          bottom: 90px;
          right: 28px;
          z-index: 8999;
          width: 390px;
          max-width: calc(100vw - 40px);
          height: 530px;
          max-height: calc(100vh - 120px);
          display: flex;
          flex-direction: column;
          background: #0b132b;
          border: 1px solid rgba(124,58,237,0.35);
          border-radius: 20px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.1);
          animation: ahb-slide-up 0.22s cubic-bezier(0.34,1.56,0.64,1);
          overflow: hidden;
        }
        @keyframes ahb-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .ahb-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(79,70,229,0.15) 100%);
          border-bottom: 1px solid rgba(124,58,237,0.2);
          flex-shrink: 0;
        }
        .ahb-header-left { display: flex; align-items: center; gap: 10px; }
        .ahb-avatar {
          width: 32px; height: 32px; border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          display: flex; align-items: center; justify-content: center;
          color: #fff; flex-shrink: 0;
          box-shadow: 0 0 12px rgba(124,58,237,0.5);
        }
        .ahb-header-left > div:last-child { display: flex; flex-direction: column; gap: 1px; }
        .ahb-header strong { font-size: 0.88rem; color: #e2e8f0; font-weight: 700; display: block; }
        .ahb-header span { font-size: 0.7rem; color: #a78bfa; font-weight: 500; }
        .ahb-close {
          background: transparent; border: none; color: #64748b;
          cursor: pointer; padding: 4px; border-radius: 6px;
          display: flex; align-items: center;
          transition: color 0.15s, background 0.15s;
        }
        .ahb-close:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }

        .ahb-messages {
          flex: 1; overflow-y: auto;
          padding: 14px 14px 8px;
          display: flex; flex-direction: column; gap: 12px;
          scroll-behavior: smooth;
        }
        .ahb-messages::-webkit-scrollbar { width: 4px; }
        .ahb-messages::-webkit-scrollbar-track { background: transparent; }
        .ahb-messages::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.3); border-radius: 4px; }

        .ahb-msg { display: flex; align-items: flex-start; gap: 8px; max-width: 100%; }
        .ahb-msg--user { flex-direction: row-reverse; }
        .ahb-msg-avatar {
          width: 24px; height: 24px; border-radius: 50%;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          display: flex; align-items: center; justify-content: center;
          color: #fff; flex-shrink: 0; margin-top: 2px;
        }
        .ahb-msg-bubble {
          max-width: calc(100% - 36px);
          padding: 10px 13px; border-radius: 14px;
          font-size: 0.82rem; line-height: 1.55; color: #e2e8f0;
        }
        .ahb-msg--assistant .ahb-msg-bubble {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.06);
          border-top-left-radius: 4px;
        }
        .ahb-msg--user .ahb-msg-bubble {
          background: linear-gradient(135deg, rgba(124,58,237,0.35) 0%, rgba(79,70,229,0.25) 100%);
          border: 1px solid rgba(124,58,237,0.3);
          border-top-right-radius: 4px;
          text-align: right;
        }
        .ahb-msg-bubble strong { color: #a78bfa; font-weight: 700; }
        .ahb-step { display: flex; gap: 8px; align-items: baseline; margin: 3px 0; }
        .ahb-step span {
          min-width: 18px; height: 18px; border-radius: 50%;
          background: rgba(124,58,237,0.35); color: #a78bfa;
          font-size: 0.7rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .ahb-bullet { padding-left: 14px; position: relative; margin: 2px 0; }
        .ahb-bullet::before {
          content: ''; position: absolute; left: 4px; top: 7px;
          width: 4px; height: 4px; border-radius: 50%; background: #7c3aed;
        }
        .ahb-arrow { color: #a78bfa; font-weight: 700; margin: 0 2px; }

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
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1.15); opacity: 1; }
        }

        .ahb-chips { display: flex; flex-wrap: wrap; gap: 7px; padding: 2px 0 4px 32px; }
        .ahb-chip {
          padding: 5px 11px; border-radius: 20px;
          border: 1px solid rgba(124,58,237,0.4);
          background: rgba(124,58,237,0.1); color: #c4b5fd;
          font-size: 0.75rem; cursor: pointer;
          transition: background 0.15s, border-color 0.15s, transform 0.12s;
          line-height: 1.3; text-align: left;
        }
        .ahb-chip:hover {
          background: rgba(124,58,237,0.22); border-color: rgba(124,58,237,0.7);
          transform: translateY(-1px);
        }

        .ahb-input-row {
          display: flex; align-items: flex-end; gap: 8px;
          padding: 10px 12px 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
          background: rgba(6,11,19,0.6); flex-shrink: 0;
        }
        .ahb-input {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(124,58,237,0.25);
          border-radius: 12px; color: #e2e8f0;
          font-size: 0.83rem; padding: 10px 12px;
          resize: none; outline: none; font-family: inherit;
          line-height: 1.45; transition: border-color 0.18s;
          max-height: 100px; overflow-y: auto;
        }
        .ahb-input:focus {
          border-color: rgba(124,58,237,0.6);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
        }
        .ahb-input::placeholder { color: #475569; }
        .ahb-input:disabled { opacity: 0.5; }
        .ahb-send {
          width: 38px; height: 38px; border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          color: #fff; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
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
