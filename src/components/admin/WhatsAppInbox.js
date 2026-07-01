'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, CheckCheck, ChevronLeft, ChevronRight, MessageCircle, Search, Send, Filter, X, Paperclip, Loader2 } from 'lucide-react';

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

function getInitials(name) {
  const words = String(name || 'Customer').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'C';
}

function formatConversationTime(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMessageDate(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
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

const WaChatItem = ({ chat, isActive, isUnread, onClick, onMarkUnread }) => {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(null);

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (startX.current === null) return;
    const diff = e.touches[0].clientX - startX.current;
    if (diff < 0) {
      setOffset(Math.max(-80, diff));
    } else {
      setOffset(0);
    }
  };

  const handleTouchEnd = () => {
    if (offset < -40) {
      setOffset(-80);
    } else {
      setOffset(0);
    }
    startX.current = null;
    setIsSwiping(false);
  };

  return (
    <div className="admin-wa-chat-item-shell">
      <div className="admin-wa-chat-swipe-action">
        <button 
          onClick={(e) => { e.stopPropagation(); onMarkUnread(); setOffset(0); }}
          aria-label={`Mark conversation with ${chat.displayName} as unread`}
        >
          Unread
        </button>
      </div>
      
      <button
        type="button"
        className={`admin-wa-chat-item${isActive ? ' active' : ''}${isUnread ? ' admin-wa-chat-item--unread' : ''}`}
        style={{ transform: `translateX(${offset}px)`, transition: isSwiping ? 'none' : 'transform 0.2s', margin: 0, width: '100%' }}
        onClick={() => { if (offset === 0) onClick(); else setOffset(0); }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <span className="admin-wa-chat-avatar" aria-hidden>{getInitials(chat.displayName)}</span>
        <div className="admin-wa-chat-item-content">
          <div className="admin-wa-chat-item-top">
            <span className="admin-wa-chat-item-name">{chat.displayName}</span>
            <span className="admin-wa-chat-item-time">{formatConversationTime(chat.lastMessageAt)}</span>
          </div>
          <div className="admin-wa-chat-item-bottom">
            <span className="admin-wa-chat-item-preview">{chat.lastMessageText || 'Photo'}</span>
            {chat.isAiLast ? (
              <span className="admin-wa-badge admin-wa-badge--ai">AI</span>
            ) : isUnread ? (
              <span className="admin-wa-unread-dot" aria-label="New message" />
            ) : chat.direction === 'outbound' ? (
              <CheckCheck size={14} className="admin-wa-chat-sent-icon" aria-label="Sent" />
            ) : null}
          </div>
        </div>
      </button>
    </div>
  );
};

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
  uploadingWaImage,
  handleWaImageUpload,
}) {
  const isMobile = useIsMobileWa();
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);
  const [chatSearch, setChatSearch] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [visibleChatCount, setVisibleChatCount] = useState(INITIAL_CHAT_LIMIT);

  // Pull-to-refresh state
  const scrollRef = useRef(null);
  const [pullDist, setPullDist] = useState(0);
  const pullStartY = useRef(null);

  const handleListTouchStart = (e) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  };

  const handleListTouchMove = (e) => {
    if (pullStartY.current !== null) {
      const diff = e.touches[0].clientY - pullStartY.current;
      if (diff > 0) {
        setPullDist(Math.min(diff, 60));
      } else {
        setPullDist(0);
      }
    }
  };

  const handleListTouchEnd = () => {
    if (pullDist >= 50) {
      if (loadAdminData) loadAdminData();
    }
    setPullDist(0);
    pullStartY.current = null;
  };

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
  const hasUnread = useCallback((chat) => {
    if (!chat.lastInboundAt) return false;
    const seenAt = seenMap[chat.waId];
    if (!seenAt) return true;
    return new Date(chat.lastInboundAt) > new Date(seenAt);
  }, [seenMap]);

  const unreadCount = useMemo(
    () => chatsList.filter(hasUnread).length,
    [chatsList, hasUnread]
  );

  const filteredChats = useMemo(() => {
    let result = chatsList;
    if (showUnreadOnly) {
      result = result.filter(hasUnread);
    }
    const query = chatSearch.trim().toLowerCase();
    if (query) {
      const digits = normalizePhone(query);
      result = result.filter((chat) =>
        chat.displayName.toLowerCase().includes(query) ||
        chat.lastMessageText?.toLowerCase().includes(query) ||
        (digits && chat.waId.includes(digits))
      );
    }
    return result;
  }, [chatSearch, chatsList, hasUnread, showUnreadOnly]);

  const visibleChats = filteredChats.slice(0, visibleChatCount);

  const activeChatMessages = useMemo(
    () =>
      whatsappMessages
        .filter((m) => normalizePhone(m.wa_id) === activeChatWaId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [whatsappMessages, activeChatWaId]
  );

  const displayChatMessages = useMemo(() => {
    const query = messageSearch.trim().toLowerCase();
    if (!query) return activeChatMessages;
    return activeChatMessages.filter(m => 
      m.message_text?.toLowerCase().includes(query) || 
      m.display_name?.toLowerCase().includes(query)
    );
  }, [activeChatMessages, messageSearch]);

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

          <div className="admin-wa-search-row" style={{ display: 'flex', gap: '8px', margin: '10px 12px' }}>
            <label className="admin-wa-search" style={{ margin: 0, flex: 1 }}>
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={chatSearch}
                onChange={(event) => {
                  setChatSearch(event.target.value);
                  setVisibleChatCount(INITIAL_CHAT_LIMIT);
                }}
                placeholder="Search name, phone, or message"
                aria-label="Search WhatsApp conversations"
              />
            </label>
            <button 
              type="button"
              className="admin-wa-refresh-btn"
              style={{ 
                background: showUnreadOnly ? '#10b981' : 'transparent', 
                color: showUnreadOnly ? 'white' : '#94a3b8', 
                borderColor: showUnreadOnly ? '#10b981' : 'rgba(255,255,255,0.1)',
                minWidth: '44px',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              title="Show unread only"
            >
              <Filter size={16} />
            </button>
          </div>

          <div 
            className="admin-wa-conversations-scroll" 
            ref={scrollRef}
            onTouchStart={handleListTouchStart}
            onTouchMove={handleListTouchMove}
            onTouchEnd={handleListTouchEnd}
            style={{ position: 'relative' }}
          >
            {pullDist > 0 && (
              <div style={{ height: `${pullDist}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.75rem', transition: 'height 0s' }}>
                {pullDist >= 50 ? 'Release to refresh' : 'Pull to refresh'}
              </div>
            )}
            
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
                    <WaChatItem
                      key={chat.waId}
                      chat={chat}
                      isActive={isActive}
                      isUnread={chatIsUnread}
                      onClick={() => {
                        setActiveChatWaId(chat.waId);
                        if (markSeen) markSeen(chat.waId, chat.lastInboundAt);
                      }}
                      onMarkUnread={() => {
                        if (markSeen) markSeen(chat.waId, new Date(0).toISOString()); // Resets seen state
                      }}
                    />
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
                  <span className="admin-wa-chat-title-row">
                    <span className="admin-wa-header-avatar" aria-hidden>
                      {getInitials(currentChat?.displayName || activeChatWaId)}
                    </span>
                    <span>
                      <span className="admin-wa-chat-title">
                        {currentChat?.displayName || activeChatWaId}
                      </span>
                      <span className="admin-wa-chat-phone">+{activeChatWaId}</span>
                    </span>
                  </span>
                </div>
              </div>

              <div className="admin-wa-chat-header-actions">
                <button 
                  type="button" 
                  className="admin-wa-refresh-btn" 
                  onClick={() => {
                    setShowMessageSearch(!showMessageSearch);
                    if (showMessageSearch) setMessageSearch('');
                  }} 
                  style={{ minWidth: '44px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Search in conversation"
                >
                  <Search size={16} />
                </button>
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

            {showMessageSearch && (
              <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Search size={14} color="#64748b" />
                <input 
                  type="search"
                  value={messageSearch}
                  onChange={e => setMessageSearch(e.target.value)}
                  placeholder="Search in this conversation..."
                  style={{ flex: 1, background: '#0a1120', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', outline: 'none' }}
                  autoFocus
                />
                <button 
                  type="button" 
                  onClick={() => {
                    setShowMessageSearch(false);
                    setMessageSearch('');
                  }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="admin-wa-messages">
              {displayChatMessages.map((msg, index) => {
                const isInbound = msg.direction === 'inbound';
                const isAi = msg.display_name === 'AI Copilot';
                const previousMessage = displayChatMessages[index - 1];
                const showDateSeparator = !previousMessage ||
                  new Date(previousMessage.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                const senderName = isInbound
                  ? msg.display_name || currentChat?.displayName || 'Customer'
                  : isAi
                    ? 'AI Copilot'
                    : 'Administrator';

                return (
                  <React.Fragment key={msg.id || index}>
                    {showDateSeparator && (
                      <div className="admin-wa-date-separator">
                        <span>{formatMessageDate(msg.created_at)}</span>
                      </div>
                    )}
                    <div className={`admin-wa-message-row admin-wa-message-row--${isInbound ? 'inbound' : 'outbound'}`}>
                      {isInbound && (
                        <span className="admin-wa-message-avatar" aria-hidden>{getInitials(senderName)}</span>
                      )}
                      <div
                        className={`admin-wa-bubble admin-wa-bubble--${
                          isInbound ? 'inbound' : isAi ? 'ai' : 'human'
                        }`}
                      >
                        <span className="admin-wa-bubble-sender">{senderName}</span>
                        <div className="admin-wa-bubble-text">
                          {msg.media_url && (
                            <div className="admin-wa-media">
                              {msg.media_url.endsWith('.pdf') ? (
                                <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="admin-wa-document-link">
                                  View document (PDF)
                                </a>
                              ) : (
                                <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                                  {/* WhatsApp media hosts are dynamic and cannot be safely allowlisted for next/image. */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={msg.media_url}
                                    alt="Attachment"
                                    className="admin-wa-media-image"
                                  />
                                </a>
                              )}
                            </div>
                          )}
                          {msg.message_text}
                        </div>
                        <div className="admin-wa-bubble-footer">
                          <span className="admin-wa-bubble-time">
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {!isInbound && msg.delivery_status && (
                            <span className={`admin-wa-delivery admin-wa-delivery--${msg.delivery_status}`} aria-label={`Message ${msg.delivery_status}`}>
                              {msg.delivery_status === 'read' || msg.delivery_status === 'delivered'
                                ? <CheckCheck size={14} aria-hidden />
                                : <Check size={14} aria-hidden />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} className="admin-wa-messages-anchor" aria-hidden />
            </div>

            <div className="admin-wa-composer" ref={composerRef}>
              <div className="admin-wa-quick-replies" aria-label="Quick replies">
                <span className="admin-wa-quick-label">Quick replies</span>
                <button type="button" onClick={() => setChatInputText(prev => prev + (prev ? ' ' : '') + 'Hello! How can I help you today?')}>Hello 👋</button>
                <button type="button" onClick={() => setChatInputText(prev => prev + (prev ? ' ' : '') + 'Here is our full catalog and price list: https://peptidescostarica.net/')}>Price list</button>
                <button type="button" onClick={() => setChatInputText(prev => prev + (prev ? ' ' : '') + 'We offer fast local delivery in Costa Rica!')}>Delivery</button>
              </div>

              <div className="admin-wa-composer-row">
                <label className="admin-wa-attach-btn" title="Attach an image">
                  {uploadingWaImage ? <Loader2 size={20} className="spinner" color="#94a3b8" /> : <Paperclip size={20} color="#94a3b8" />}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { if(handleWaImageUpload) handleWaImageUpload(e.target.files[0]); }} disabled={uploadingWaImage} />
                </label>
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
                    onClick={() => handleSendLiveWhatsappMessage()}
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
