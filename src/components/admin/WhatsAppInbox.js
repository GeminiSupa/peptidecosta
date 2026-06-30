'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, ChevronLeft, ChevronRight, MessageCircle, Search, Send } from 'lucide-react';

const INITIAL_CHAT_LIMIT = 30;
const GENERIC_CONTACT_NAMES = new Set([
  'administrator',
  'ai copilot',
  'catalog lead',
  'customer',
  'peptides costa rica',
  'peptides customer',
]);

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanContactName(value) {
  const name = String(value || '').trim();
  if (!name || ['null', 'undefined', 'n/a', 'unknown'].includes(name.toLowerCase())) return '';
  if (GENERIC_CONTACT_NAMES.has(name.toLowerCase())) return '';
  return name;
}

function addContactName(map, phone, name) {
  const digits = normalizePhone(phone);
  const cleanName = cleanContactName(name);
  if (!digits || !cleanName) return;
  map.set(digits, cleanName);
  if (digits.length >= 8) map.set(digits.slice(-8), cleanName);
}

function useIsMobileWa() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export default function WhatsAppInbox({
  whatsappMessages,
  orders = [],
  leads = [],
  abandonedCarts = [],
  loadingWhatsappMessages,
  whatsappSettings,
  setWhatsappSettings,
  handleSaveWhatsappSettings,
  savingWaSettings,
  activeChatWaId,
  setActiveChatWaId,
  chatInputText,
  setChatInputText,
  handleSendLiveWhatsappMessage,
  handleDraftAiChatReply,
  draftingAiReply,
  loadAdminData,
  seenMap = {},
  markSeen,
}) {
  const isMobile = useIsMobileWa();
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);
  const [chatSearch, setChatSearch] = useState('');
  const [visibleChatCount, setVisibleChatCount] = useState(INITIAL_CHAT_LIMIT);

  const contactNamesByPhone = useMemo(() => {
    const names = new Map();

    [...leads]
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      .forEach((lead) => addContactName(
        names,
        lead.whatsapp_wa_id || lead.customer_phone || lead.phone || lead.contact_value,
        lead.customer_name || lead.name
      ));
    [...abandonedCarts]
      .sort((a, b) => new Date(a.last_updated || a.created_at || 0) - new Date(b.last_updated || b.created_at || 0))
      .forEach((cart) => addContactName(names, cart.customer_phone, cart.customer_name));
    [...orders]
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      .forEach((order) => addContactName(
        names,
        order.whatsapp_wa_id || order.customer_phone,
        order.customer_name
      ));

    return names;
  }, [abandonedCarts, leads, orders]);

  const chatsList = useMemo(() => {
    const chatsMap = new Map();
    const chronological = [...whatsappMessages].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    chronological.forEach((m) => {
      const waId = normalizePhone(m.wa_id);
      if (!waId) return;
      const existing = chatsMap.get(waId);
      const messageName = cleanContactName(m.display_name);
      const inboundName = m.direction === 'inbound' ? messageName : existing?.inboundName;
      const crmName = contactNamesByPhone.get(waId) || contactNamesByPhone.get(waId.slice(-8));
      // Track the most-recent inbound message timestamp per chat
      const lastInboundAt = m.direction === 'inbound'
        ? m.created_at
        : (existing?.lastInboundAt || null);

      chatsMap.set(waId, {
        waId,
        displayName: crmName || inboundName || existing?.displayName || messageName || `Customer ${waId.slice(-4)}`,
        inboundName,
        lastMessageText: m.message_text,
        lastMessageAt: m.created_at,
        lastInboundAt,
        direction: m.direction,
        isAiLast: m.direction === 'outbound' && m.display_name === 'AI Copilot',
      });
    });

    return Array.from(chatsMap.values()).sort(
      (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
    );
  }, [contactNamesByPhone, whatsappMessages]);

  // A chat has "unseen" inbound messages when lastInboundAt > the timestamp stored in seenMap
  const hasUnread = (chat) => {
    if (!chat.lastInboundAt) return false;
    const seenAt = seenMap[chat.waId];
    if (!seenAt) return true;
    return new Date(chat.lastInboundAt) > new Date(seenAt);
  };

  const unreadCount = useMemo(
    () => chatsList.filter(hasUnread).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatsList, seenMap]
  );

  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return chatsList;
    const digits = normalizePhone(query);
    return chatsList.filter((chat) =>
      chat.displayName.toLowerCase().includes(query) ||
      chat.lastMessageText?.toLowerCase().includes(query) ||
      (digits && chat.waId.includes(digits))
    );
  }, [chatSearch, chatsList]);

  const visibleChats = filteredChats.slice(0, visibleChatCount);

  const activeChatMessages = useMemo(
    () =>
      whatsappMessages
        .filter((m) => normalizePhone(m.wa_id) === activeChatWaId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [whatsappMessages, activeChatWaId]
  );

  const currentChat = chatsList.find((c) => c.waId === activeChatWaId);

  useEffect(() => {
    document.body.classList.add('admin-wa-tab-active');
    return () => document.body.classList.remove('admin-wa-tab-active');
  }, []);

  useEffect(() => {
    const isOpen = Boolean(isMobile && activeChatWaId);
    document.body.classList.toggle('admin-wa-conversation-open', isOpen);
    return () => document.body.classList.remove('admin-wa-conversation-open');
  }, [activeChatWaId, isMobile]);

  useEffect(() => {
    setVisibleChatCount(INITIAL_CHAT_LIMIT);
  }, [chatSearch]);

  useEffect(() => {
    if (!activeChatWaId) return;
    const t = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => cancelAnimationFrame(t);
  }, [activeChatWaId, activeChatMessages.length]);

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendLiveWhatsappMessage();
    }
  };

  return (
    <div
      className={`admin-split-layout admin-whatsapp-inbox${
        activeChatWaId ? ' admin-wa-chat-open' : ''
      }`}
    >
      <div className="admin-wa-list-pane">
        <details className="admin-wa-settings-collapse" open={!isMobile}>
          <summary className="admin-wa-settings-summary">
            <span className="admin-wa-settings-summary-label">
              <Brain size={16} aria-hidden />
              AI Autopilot
              {whatsappSettings.ai_auto_reply && (
                <span className="admin-wa-autopilot-pill">On</span>
              )}
            </span>
            <ChevronRight size={16} className="admin-wa-settings-chevron" aria-hidden />
          </summary>

          <div className="admin-wa-settings-body">
            <div className="admin-wa-settings-row">
              <span className="admin-wa-settings-title">
                <Brain size={16} aria-hidden />
                AI Copilot Autopilot
              </span>
              <label className="admin-wa-toggle">
                <input
                  type="checkbox"
                  checked={whatsappSettings.ai_auto_reply}
                  onChange={(e) =>
                    handleSaveWhatsappSettings({
                      ...whatsappSettings,
                      ai_auto_reply: e.target.checked,
                    })
                  }
                />
                <span className="admin-wa-toggle-track" aria-hidden />
              </label>
            </div>

            <p className="admin-wa-settings-desc">
              When active, Gemini instantly drafts and replies to all incoming WhatsApp customer
              messages automatically.
            </p>

            <details className="admin-wa-prompt-collapse">
              <summary className="admin-wa-prompt-summary">Edit AI System Prompt</summary>
              <div className="admin-wa-prompt-body">
                <textarea
                  className="admin-wa-prompt-input"
                  value={whatsappSettings.ai_system_prompt}
                  onChange={(e) =>
                    setWhatsappSettings({
                      ...whatsappSettings,
                      ai_system_prompt: e.target.value,
                    })
                  }
                />
                <button
                  type="button"
                  className="admin-wa-save-btn"
                  onClick={() => handleSaveWhatsappSettings(whatsappSettings)}
                  disabled={savingWaSettings}
                >
                  {savingWaSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </details>
          </div>
        </details>

        <div className="admin-wa-conversations-panel">
          <div className="admin-wa-conversations-header">
            <span>Active WhatsApp Chats</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unreadCount > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: '800',
                  borderRadius: '999px',
                  padding: '2px 7px',
                  lineHeight: '1.4',
                  minWidth: '20px',
                  textAlign: 'center',
                }}>
                  {unreadCount} new
                </span>
              )}
              <span className="admin-wa-conversations-count">{chatsList.length}</span>
            </div>
          </div>

          <label className="admin-wa-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={chatSearch}
              onChange={(event) => setChatSearch(event.target.value)}
              placeholder="Search name, phone, or message"
              aria-label="Search WhatsApp conversations"
            />
          </label>

          <div className="admin-wa-conversations-scroll">
            {loadingWhatsappMessages ? (
              <div className="admin-wa-state-msg">Loading conversations...</div>
            ) : filteredChats.length === 0 ? (
              <div className="admin-wa-state-msg admin-wa-state-msg--empty">
                {chatSearch
                  ? 'No conversations match your search.'
                  : 'No conversations yet. Incoming messages will appear here.'}
              </div>
            ) : (
              <>
                {visibleChats.map((chat) => {
                  const isActive = activeChatWaId === chat.waId;
                  const chatIsUnread = hasUnread(chat);

                  return (
                    <button
                      type="button"
                      key={chat.waId}
                      className={`admin-wa-chat-item${isActive ? ' active' : ''}${chatIsUnread ? ' admin-wa-chat-item--unread' : ''}`}
                      onClick={() => {
                        setActiveChatWaId(chat.waId);
                        if (markSeen) markSeen(chat.waId, chat.lastInboundAt);
                      }}
                    >
                      <div className="admin-wa-chat-item-top">
                        <span className="admin-wa-chat-item-name">{chat.displayName}</span>
                        <span className="admin-wa-chat-item-time">
                          {new Date(chat.lastMessageAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="admin-wa-chat-item-bottom">
                        <span className="admin-wa-chat-item-preview">{chat.lastMessageText}</span>
                        {chat.isAiLast ? (
                          <span className="admin-wa-badge admin-wa-badge--ai">AI</span>
                        ) : chatIsUnread ? (
                          <span className="admin-wa-unread-dot" aria-label="New message" />
                        ) : chat.direction === 'outbound' ? (
                          <span className="admin-wa-badge admin-wa-badge--human">Human</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
                {visibleChats.length < filteredChats.length && (
                  <button
                    type="button"
                    className="admin-wa-load-more"
                    onClick={() => setVisibleChatCount((count) => count + INITIAL_CHAT_LIMIT)}
                  >
                    Load more conversations
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="admin-wa-chat-pane">
        {activeChatWaId ? (
          <>
            <div className="admin-wa-chat-header">
              <div className="admin-wa-chat-header-meta">
                <button
                  type="button"
                  className="admin-wa-back-btn"
                  onClick={() => setActiveChatWaId(null)}
                  aria-label="Back to conversations"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="admin-wa-chat-header-text">
                  <span className="admin-wa-chat-title">
                    {currentChat?.displayName || activeChatWaId}
                  </span>
                  <span className="admin-wa-chat-phone">+{activeChatWaId}</span>
                </div>
              </div>

              <div className="admin-wa-chat-header-actions">
                {whatsappSettings.ai_auto_reply && (
                  <span className="admin-wa-autopilot-badge">
                    <span className="admin-wa-autopilot-dot" aria-hidden />
                    <span className="admin-wa-autopilot-badge-long">AI Autopilot Active</span>
                    <span className="admin-wa-autopilot-badge-short">AI On</span>
                  </span>
                )}
                <button type="button" className="admin-wa-refresh-btn" onClick={loadAdminData}>
                  Refresh
                </button>
              </div>
            </div>

            <div className="admin-wa-messages">
              {activeChatMessages.map((msg, index) => {
                const isInbound = msg.direction === 'inbound';
                const isAi = msg.display_name === 'AI Copilot';

                return (
                  <div
                    key={msg.id || index}
                    className={`admin-wa-bubble admin-wa-bubble--${
                      isInbound ? 'inbound' : isAi ? 'ai' : 'human'
                    }`}
                  >
                    <div className="admin-wa-bubble-meta">
                      <span className="admin-wa-bubble-sender">
                        {isInbound
                          ? msg.display_name || 'Customer'
                          : isAi
                            ? 'AI Copilot'
                            : 'Administrator'}
                      </span>
                      <span className="admin-wa-bubble-time">
                        {!isInbound && msg.delivery_status && (
                          <span className="admin-wa-delivery">
                            {msg.delivery_status === 'read'
                              ? '✅✅'
                              : msg.delivery_status === 'delivered'
                                ? '✔️✔️'
                                : '✔️'}
                          </span>
                        )}
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="admin-wa-bubble-text">
                      {msg.media_url && (
                        <div style={{ marginBottom: '8px' }}>
                          {msg.media_url.endsWith('.pdf') ? (
                            <a href={msg.media_url} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>
                              📄 View Document (PDF)
                            </a>
                          ) : (
                            <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                              <img 
                                src={msg.media_url} 
                                alt="Attachment" 
                                style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', cursor: 'zoom-in' }} 
                              />
                            </a>
                          )}
                        </div>
                      )}
                      {msg.message_text}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="admin-wa-messages-anchor" aria-hidden />
            </div>

            <div className="admin-wa-composer" ref={composerRef}>
              <div className="admin-wa-composer-row">
                <textarea
                  className="admin-wa-composer-input"
                  value={chatInputText}
                  onChange={(e) => setChatInputText(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Type a message or tap AI Draft..."
                  rows={2}
                  enterKeyHint="send"
                />
                <div className="admin-wa-composer-actions">
                  <button
                    type="button"
                    className="admin-wa-btn admin-wa-btn--send"
                    onClick={handleSendLiveWhatsappMessage}
                    disabled={!chatInputText.trim()}
                  >
                    <Send size={16} aria-hidden />
                    Send
                  </button>
                  <button
                    type="button"
                    className="admin-wa-btn admin-wa-btn--draft"
                    onClick={() => handleDraftAiChatReply(activeChatWaId)}
                    disabled={draftingAiReply}
                  >
                    {draftingAiReply ? 'Drafting...' : 'AI Draft'}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="admin-wa-empty">
            <MessageCircle size={48} aria-hidden />
            <p>Select a conversation to start messaging.</p>
          </div>
        )}
      </div>
    </div>
  );
}
