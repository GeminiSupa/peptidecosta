'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, MessageCircle, RefreshCw, Search, Send, Sparkles, Paperclip } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Canned replies (Spanish-first) for one-tap common answers.
const QUICK_REPLIES = [
  { label: '👋 Saludo', text: '¡Hola! Gracias por escribirnos. ¿En qué le podemos ayudar?' },
  { label: '🛒 Catálogo', text: 'Puede ver nuestro catálogo completo aquí: https://catalog.peptidescostarica.net/catalog' },
  { label: '🚚 Envío', text: 'Realizamos envíos a todo Costa Rica por Correos de Costa Rica (1 a 3 días). Envío gratis en pedidos superiores a ₡30,000.' },
  { label: '💳 Pago', text: 'Aceptamos tarjeta, SINPE Móvil y PayPal. ¿Cómo prefiere pagar?' },
];

const POLL_MS = 30000;
const SEEN_KEY = 'messenger_inbox_seen';

function getInitials(name) {
  const words = String(name || 'Customer').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'C';
}

function formatConversationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Facebook injects a noisy auto-message when a thread comes from a post comment,
// e.g. "Estás respondiendo el comentario… Ver comentario(https://facebook.com/…)".
// Detect it so we can render a clean clickable link instead of the raw URL wall.
const COMMENT_NOTICE_RE = /(responding to (a|the)[^.]*comment|respondiendo[^.]*comentario|created this chat because|cre[oó] este chat porque|ha creado este chat|comment(ó|ed)\s)/i;

function isCommentNotice(text) {
  return COMMENT_NOTICE_RE.test(String(text || ''));
}

function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s)]+/);
  return m ? m[0] : null;
}

function cleanPreview(text) {
  if (isCommentNotice(text)) return '💬 Comment thread';
  return text;
}

function formatFullTimestamp(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatMessageDate(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function loadSeen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
}

// Merge two seen-maps, keeping the latest timestamp per conversation. Used to
// combine this browser's cache with the shared team state from the server.
function mergeSeen(a, b) {
  const out = { ...(a || {}) };
  for (const k in (b || {})) {
    if (!out[k] || new Date(b[k]) > new Date(out[k])) out[k] = b[k];
  }
  return out;
}

export default function MessengerInbox() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('dm'); // 'dm' | 'comment'
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [seenMap, setSeenMap] = useState({});
  const [profilePics, setProfilePics] = useState({}); // contactId -> photo url
  const [drafting, setDrafting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const messagesEndRef = useRef(null);
  const typingThrottleRef = useRef(null);

  useEffect(() => {
    // Instant from this browser's cache, then merge the shared team state.
    setSeenMap(loadSeen());
    fetch('/api/messenger/seen')
      .then((r) => r.json())
      .then((d) => { if (d && d.seen) setSeenMap((prev) => mergeSeen(prev, d.seen)); })
      .catch(() => {});
  }, []);

  const markSeen = useCallback((convId, ts) => {
    const at = ts || new Date().toISOString();
    setSeenMap((prev) => {
      const next = { ...prev, [convId]: at };
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    // Share with the rest of the team.
    fetch('/api/messenger/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: convId, at }),
    }).catch(() => {});
  }, []);

  const fetchInbox = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/messenger/inbox', { cache: 'no-store' });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setError('');
        setConversations(data.conversations || []);
        // Keep shared team read-state in sync on each poll.
        fetch('/api/messenger/seen')
          .then((r) => r.json())
          .then((d) => { if (d && d.seen) setSeenMap((prev) => mergeSeen(prev, d.seen)); })
          .catch(() => {});
      }
    } catch (e) {
      setError(e.message || 'Failed to load inbox');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
    const t = setInterval(() => fetchInbox(), POLL_MS);
    return () => clearInterval(t);
  }, [fetchInbox]);

  const hasUnread = useCallback((conv) => {
    if (!conv.lastInboundAt) return false;
    const seenAt = seenMap[conv.id];
    if (!seenAt) return true;
    return new Date(conv.lastInboundAt) > new Date(seenAt);
  }, [seenMap]);

  const counts = useMemo(() => ({
    dm: conversations.filter((c) => c.source !== 'comment').length,
    comment: conversations.filter((c) => c.source === 'comment').length,
  }), [conversations]);

  const filteredConvs = useMemo(() => {
    let list = conversations.filter((c) =>
      activeTab === 'comment' ? c.source === 'comment' : c.source !== 'comment'
    );
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        (c.contactName || '').toLowerCase().includes(q) ||
        (c.lastMessageText || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  }, [conversations, activeTab, search]);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  useEffect(() => {
    if (!activeConv) return;
    const t = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => cancelAnimationFrame(t);
  }, [activeConv, activeConv?.messages?.length]);

  // When a conversation opens: mark it seen on Facebook and fetch the real photo.
  const activeContactId = activeConv?.contactId;
  useEffect(() => {
    if (!activeContactId) return;
    fetch('/api/messenger/sender-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: activeContactId, action: 'mark_seen' }),
    }).catch(() => {});
    if (!profilePics[activeContactId]) {
      fetch(`/api/messenger/profile?psid=${activeContactId}`)
        .then((r) => r.json())
        .then((d) => { if (d.profilePic) setProfilePics((p) => ({ ...p, [activeContactId]: d.profilePic })); })
        .catch(() => {});
    }
  }, [activeContactId, profilePics]);

  // Show a typing indicator to the customer while an agent writes (throttled).
  const handleReplyChange = (e) => {
    setReplyText(e.target.value);
    if (!activeContactId || typingThrottleRef.current) return;
    fetch('/api/messenger/sender-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: activeContactId, action: 'typing_on' }),
    }).catch(() => {});
    typingThrottleRef.current = setTimeout(() => { typingThrottleRef.current = null; }, 4000);
  };

  const handleAiDraft = async () => {
    if (!activeConv || drafting) return;
    setDrafting(true);
    try {
      const res = await fetch('/api/messenger/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: activeConv.messages, contactName: activeConv.contactName }),
      });
      const data = await res.json();
      if (res.ok && data.success) setReplyText(data.text || '');
      else alert('AI draft failed: ' + (data.error || 'Unknown error'));
    } catch (e) {
      alert('AI draft error: ' + e.message);
    } finally {
      setDrafting(false);
    }
  };

  const handleImageUpload = async (file) => {
    if (!file || !activeConv || !activeConv.contactId) return;
    setUploadingImage(true);
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error('Storage not configured');
      const ext = file.name.split('.').pop();
      const fileName = `fb-attach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('whatsapp-media').upload(fileName, file);
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);

      const res = await fetch('/api/facebook/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: activeConv.contactId, imageUrl: publicUrl }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConv.id
              ? {
                  ...c,
                  messages: [...c.messages, {
                    id: `local-img-${Date.now()}`,
                    text: '',
                    imageUrl: publicUrl,
                    direction: 'outbound',
                    senderName: 'Page',
                    createdTime: new Date().toISOString(),
                    hasAttachment: true,
                  }],
                  lastMessageText: '[Photo]',
                  lastMessageAt: new Date().toISOString(),
                }
              : c
          )
        );
        setTimeout(() => fetchInbox(), 2500);
      } else {
        alert('Failed to send image: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Image upload failed: ' + e.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSend = async () => {
    const text = replyText.trim();
    if (!text || !activeConv || !activeConv.contactId) return;
    setSending(true);
    try {
      const res = await fetch('/api/facebook/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: activeConv.contactId, messageText: text }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Optimistically append; a refresh will reconcile with Graph
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConv.id
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    {
                      id: `local-${Date.now()}`,
                      text,
                      direction: 'outbound',
                      senderName: 'Page',
                      createdTime: new Date().toISOString(),
                      hasAttachment: false,
                    },
                  ],
                  lastMessageText: text,
                  lastMessageAt: new Date().toISOString(),
                }
              : c
          )
        );
        setReplyText('');
        setTimeout(() => fetchInbox(), 2500);
      } else {
        alert('Send failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Network error sending reply: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`admin-split-layout admin-whatsapp-inbox fb-messenger-skin${activeId ? ' admin-wa-chat-open' : ''}`}>
      {/* Facebook-blue reskin, scoped to this component only (WhatsApp inbox untouched) */}
      <style>{`
        .fb-messenger-skin .admin-wa-bubble--human {
          background: linear-gradient(135deg, #0a7cff, #0064e0) !important;
          color: #fff !important;
        }
        .fb-messenger-skin .admin-wa-bubble--human .admin-wa-bubble-sender,
        .fb-messenger-skin .admin-wa-bubble--human .admin-wa-bubble-time { color: rgba(255,255,255,0.85) !important; }
        .fb-messenger-skin .admin-wa-chat-avatar,
        .fb-messenger-skin .admin-wa-header-avatar,
        .fb-messenger-skin .admin-wa-message-avatar {
          background: linear-gradient(135deg, #0a7cff, #0064e0) !important;
          color: #fff !important;
          overflow: hidden;
        }
        .fb-messenger-skin .admin-wa-chat-item.active { border-left: 3px solid #0084ff !important; }
        .fb-messenger-skin .admin-wa-unread-dot { background: #0084ff !important; }
      `}</style>
      <div className="admin-wa-list-pane">
        <div className="admin-wa-conversations-panel">
          <div className="admin-wa-conversations-header">
            <span>Messenger Inbox</span>
            <button
              type="button"
              className="admin-wa-refresh-btn"
              onClick={() => fetchInbox(true)}
              title="Refresh"
              style={{ minWidth: '44px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <RefreshCw size={15} className={refreshing ? 'spinner' : ''} />
            </button>
          </div>

          {/* DMs / Comments tabs */}
          <div style={{ display: 'flex', gap: '8px', margin: '10px 12px 0' }}>
            {[
              { id: 'dm', label: '💬 DMs', count: counts.dm },
              { id: 'comment', label: '📝 Comments', count: counts.comment },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setActiveId(null); }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid ' + (activeTab === tab.id ? '#0ea5e9' : 'rgba(255,255,255,0.1)'),
                  background: activeTab === tab.id ? '#0ea5e9' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : '#94a3b8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                {tab.label}
                <span style={{
                  background: 'rgba(0,0,0,0.25)', borderRadius: '10px',
                  padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700,
                }}>{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="admin-wa-search-row" style={{ display: 'flex', gap: '8px', margin: '10px 12px' }}>
            <label className="admin-wa-search" style={{ margin: 0, flex: 1 }}>
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or message"
                aria-label="Search conversations"
              />
            </label>
          </div>

          <div className="admin-wa-conversations-scroll">
            {loading ? (
              <div className="admin-wa-state-msg">Loading conversations...</div>
            ) : error ? (
              <div className="admin-wa-state-msg admin-wa-state-msg--empty" style={{ color: '#f87171' }}>
                {error}
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="admin-wa-state-msg admin-wa-state-msg--empty">
                {search
                  ? 'No conversations match your search.'
                  : activeTab === 'comment'
                    ? 'No comment threads yet.'
                    : 'No direct messages yet.'}
              </div>
            ) : (
              filteredConvs.map((conv) => {
                const isActive = activeId === conv.id;
                const unread = hasUnread(conv);
                return (
                  <button
                    type="button"
                    key={conv.id}
                    className={`admin-wa-chat-item${isActive ? ' active' : ''}${unread ? ' admin-wa-chat-item--unread' : ''}`}
                    style={{ margin: 0, width: '100%' }}
                    onClick={() => {
                      setActiveId(conv.id);
                      markSeen(conv.id, conv.lastInboundAt);
                    }}
                  >
                    <span className="admin-wa-chat-avatar" aria-hidden>
                      {profilePics[conv.contactId]
                        ? <img src={profilePics[conv.contactId]} alt="" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} />
                        : getInitials(conv.contactName)}
                    </span>
                    <div className="admin-wa-chat-item-content">
                      <div className="admin-wa-chat-item-top">
                        <span className="admin-wa-chat-item-name">{conv.contactName}</span>
                        <span className="admin-wa-chat-item-time">{formatConversationTime(conv.lastMessageAt)}</span>
                      </div>
                      <div className="admin-wa-chat-item-bottom">
                        <span className="admin-wa-chat-item-preview">{cleanPreview(conv.lastMessageText) || '[Attachment]'}</span>
                        {unread && <span className="admin-wa-unread-dot" aria-label="New message" />}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="admin-wa-chat-pane">
        {activeConv ? (
          <>
            <div className="admin-wa-chat-header">
              <div className="admin-wa-chat-header-meta">
                <button
                  type="button"
                  className="admin-wa-back-btn"
                  onClick={() => setActiveId(null)}
                  aria-label="Back to conversations"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="admin-wa-chat-header-text">
                  <span className="admin-wa-chat-title-row">
                    <span className="admin-wa-header-avatar" aria-hidden>
                      {profilePics[activeConv.contactId]
                        ? <img src={profilePics[activeConv.contactId]} alt="" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} />
                        : getInitials(activeConv.contactName)}
                    </span>
                    <span>
                      <span className="admin-wa-chat-title">{activeConv.contactName}</span>
                      <span className="admin-wa-chat-phone">
                        {activeConv.source === 'comment' ? 'From a post comment' : 'Direct message'}
                      </span>
                    </span>
                  </span>
                </div>
              </div>
              <div className="admin-wa-chat-header-actions">
                <button type="button" className="admin-wa-refresh-btn" onClick={() => fetchInbox(true)}>
                  Refresh
                </button>
              </div>
            </div>

            <div className="admin-wa-messages">
              {activeConv.messages.map((msg, index) => {
                const isInbound = msg.direction === 'inbound';
                const prev = activeConv.messages[index - 1];
                const showDate = !prev ||
                  new Date(prev.createdTime).toDateString() !== new Date(msg.createdTime).toDateString();
                return (
                  <React.Fragment key={msg.id || index}>
                    {showDate && (
                      <div className="admin-wa-date-separator">
                        <span>{formatMessageDate(msg.createdTime)}</span>
                      </div>
                    )}
                    <div className={`admin-wa-message-row admin-wa-message-row--${isInbound ? 'inbound' : 'outbound'}`}>
                      {isInbound && (
                        <span className="admin-wa-message-avatar" aria-hidden>{getInitials(msg.senderName)}</span>
                      )}
                      <div className={`admin-wa-bubble admin-wa-bubble--${isInbound ? 'inbound' : 'human'}`}>
                        <span className="admin-wa-bubble-sender">{isInbound ? activeConv.contactName : 'You'}</span>
                        <div className="admin-wa-bubble-text">
                          {isCommentNotice(msg.text) ? (
                            (() => {
                              const url = extractUrl(msg.text);
                              return (
                                <span style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontStyle: 'italic', opacity: 0.85 }}>💬 This chat started from a post comment</span>
                                  {url && (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        marginTop: '2px', padding: '4px 10px', borderRadius: '6px',
                                        background: 'rgba(255,255,255,0.15)', color: '#fff',
                                        fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none',
                                        width: 'fit-content',
                                      }}
                                    >
                                      View comment on Facebook ↗
                                    </a>
                                  )}
                                </span>
                              );
                            })()
                          ) : msg.imageUrl ? (
                            <img
                              src={msg.imageUrl}
                              alt="Sent attachment"
                              style={{ maxWidth: '220px', width: '100%', borderRadius: '10px', display: 'block' }}
                            />
                          ) : (
                            msg.text || (msg.hasAttachment ? '📎 Attachment' : '')
                          )}
                        </div>
                        <div className="admin-wa-bubble-footer">
                          <span className="admin-wa-bubble-time">
                            {formatFullTimestamp(msg.createdTime)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} className="admin-wa-messages-anchor" aria-hidden />
            </div>

            <div className="admin-wa-composer">
              {activeConv.contactId && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {QUICK_REPLIES.map((qr) => (
                    <button
                      key={qr.label}
                      type="button"
                      onClick={() => setReplyText(qr.text)}
                      style={{
                        fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                        padding: '5px 10px', borderRadius: '999px',
                        border: '1px solid rgba(148,163,184,0.35)', background: 'transparent',
                        color: '#94a3b8', whiteSpace: 'nowrap',
                      }}
                      title={qr.text}
                    >
                      {qr.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="admin-wa-composer-row">
                <textarea
                  className="admin-wa-composer-input"
                  value={replyText}
                  onChange={handleReplyChange}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={activeConv.contactId ? 'Type a reply… (sends via Messenger)' : 'Cannot reply to this thread'}
                  rows={2}
                  enterKeyHint="send"
                  disabled={!activeConv.contactId}
                />
                <div className="admin-wa-composer-actions" style={{ display: 'flex', gap: '8px' }}>
                  <label
                    className="admin-wa-btn"
                    title="Send a photo"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      border: '1px solid rgba(148,163,184,0.4)', background: 'transparent',
                      color: uploadingImage ? '#64748b' : '#94a3b8',
                      cursor: activeConv.contactId && !uploadingImage ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <Paperclip size={15} aria-hidden />
                    {uploadingImage ? 'Sending…' : 'Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      disabled={!activeConv.contactId || uploadingImage}
                      onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); e.target.value = ''; }}
                    />
                  </label>
                  <button
                    type="button"
                    className="admin-wa-btn"
                    onClick={handleAiDraft}
                    disabled={drafting || !activeConv.contactId || !activeConv.messages?.length}
                    title="Draft a reply with AI"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      border: '1px solid #0084ff', background: 'transparent', color: '#3b9dff',
                    }}
                  >
                    <Sparkles size={15} aria-hidden />
                    {drafting ? 'Drafting…' : 'AI Draft'}
                  </button>
                  <button
                    type="button"
                    className="admin-wa-btn admin-wa-btn--send"
                    onClick={handleSend}
                    disabled={!replyText.trim() || sending || !activeConv.contactId}
                  >
                    <Send size={16} aria-hidden />
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="admin-wa-empty">
            <MessageCircle size={48} aria-hidden />
            <p>Select a conversation to view the transcript.</p>
          </div>
        )}
      </div>
    </div>
  );
}
