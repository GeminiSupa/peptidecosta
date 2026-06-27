'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, ChevronLeft, ChevronRight, MessageCircle, Send } from 'lucide-react';

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
}) {
  const isMobile = useIsMobileWa();
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);

  const chatsList = useMemo(() => {
    const chatsMap = new Map();
    const chronological = [...whatsappMessages].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    chronological.forEach((m) => {
      chatsMap.set(m.wa_id, {
        waId: m.wa_id,
        displayName:
          m.display_name && m.display_name !== 'AI Copilot'
            ? m.display_name
            : `Customer ${m.wa_id.slice(-4)}`,
        lastMessageText: m.message_text,
        lastMessageAt: m.created_at,
        direction: m.direction,
      });
    });

    return Array.from(chatsMap.values()).sort(
      (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)
    );
  }, [whatsappMessages]);

  const activeChatMessages = useMemo(
    () =>
      whatsappMessages
        .filter((m) => m.wa_id === activeChatWaId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [whatsappMessages, activeChatWaId]
  );

  const currentChat = chatsList.find((c) => c.waId === activeChatWaId);

  useEffect(() => {
    document.body.classList.add('admin-wa-tab-active');
    return () => document.body.classList.remove('admin-wa-tab-active');
  }, []);

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
            <span className="admin-wa-conversations-count">{chatsList.length}</span>
          </div>

          <div className="admin-wa-conversations-scroll">
            {loadingWhatsappMessages ? (
              <div className="admin-wa-state-msg">Loading conversations...</div>
            ) : chatsList.length === 0 ? (
              <div className="admin-wa-state-msg admin-wa-state-msg--empty">
                No conversations yet. Incoming messages will appear here.
              </div>
            ) : (
              chatsList.map((chat) => {
                const isActive = activeChatWaId === chat.waId;
                const lastThreadMsg = whatsappMessages
                  .filter((m) => m.wa_id === chat.waId)
                  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                  .at(-1);
                const isAiLast =
                  lastThreadMsg?.direction === 'outbound' &&
                  lastThreadMsg?.display_name === 'AI Copilot';

                return (
                  <button
                    type="button"
                    key={chat.waId}
                    className={`admin-wa-chat-item${isActive ? ' active' : ''}`}
                    onClick={() => setActiveChatWaId(chat.waId)}
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
                      {isAiLast ? (
                        <span className="admin-wa-badge admin-wa-badge--ai">AI</span>
                      ) : chat.direction === 'outbound' ? (
                        <span className="admin-wa-badge admin-wa-badge--human">Human</span>
                      ) : (
                        <span className="admin-wa-unread-dot" aria-label="Unread" />
                      )}
                    </div>
                  </button>
                );
              })
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
                    <div className="admin-wa-bubble-text">{msg.message_text}</div>
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
