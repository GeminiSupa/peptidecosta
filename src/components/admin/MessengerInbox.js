'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, MessageCircle, RefreshCw, Search, Send } from 'lucide-react';

const POLL_MS = 20000;
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
  const messagesEndRef = useRef(null);

  useEffect(() => setSeenMap(loadSeen()), []);

  const markSeen = useCallback((convId, ts) => {
    setSeenMap((prev) => {
      const next = { ...prev, [convId]: ts || new Date().toISOString() };
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
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
    <div className={`admin-split-layout admin-whatsapp-inbox${activeId ? ' admin-wa-chat-open' : ''}`}>
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
                    <span className="admin-wa-chat-avatar" aria-hidden>{getInitials(conv.contactName)}</span>
                    <div className="admin-wa-chat-item-content">
                      <div className="admin-wa-chat-item-top">
                        <span className="admin-wa-chat-item-name">{conv.contactName}</span>
                        <span className="admin-wa-chat-item-time">{formatConversationTime(conv.lastMessageAt)}</span>
                      </div>
                      <div className="admin-wa-chat-item-bottom">
                        <span className="admin-wa-chat-item-preview">{conv.lastMessageText || '[Attachment]'}</span>
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
                    <span className="admin-wa-header-avatar" aria-hidden>{getInitials(activeConv.contactName)}</span>
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
                          {msg.text || (msg.hasAttachment ? '📎 Attachment' : '')}
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
              <div className="admin-wa-composer-row">
                <textarea
                  className="admin-wa-composer-input"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={activeConv.contactId ? 'Type a reply… (sends via Messenger)' : 'Cannot reply to this thread'}
                  rows={2}
                  enterKeyHint="send"
                  disabled={!activeConv.contactId}
                />
                <div className="admin-wa-composer-actions">
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
