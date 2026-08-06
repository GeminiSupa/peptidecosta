'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Bot, CheckCircle2, ChevronLeft, Circle, Clock3, ExternalLink, FileText, Inbox, Loader2, MessageCircle, RefreshCw, Search, Send, Target, UserCheck, UserPlus, XCircle } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { renderLiveChatMessage as messageText } from '@/lib/liveChat';

const POLL_MS = 15000;

const QUICK_REPLIES = [
  'Hola, gracias por escribirnos. ¿En qué le podemos ayudar?',
  'Puede ver el catálogo actualizado aquí: https://catalog.peptidescostarica.net/catalog',
  'Con gusto. ¿Me confirma su nombre y el producto que está revisando?',
  'Gracias. Un agente revisará su consulta y le responderá por aquí.',
];

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function initials(name) {
  return String(name || 'Visitor')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'V';
}

function statusLabel(status) {
  if (status === 'resolved') return 'Resolved';
  if (status === 'pending') return 'Pending';
  return 'Open';
}

function priorityColor(priority) {
  if (priority === 'high') return '#f97316';
  if (priority === 'low') return '#38bdf8';
  return '#a3e635';
}

function visibleMessagesFor(conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  if (messages.length > 0) return messages;
  if (!messageText(conversation?.lastMessage)) return [];
  return [{
    id: `${conversation.id || 'conversation'}-last-message`,
    senderType: conversation.lastAgentMessageAt && !conversation.lastCustomerMessageAt ? 'agent' : 'visitor',
    senderName: conversation.visitorName || 'Visitor',
    message: conversation.lastMessage,
    attachments: [],
    createdAt: conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt,
    fallback: true,
  }];
}

// Matches the breakpoint where the dashboard swaps to the fixed bottom tab bar,
// so the inbox and the chrome around it never disagree about the layout.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isMobile;
}

function playAlertTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 740;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.14);
  } catch {}
}

export default function LiveChatInbox() {
  const [conversations, setConversations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [leadSaving, setLeadSaving] = useState(false);
  // Drafts are keyed by conversation so switching threads mid-sentence cannot
  // send text meant for one visitor to another.
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const previousUnreadIdsRef = useRef(new Set());
  const isMobile = useIsMobile();

  const fetchInbox = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await adminFetch('/api/admin/live-chat', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load live chat');
      setConversations(data.conversations || []);
      setAgents(data.agents || []);
      setCurrentAgent(data.currentAgent || null);
      setError('');
      setActiveId((current) => current || data.conversations?.[0]?.id || null);
    } catch (err) {
      setError(err.message || 'Could not load live chat');
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
    
    let channel;
    if (isSupabaseConfigured && supabase) {
      channel = supabase
        .channel('admin-live-chat-inbox')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_chat_conversations' }, () => {
          fetchInbox(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_chat_messages' }, () => {
          fetchInbox(true);
        })
        .subscribe();
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchInbox]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setAlertsEnabled(true);
    }
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) || null,
    [conversations, activeId]
  );

  const reply = drafts[activeId] || '';
  const setReply = useCallback((value) => {
    setDrafts((prev) => ({ ...prev, [activeId]: value }));
  }, [activeId]);

  const counts = useMemo(() => ({
    open: conversations.filter((conversation) => conversation.status === 'open').length,
    pending: conversations.filter((conversation) => conversation.status === 'pending').length,
    unread: conversations.filter((conversation) => conversation.unreadForAgent).length,
    resolved: conversations.filter((conversation) => conversation.status === 'resolved').length,
    leadReady: conversations.filter((conversation) => conversation.leadContext?.status === 'ready').length,
    mine: conversations.filter((conversation) => conversation.assignedTo === currentAgent?.userId).length,
    unassigned: conversations.filter((conversation) => !conversation.assignedTo).length,
  }), [conversations, currentAgent?.userId]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations
      .filter((conversation) => {
        if (statusFilter === 'active' && conversation.status === 'resolved') return false;
        if (statusFilter !== 'active' && statusFilter !== 'all' && conversation.status !== statusFilter) return false;
        if (ownerFilter === 'mine' && conversation.assignedTo !== currentAgent?.userId) return false;
        if (ownerFilter === 'unassigned' && conversation.assignedTo) return false;
        if (!q) return true;
        return [
          conversation.visitorName,
          conversation.visitorEmail,
          conversation.visitorPhone,
          conversation.lastMessage,
          conversation.pageUrl,
        ].some((value) => String(value || '').toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.unreadForAgent !== b.unreadForAgent) return a.unreadForAgent ? -1 : 1;
        return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
      });
  }, [conversations, currentAgent?.userId, ownerFilter, search, statusFilter]);

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setActiveId(null);
      return;
    }
    if (!filteredConversations.some((conversation) => conversation.id === activeId)) {
      setActiveId(filteredConversations[0].id);
    }
  }, [activeId, filteredConversations]);

  useEffect(() => {
    const unreadIds = new Set(conversations.filter((conversation) => conversation.unreadForAgent).map((conversation) => conversation.id));
    const newUnread = [...unreadIds].filter((id) => !previousUnreadIdsRef.current.has(id));
    previousUnreadIdsRef.current = unreadIds;
    if (!alertsEnabled || newUnread.length === 0) return;

    const newest = conversations.find((conversation) => newUnread.includes(conversation.id));
    if (!newest) return;
    playAlertTone();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('New website chat', {
        body: `${newest.visitorName}: ${messageText(newest.lastMessage) || 'New message'}`.slice(0, 120),
      });
    }
  }, [alertsEnabled, conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeId, activeConversation?.messages?.length]);

  // Same treatment the WhatsApp inbox gets: an open thread takes the whole
  // screen, otherwise the composer hides behind the fixed bottom tab bar.
  useEffect(() => {
    const threadOpen = isMobile && mobileThreadOpen;
    document.body.classList.toggle('admin-live-chat-thread-open', threadOpen);
    return () => document.body.classList.remove('admin-live-chat-thread-open');
  }, [isMobile, mobileThreadOpen]);

  useEffect(() => {
    if (!activeConversation?.unreadForAgent) return;
    adminFetch('/api/admin/live-chat', {
      method: 'PATCH',
      body: JSON.stringify({ conversationId: activeConversation.id, action: 'mark_seen' }),
    }).then((response) => response.json())
      .then((data) => {
        if (data.conversation) {
          setConversations((prev) => prev.map((conversation) => (
            conversation.id === data.conversation.id ? data.conversation : conversation
          )));
        }
      })
      .catch(() => {});
  }, [activeConversation?.id, activeConversation?.unreadForAgent]);

  const patchConversation = async (payload) => {
    if (!activeConversation) return;
    try {
      const response = await adminFetch('/api/admin/live-chat', {
        method: 'PATCH',
        body: JSON.stringify({ conversationId: activeConversation.id, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Update failed');
      setConversations((prev) => prev.map((conversation) => (
        conversation.id === data.conversation.id ? data.conversation : conversation
      )));
      setError('');
    } catch (err) {
      setError(err.message || 'Update failed');
    }
  };

  const sendReply = async () => {
    if (!activeConversation || !reply.trim() || sending) return;
    const conversationId = activeConversation.id;
    const text = reply.trim();
    setSending(true);
    setDrafts((prev) => ({ ...prev, [conversationId]: '' }));
    try {
      const response = await adminFetch('/api/admin/live-chat', {
        method: 'POST',
        body: JSON.stringify({ conversationId, message: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Send failed');
      setConversations((prev) => prev.map((conversation) => (
        conversation.id === data.conversation.id ? data.conversation : conversation
      )));
      setError('');
    } catch (err) {
      setDrafts((prev) => ({ ...prev, [conversationId]: text }));
      setError(err.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const enableAlerts = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setAlertsEnabled(permission === 'granted');
    } else {
      setAlertsEnabled(true);
    }
    playAlertTone();
  };

  const draftAiReply = async () => {
    if (!activeConversation || drafting) return;
    setDrafting(true);
    try {
      const response = await adminFetch('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'draft_live_chat_reply',
          context: {
            visitorName: activeConversation.visitorName,
            messages: activeConversation.messages,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'AI draft failed');
      setReply(data.text || '');
      setError('');
    } catch (err) {
      setError(err.message || 'AI draft failed');
    } finally {
      setDrafting(false);
    }
  };

  const saveLead = async () => {
    if (!activeConversation || leadSaving) return;
    setLeadSaving(true);
    try {
      const response = await adminFetch('/api/admin/live-chat', {
        method: 'PATCH',
        body: JSON.stringify({ conversationId: activeConversation.id, action: 'save_lead' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save lead');
      setConversations((prev) => prev.map((conversation) => (
        conversation.id === data.conversation.id ? data.conversation : conversation
      )));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not save lead');
    } finally {
      setLeadSaving(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendReply();
    }
  };

  if (loading) {
    return (
      <div className="loader" style={{ padding: '48px 16px' }}>
        <div className="sync-spinner" style={{ marginBottom: '16px' }} />
        <div>Loading live chat…</div>
      </div>
    );
  }

  return (
    <div
      className={`admin-live-chat${isMobile && mobileThreadOpen ? ' is-thread-open' : ''}`}
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 360px) minmax(0, 1fr)',
        minHeight: isMobile ? 0 : '680px',
        border: '1px solid rgba(148, 163, 184, 0.16)',
        borderRadius: '16px',
        overflow: 'hidden',
        background: '#020617',
      }}
    >
      <aside
        className="admin-live-chat-aside"
        style={{
          borderRight: isMobile ? 0 : '1px solid rgba(148, 163, 184, 0.16)',
          background: '#07111f',
          minWidth: 0,
          display: isMobile && mobileThreadOpen ? 'none' : 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="admin-live-chat-filters" style={{ padding: '16px', borderBottom: '1px solid rgba(148, 163, 184, 0.16)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '1rem' }}>Website Inbox</div>
              <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{counts.unread} unread · {counts.open + counts.pending} active · {counts.leadReady} leads ready</div>
            </div>
            <button type="button" onClick={() => fetchInbox(true)} className="admin-btn" style={iconButtonStyle} title="Refresh">
              {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
            <button type="button" onClick={enableAlerts} className="admin-btn" style={{ ...iconButtonStyle, color: alertsEnabled ? '#86efac' : '#cbd5e1' }} title="Enable alerts">
              <Bell size={15} />
            </button>
          </div>

          <label style={searchStyle}>
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" style={searchInputStyle} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '12px' }}>
            {[
              ['active', 'Active', counts.open + counts.pending],
              ['open', 'Open', counts.open],
              ['pending', 'Wait', counts.pending],
              ['resolved', 'Done', counts.resolved],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                style={{
                  ...filterButtonStyle,
                  background: statusFilter === value ? '#0ea5e9' : 'rgba(15, 23, 42, 0.7)',
                  color: statusFilter === value ? '#fff' : '#cbd5e1',
                }}
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '8px' }}>
            {[
              ['mine', 'Mine', counts.mine],
              ['unassigned', 'Unassigned', counts.unassigned],
              ['all', 'All', conversations.length],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setOwnerFilter(value)}
                style={{
                  ...filterButtonStyle,
                  background: ownerFilter === value ? '#14b8a6' : 'rgba(15, 23, 42, 0.7)',
                  color: ownerFilter === value ? '#fff' : '#cbd5e1',
                }}
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="admin-live-chat-list" style={{ maxHeight: '560px', overflowY: 'auto' }}>
          {filteredConversations.length === 0 ? (
            <div style={{ padding: '28px 18px', color: '#94a3b8', textAlign: 'center' }}>
              <Inbox size={28} style={{ marginBottom: '10px' }} />
              <div>No conversations yet.</div>
            </div>
          ) : filteredConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                setActiveId(conversation.id);
                if (isMobile) setMobileThreadOpen(true);
              }}
              style={{
                width: '100%',
                border: 0,
                borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                background: activeId === conversation.id ? 'rgba(14, 165, 233, 0.16)' : 'transparent',
                color: '#e2e8f0',
                padding: '14px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '40px minmax(0, 1fr)',
                gap: '10px',
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: conversation.unreadForAgent ? '#0ea5e9' : '#1e293b',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
              }}>
                {initials(conversation.visitorName)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conversation.visitorName}</strong>
                  <span style={{ color: '#94a3b8', fontSize: '0.72rem', flexShrink: 0 }}>{formatTime(conversation.lastMessageAt)}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '3px' }}>
                  {messageText(conversation.lastMessage) || 'No message preview'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px', color: '#94a3b8', fontSize: '0.7rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: priorityColor(conversation.priority), display: 'inline-block' }} />
                  <span>{statusLabel(conversation.status)}</span>
                  {conversation.leadContext?.lead && <span>· Lead</span>}
                  {conversation.assignedToName && <span>· {conversation.assignedToName}</span>}
                  {conversation.unreadForAgent && <Circle size={8} fill="#38bdf8" color="#38bdf8" />}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main
        className="admin-live-chat-thread"
        style={{
          minWidth: 0,
          display: isMobile && !mobileThreadOpen ? 'none' : 'flex',
          flexDirection: 'column',
          background: '#0f172a',
        }}
      >
        {!activeConversation ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
            <div style={{ textAlign: 'center' }}>
              <MessageCircle size={36} />
              <div style={{ marginTop: '10px' }}>Select a live chat conversation.</div>
            </div>
          </div>
        ) : (
          <>
            <header className="admin-live-chat-header" style={{
              padding: '16px 18px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              background: '#111827',
              flexShrink: 0,
            }}>
              <div className="admin-live-chat-identity" style={{ minWidth: 0 }}>
                <div className="admin-live-chat-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc', fontWeight: 800, minWidth: 0 }}>
                  {isMobile && (
                    <button type="button" onClick={() => setMobileThreadOpen(false)} style={{ ...iconButtonStyle, width: '30px', height: '30px' }} aria-label="Back to conversations">
                      <ChevronLeft size={16} />
                    </button>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeConversation.visitorName}</span>
                  <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.76rem', flexShrink: 0 }}>{statusLabel(activeConversation.status)}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[activeConversation.visitorEmail, activeConversation.visitorPhone, activeConversation.pageUrl].filter(Boolean).join(' · ') || activeConversation.visitorId}
                </div>
              </div>
              <div className="admin-live-chat-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <select
                  value={activeConversation.priority}
                  onChange={(event) => patchConversation({ action: 'priority', priority: event.target.value })}
                  style={selectStyle}
                  aria-label="Priority"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
                <select
                  value={activeConversation.assignedTo || ''}
                  onChange={(event) => (
                    event.target.value
                      ? patchConversation({ action: 'assign', agentUserId: event.target.value })
                      : patchConversation({ action: 'release' })
                  )}
                  style={selectStyle}
                  aria-label="Assigned agent"
                  title="Assign conversation"
                >
                  <option value="">Unassigned</option>
                  {agents.map((agent) => (
                    <option key={agent.userId} value={agent.userId}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                {activeConversation.assignedTo ? (
                  <button type="button" className="admin-btn" style={toolbarButtonStyle} onClick={() => patchConversation({ action: 'release' })} title="Release">
                    <XCircle size={14} /> <span className="admin-live-chat-btn-label">Release</span>
                  </button>
                ) : (
                  <button type="button" className="admin-btn" style={toolbarButtonStyle} onClick={() => patchConversation({ action: 'claim' })} title="Claim">
                    <UserCheck size={14} /> <span className="admin-live-chat-btn-label">Claim</span>
                  </button>
                )}
                {activeConversation.status === 'resolved' ? (
                  <button type="button" className="admin-btn" style={toolbarButtonStyle} onClick={() => patchConversation({ action: 'status', status: 'open' })} title="Reopen">
                    <Clock3 size={14} /> <span className="admin-live-chat-btn-label">Reopen</span>
                  </button>
                ) : (
                  <button type="button" className="admin-btn" style={toolbarButtonStyle} onClick={() => patchConversation({ action: 'status', status: 'resolved' })} title="Resolve">
                    <CheckCircle2 size={14} /> <span className="admin-live-chat-btn-label">Resolve</span>
                  </button>
                )}
              </div>
            </header>

            <LeadCapturePanel
              conversation={activeConversation}
              saving={leadSaving}
              onSave={saveLead}
            />

            <div className="admin-live-chat-messages" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {visibleMessagesFor(activeConversation).map((message) => {
                const isAgent = message.senderType === 'agent';
                const text = messageText(message.message);
                const hasAttachments = message.attachments?.length > 0;
                return (
                  <div key={message.id} style={{ alignSelf: isAgent ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                    <div style={{
                      background: isAgent ? '#0ea5e9' : '#1e293b',
                      color: '#fff',
                      border: '1px solid ' + (isAgent ? '#0ea5e9' : 'rgba(148, 163, 184, 0.18)'),
                      borderRadius: isAgent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '11px 13px',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      lineHeight: 1.5,
                      fontSize: '0.9rem',
                    }}>
                      {text || (hasAttachments ? '' : (
                        <em style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Message could not be read</em>
                      ))}
                      {hasAttachments && (
                        <div style={{ display: 'grid', gap: '8px', marginTop: text ? '10px' : 0 }}>
                          {message.attachments.map((attachment) => (
                            <AttachmentPreview key={attachment.path} attachment={attachment} isAgent={isAgent} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '5px', textAlign: isAgent ? 'right' : 'left' }}>
                      {(message.senderName || (isAgent ? 'Agent' : 'Visitor'))} · {formatTime(message.createdAt)}
                      {message.fallback ? ' · latest preview' : ''}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="admin-live-chat-composer" style={{ borderTop: '1px solid rgba(148, 163, 184, 0.16)', padding: '14px 16px', background: '#111827', flexShrink: 0 }}>
              <div className="admin-live-chat-quick-replies" style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <button type="button" onClick={draftAiReply} disabled={drafting || !activeConversation.messages.length} style={{ ...quickReplyStyle, opacity: drafting ? 0.7 : 1 }}>
                  {drafting ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />} AI draft
                </button>
                {QUICK_REPLIES.map((text, index) => (
                  <button key={index} type="button" onClick={() => setReply(text)} style={quickReplyStyle}>
                    {text.slice(0, 28)}{text.length > 28 ? '...' : ''}
                  </button>
                ))}
              </div>
              {error && <div style={{ color: '#fca5a5', fontSize: '0.78rem', marginBottom: '8px' }}>{error}</div>}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Reply to visitor..."
                  className="admin-live-chat-input"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: '54px',
                    maxHeight: '140px',
                    resize: 'vertical',
                    border: '1px solid rgba(148, 163, 184, 0.28)',
                    borderRadius: '12px',
                    background: '#020617',
                    color: '#f8fafc',
                    padding: '12px',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="admin-btn"
                  style={{
                    ...sendButtonStyle,
                    opacity: sending || !reply.trim() ? 0.6 : 1,
                    cursor: sending || !reply.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  <span className="admin-live-chat-btn-label">Send</span>
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function AttachmentPreview({ attachment, isAgent }) {
  const linkColor = isAgent ? '#f0f9ff' : '#bae6fd';
  const borderColor = isAgent ? 'rgba(255,255,255,0.24)' : 'rgba(148, 163, 184, 0.22)';
  const background = isAgent ? 'rgba(255,255,255,0.12)' : '#0f172a';

  if (attachment.kind === 'image' && attachment.url) {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" style={{ color: linkColor, textDecoration: 'none', display: 'block' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name || 'Uploaded image'}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: '320px',
            maxHeight: '240px',
            objectFit: 'cover',
            borderRadius: '10px',
            border: `1px solid ${borderColor}`,
            background,
          }}
        />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '6px', fontSize: '0.74rem', fontWeight: 700 }}>
          Open proof <ExternalLink size={12} />
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
        gap: '9px',
        minWidth: '220px',
        maxWidth: '320px',
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        padding: '9px',
        background,
        color: linkColor,
        textDecoration: 'none',
        pointerEvents: attachment.url ? 'auto' : 'none',
      }}
    >
      <FileText size={17} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem', fontWeight: 700 }}>
        {attachment.name || 'Attachment'}
      </span>
      {attachment.url && <ExternalLink size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
    </a>
  );
}

function LeadCapturePanel({ conversation, saving, onSave }) {
  const context = conversation?.leadContext || {};
  const lead = context.lead;
  const missingContact = context.status === 'missing_contact';
  const isSaved = context.status === 'saved';
  const isMatched = context.status === 'matched';
  const contactValue = context.contactValue || conversation?.visitorEmail || conversation?.visitorPhone || '';
  const statusText = missingContact
    ? 'Ask for email or phone'
    : isSaved
      ? 'Saved in Leads'
      : isMatched
        ? 'Matched existing lead'
        : 'Ready for Leads';

  return (
    <section style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gap: '12px',
      alignItems: 'center',
      padding: '12px 18px',
      borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
      background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(16, 185, 129, 0.06))',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: missingContact ? '#fbbf24' : '#86efac',
            fontSize: '0.78rem',
            fontWeight: 800,
            textTransform: 'uppercase',
          }}>
            <Target size={14} /> {statusText}
          </span>
          {lead?.status && (
            <span style={{ color: '#cbd5e1', fontSize: '0.75rem', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '999px', padding: '3px 8px' }}>
              {lead.status}
            </span>
          )}
          {lead?.whatsappConsent ? (
            <span style={{ color: '#86efac', fontSize: '0.72rem' }}>WA opt-in</span>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>No promo opt-in</span>
          )}
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contactValue || 'No email/phone captured yet'}{lead?.source ? ` · source: ${lead.source}` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || missingContact}
        className="admin-btn"
        style={{
          ...toolbarButtonStyle,
          background: isSaved || isMatched ? 'rgba(34,197,94,0.12)' : '#0ea5e9',
          color: isSaved || isMatched ? '#86efac' : '#fff',
          opacity: saving || missingContact ? 0.6 : 1,
          cursor: saving || missingContact ? 'not-allowed' : 'pointer',
          whiteSpace: 'nowrap',
        }}
        title={missingContact ? 'Ask the visitor for an email or phone first' : 'Create or update this lead in the CRM'}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : (isSaved || isMatched ? <CheckCircle2 size={14} /> : <UserPlus size={14} />)}
        {isSaved || isMatched ? 'Update Lead' : 'Save Lead'}
      </button>
    </section>
  );
}

const iconButtonStyle = {
  width: '34px',
  height: '34px',
  padding: 0,
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: '#0f172a',
  color: '#cbd5e1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const searchStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  borderRadius: '12px',
  padding: '9px 10px',
  color: '#94a3b8',
  background: '#020617',
};

const searchInputStyle = {
  flex: 1,
  minWidth: 0,
  border: 0,
  outline: 0,
  background: 'transparent',
  color: '#f8fafc',
  fontSize: '0.85rem',
};

const filterButtonStyle = {
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: '10px',
  padding: '7px 4px',
  cursor: 'pointer',
  display: 'grid',
  gap: '2px',
  fontSize: '0.68rem',
};

const selectStyle = {
  background: '#020617',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.24)',
  borderRadius: '10px',
  padding: '8px 10px',
};

const toolbarButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: '#0f172a',
  color: '#e2e8f0',
  padding: '8px 10px',
};

const quickReplyStyle = {
  border: '1px solid rgba(14, 165, 233, 0.3)',
  background: 'rgba(14, 165, 233, 0.08)',
  color: '#bae6fd',
  borderRadius: '999px',
  padding: '7px 10px',
  fontSize: '0.75rem',
  cursor: 'pointer',
};

const sendButtonStyle = {
  minHeight: '54px',
  borderRadius: '12px',
  background: '#0ea5e9',
  color: '#fff',
  border: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 18px',
};
