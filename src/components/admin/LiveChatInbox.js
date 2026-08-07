'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Bot, CheckCircle2, ChevronLeft, Circle, Clock3, ExternalLink, FileText, Inbox, Loader2, MessageCircle, RefreshCw, Search, Send, Target, Trash2, UserCheck, UserPlus, XCircle } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import {
  DAY_DISPLAY_ORDER,
  DAY_LABELS,
  DEFAULT_LIVE_CHAT_AVAILABILITY,
  LIVE_CHAT_MODES,
  buildDayEntry,
  formatHour12,
  scheduleForDay,
  summarizeSchedule,
} from '@/lib/liveChatAvailability.mjs';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  matchesLiveChatOwnerFilter,
  matchesLiveChatStatusFilter,
  renderLiveChatMessage as messageText,
} from '@/lib/liveChat';

const POLL_MS = 15000;

// Agents had to click the bell again on every page load, so in practice nobody
// was ever alerted. The choice is remembered per browser instead.
const ALERTS_KEY = 'peptides_live_chat_alerts';

// A new/unassigned chat that nobody has picked up beeps again on this interval.
// One missed beep used to mean a waiting customer was never noticed.
const REMINDER_MS = 60000;

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
  const [statusFilter, setStatusFilter] = useState('new');
  // The one chat allowed to ignore the filters, so that replying — which
  // claims it and moves it to Open/Mine — cannot yank the agent onto a
  // different customer mid-conversation. Set only by sending a reply, and
  // dropped the moment the agent filters, searches or picks another chat,
  // because then they are deliberately asking to see something else.
  const [pinnedId, setPinnedId] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [savingAvailability, setSavingAvailability] = useState(false);
  // Seven rows of pickers do not fit the sidebar header, so the week opens on
  // demand and the header keeps a one-line summary of it.
  const [showHours, setShowHours] = useState(false);
  // Ticked days, for setting several to the same hours in one go — changing a
  // whole week a dropdown at a time is fourteen interactions.
  const [selectedDays, setSelectedDays] = useState([]);
  // What the apply bar will set. Null means it has not been touched yet and
  // should show the shared hours as its starting point.
  const [bulkHours, setBulkHours] = useState(null);
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
  // Conversations already on screen. Without this, every chat that was unread
  // before the agent opened the CRM counts as newly arrived.
  const knownConversationIdsRef = useRef(new Set());
  // The first fetch seeds the refs above without alerting. Alerts were only
  // ever silent on load because the bell defaulted to off; now that the setting
  // persists, opening the inbox would otherwise fire for every old unread chat.
  const seededRef = useRef(false);
  const isMobile = useIsMobile();

  // Restore the agent's choice. Browser permission can be revoked from the
  // address bar without the app hearing about it, so it is re-checked rather
  // than trusted from storage alone.
  useEffect(() => {
    try {
      if (localStorage.getItem(ALERTS_KEY) !== '1') return;
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return;
      setAlertsEnabled(true);
    } catch {}
  }, []);

  const fetchInbox = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await adminFetch('/api/admin/live-chat', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load live chat');
      setConversations(data.conversations || []);
      setAgents(data.agents || []);
      setCurrentAgent(data.currentAgent || null);
      if (data.availability) setAvailability(data.availability);
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

  // Backstop for the channel above. When the tables are not in the realtime
  // publication the subscription still reports SUBSCRIBED and then silently
  // never fires, so there is nothing to detect and fall back on — the inbox
  // would just sit stale until an agent hit refresh. Slow on purpose: realtime
  // is the fast path once enable-live-chat-realtime.sql has been run. Not
  // `manual`, so the backstop never flashes the refresh spinner.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetchInbox();
    }, 15000);
    return () => clearInterval(interval);
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

  const counts = useMemo(() => {
    const byOwner = conversations.filter((conversation) =>
      matchesLiveChatOwnerFilter(conversation, ownerFilter, currentAgent?.userId));

    const byStatus = conversations.filter((conversation) =>
      matchesLiveChatStatusFilter(conversation, statusFilter));

    return {
      newUnassigned: byOwner.filter((conversation) =>
        matchesLiveChatStatusFilter(conversation, 'new')).length,
      open: byOwner.filter((conversation) => conversation.status === 'open').length,
      pending: byOwner.filter((conversation) => conversation.status === 'pending').length,
      unread: byOwner.filter((conversation) => conversation.unreadForAgent).length,
      resolved: byOwner.filter((conversation) => conversation.status === 'resolved').length,
      leadReady: byOwner.filter((conversation) => conversation.leadContext?.status === 'ready').length,
      mine: byStatus.filter((conversation) => conversation.assignedTo === currentAgent?.userId).length,
      // Counted within the current status filter like Mine and Unassigned
      // beside it. It used to be the raw total, so picking a status with no
      // matches still showed "All 3" above an empty list.
      allInStatus: byStatus.length,
      // Every chat the owner filter allows, whatever its status. Backs the
      // status row's own All chip.
      allStatuses: byOwner.length,
    };
  }, [conversations, currentAgent?.userId, ownerFilter, statusFilter]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations
      .filter((conversation) => {
        // Only a chat just replied to overrides the filters (see `pinnedId`).
        // This used to pin whatever was selected, which meant clicking a filter
        // with a count of 0 still listed that chat and the filters looked
        // broken. Search still applies either way.
        const pinned = pinnedId !== null && conversation.id === pinnedId;
        if (!pinned && !matchesLiveChatStatusFilter(conversation, statusFilter)) return false;
        if (!pinned && !matchesLiveChatOwnerFilter(conversation, ownerFilter, currentAgent?.userId)) return false;
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
  }, [pinnedId, conversations, currentAgent?.userId, ownerFilter, search, statusFilter]);

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setActiveId(null);
      return;
    }
    if (!filteredConversations.some((conversation) => conversation.id === activeId)) {
      setActiveId(filteredConversations[0].id);
    }
  }, [activeId, filteredConversations]);

  // Focusing the window from a click handler needs the notification kept alive,
  // so this is shared by the arrival alert and the unanswered-chat reminder.
  const raiseNotification = useCallback((title, body, conversationId) => {
    playAlertTone();
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const notification = new Notification(title, {
        body: String(body || '').slice(0, 120),
        // Re-alerting the same chat replaces its previous popup rather than
        // stacking a new one every minute.
        tag: `live-chat-${conversationId}`,
        renotify: true,
      });
      notification.onclick = () => {
        window.focus();
        setActiveId(conversationId);
        if (isMobile) setMobileThreadOpen(true);
        notification.close();
      };
    } catch {}
  }, [isMobile]);

  useEffect(() => {
    const unreadIds = new Set(conversations
      .filter((conversation) => conversation.unreadForAgent)
      .map((conversation) => conversation.id));
    const allIds = new Set(conversations.map((conversation) => conversation.id));

    // The first load only records what is already there. Alerting here would
    // announce yesterday's chats as if a customer had just walked in.
    if (!seededRef.current) {
      previousUnreadIdsRef.current = unreadIds;
      knownConversationIdsRef.current = allIds;
      if (conversations.length > 0) seededRef.current = true;
      return;
    }

    const newUnread = [...unreadIds].filter((id) => !previousUnreadIdsRef.current.has(id));
    const arrived = [...allIds].filter((id) => !knownConversationIdsRef.current.has(id));
    previousUnreadIdsRef.current = unreadIds;
    knownConversationIdsRef.current = allIds;

    if (!alertsEnabled) return;

    // A brand new conversation is the thing Joe asked to be told about, so it
    // wins over a follow-up message on a chat the agent already knows.
    const targetId = arrived.find((id) => unreadIds.has(id)) ?? arrived[0] ?? newUnread[0];
    if (!targetId) return;
    const target = conversations.find((conversation) => conversation.id === targetId);
    if (!target) return;

    const isNewChat = arrived.includes(targetId);
    raiseNotification(
      isNewChat ? 'New chat waiting' : 'New message',
      `${target.visitorName || 'Visitor'}: ${messageText(target.lastMessage) || (isNewChat ? 'started a chat' : 'sent a message')}`,
      targetId,
    );
  }, [alertsEnabled, conversations, raiseNotification]);

  // A waiting customer nobody has claimed is re-announced until an agent takes
  // the chat. A single beep at the wrong moment used to lose the customer.
  useEffect(() => {
    if (!alertsEnabled) return undefined;
    const interval = setInterval(() => {
      const waiting = conversations
        .filter((conversation) => matchesLiveChatStatusFilter(conversation, 'new'))
        .sort((a, b) => new Date(a.lastMessageAt || 0) - new Date(b.lastMessageAt || 0))[0];
      if (!waiting) return;
      raiseNotification(
        'Customer still waiting',
        `${waiting.visitorName || 'Visitor'} has not been answered yet`,
        waiting.id,
      );
    }, REMINDER_MS);
    return () => clearInterval(interval);
  }, [alertsEnabled, conversations, raiseNotification]);

  // A backgrounded CRM tab gave no signal at all. The count rides in the tab
  // title so a glance at the browser is enough.
  useEffect(() => {
    const waiting = conversations.filter((conversation) =>
      matchesLiveChatStatusFilter(conversation, 'new')).length;
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = waiting > 0 ? `(${waiting}) ${base}` : base;
    return () => { document.title = document.title.replace(/^\(\d+\)\s*/, ''); };
  }, [conversations]);

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

  const deleteConversation = async () => {
    if (!activeConversation) return;
    if (!window.confirm('Are you sure you want to permanently delete this conversation and all its messages?')) return;
    
    const conversationId = activeConversation.id;
    try {
      const response = await adminFetch(`/api/admin/live-chat?conversationId=${conversationId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Delete failed');
      
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeId === conversationId) {
        setActiveId(null);
        setMobileThreadOpen(false);
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  // Shared by the mode pill and the two hour pickers, so both save the same way
  // and a failure in either puts the control back rather than leaving the
  // dashboard showing a state the website is not actually in.
  const saveAvailability = async (patch) => {
    if (savingAvailability) return;
    const previous = availability;
    const optimistic = { ...DEFAULT_LIVE_CHAT_AVAILABILITY, ...(availability || {}), ...patch };
    setAvailability(optimistic);
    setSavingAvailability(true);
    try {
      const response = await adminFetch('/api/admin/live-chat', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'availability', availability: optimistic }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not change availability');
      setAvailability(data.availability);
      setError('');
    } catch (err) {
      setAvailability(previous);
      setError(err.message || 'Could not change availability');
    } finally {
      setSavingAvailability(false);
    }
  };

  // The apply bar starts from the shared hours rather than from a hard-coded
  // 7am-7pm, so it opens showing something the shop actually uses.
  const bulkClosed = bulkHours?.closed === true;
  const bulkOpen = bulkHours?.openHour ?? availability?.openHour ?? DEFAULT_LIVE_CHAT_AVAILABILITY.openHour;
  const bulkClose = bulkHours?.closeHour ?? availability?.closeHour ?? DEFAULT_LIVE_CHAT_AVAILABILITY.closeHour;

  /**
   * Saves the same edit against one or more weekdays, leaving the rest alone.
   *
   * Every selected day goes in a single request rather than one per day: seven
   * PATCHes would each overwrite the whole setting, and the last to land would
   * win with a stale copy of the other six.
   */
  const saveDays = (days, patch) => {
    const next = { ...(availability?.days || {}) };
    for (const day of days) {
      // A day that has never been edited shows the shared hours, so the edit
      // starts from what is on screen rather than from the shipped default.
      const base = scheduleForDay(availability, day).ranges[0] || DEFAULT_LIVE_CHAT_AVAILABILITY;
      next[day] = buildDayEntry(patch, base);
    }
    return saveAvailability({ days: next });
  };

  const saveDay = (day, patch) => saveDays([day], patch);

  const toggleDaySelected = (day) => {
    setSelectedDays((current) => (current.includes(day)
      ? current.filter((entry) => entry !== day)
      : [...current, day]));
  };

  // The bar applies exactly what it shows, so it passes both hours rather than
  // letting each day fill a missing one in from its own.
  const applyToSelectedDays = async () => {
    if (!selectedDays.length) return;
    await saveDays(selectedDays, bulkClosed ? { closed: true } : { openHour: bulkOpen, closeHour: bulkClose });
    // Clearing is the confirmation: the rows now read as what was applied, and
    // the bar going away says the change landed.
    setSelectedDays([]);
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
      // Replying claims the chat and moves it to Open/Mine, dropping it out of
      // the New/Unassigned queue most agents work from. Hold it on screen so
      // the thread they are mid-conversation on does not vanish under them.
      setPinnedId(conversationId);
      setError('');
    } catch (err) {
      setDrafts((prev) => ({ ...prev, [conversationId]: text }));
      setError(err.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const toggleAlerts = async () => {
    if (alertsEnabled) {
      setAlertsEnabled(false);
      try { localStorage.setItem(ALERTS_KEY, '0'); } catch {}
      return;
    }
    let granted = true;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      granted = (await Notification.requestPermission()) === 'granted';
    }
    setAlertsEnabled(granted);
    try { localStorage.setItem(ALERTS_KEY, granted ? '1' : '0'); } catch {}
    if (granted) playAlertTone();
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
              {/* minWidth:0 lets the summary line ellipsise instead of forcing
                  the row wider than the sidebar and wrapping the title. */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '1rem', whiteSpace: 'nowrap' }}>Website Inbox</div>
              {/* "active" was left over from the old Active chip and counted
                  open+pending, so this read "0 active" while unclaimed chats
                  were sitting in the list. It now reports the queue the chips
                  actually describe. */}
              <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{counts.unread} unread · {counts.newUnassigned} waiting · {counts.leadReady} leads ready</div>
            </div>
            <button type="button" onClick={() => fetchInbox(true)} className="admin-btn" style={iconButtonStyle} title="Refresh">
              {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
            <button
              type="button"
              onClick={toggleAlerts}
              className="admin-btn"
              style={{ ...iconButtonStyle, color: alertsEnabled ? '#86efac' : '#cbd5e1' }}
              title={alertsEnabled ? 'Alerts on — click to turn off' : 'Alerts off — click to be notified of new chats'}
              aria-pressed={alertsEnabled}
            >
              <Bell size={15} />
            </button>
          </div>

          {/* Its own row rather than beside the title. In the sidebar width
              the pill plus two hour pickers plus two icon buttons squeezed
              "Website Inbox" onto two lines and pushed the icons off the
              edge. */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            {/* Shop-wide online switch, superadmin only. Everyone else just
                sees the state, so an agent cannot close the chat for the
                whole company by accident. */}
            {currentAgent?.isSuperadmin ? (
              <div style={modeToggleStyle} role="group" aria-label="Website chat availability">
                {LIVE_CHAT_MODES.map((mode) => {
                  const active = (availability?.mode || 'auto') === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      // Re-saving the mode already showing would spend a request
                      // to change nothing.
                      onClick={() => (active ? undefined : saveAvailability({ mode }))}
                      disabled={savingAvailability}
                      className="admin-btn"
                      style={{ ...modeSegmentStyle, ...(active ? { ...availabilityTone(mode), fontWeight: 700 } : {}) }}
                      title={AVAILABILITY_HINTS[mode]}
                      aria-pressed={active}
                    >
                      {savingAvailability && active
                        ? <Loader2 size={11} className="animate-spin" />
                        : active ? <Circle size={8} fill="currentColor" strokeWidth={0} /> : null}
                      {AVAILABILITY_LABELS[mode]}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {/* The schedule only decides anything in Auto, so the pickers are
                hidden when the mode is overriding the clock — otherwise they
                look like settings that are being ignored, which they are. */}
            {currentAgent?.isSuperadmin && (availability?.mode || 'auto') === 'auto' ? (
              <button
                type="button"
                onClick={() => setShowHours((open) => !open)}
                className="admin-btn"
                style={availabilityHoursStyle}
                title="Hours the website chat shows as online, Costa Rica time"
                aria-expanded={showHours}
              >
                <Clock3 size={12} />
                {summarizeSchedule(availability)}
              </button>
            ) : null}
            {!currentAgent?.isSuperadmin ? (
              <span
                style={{ ...availabilityPillStyle, ...availabilityTone(availability?.mode), cursor: 'default' }}
                title={AVAILABILITY_HINTS[availability?.mode || 'auto']}
              >
                <Circle size={9} fill="currentColor" strokeWidth={0} />
                {AVAILABILITY_LABELS[availability?.mode || 'auto']}
              </span>
            ) : null}
          </div>

          {/* The week, one row per day. A day keeps showing the shared hours
              until it is given its own, so the panel always reads as the real
              schedule rather than as seven blanks waiting to be filled. */}
          {currentAgent?.isSuperadmin && showHours && (availability?.mode || 'auto') === 'auto' ? (
            <div style={weekPanelStyle}>
              <div style={weekPanelHintStyle}>Website chat hours · Costa Rica time</div>
              {DAY_DISPLAY_ORDER.map((day) => {
                const schedule = scheduleForDay(availability, day);
                const range = schedule.ranges[0];
                return (
                  <div key={day} style={dayRowStyle}>
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day)}
                      onChange={() => toggleDaySelected(day)}
                      style={dayCheckboxStyle}
                      aria-label={`Select ${DAY_LABELS[day]} to set with other days`}
                    />
                    <span style={dayNameStyle}>{DAY_LABELS[day].slice(0, 3)}</span>
                    <select
                      value={schedule.closed ? 'closed' : range.openHour}
                      onChange={(event) => saveDay(day, event.target.value === 'closed'
                        ? { closed: true }
                        : { openHour: Number(event.target.value) })}
                      disabled={savingAvailability}
                      style={hourSelectStyle}
                      aria-label={`${DAY_LABELS[day]} opens at`}
                    >
                      <option value="closed">Closed</option>
                      {/* 11pm is not offered as an opening: closing must be
                          later, and there is no later hour that day. */}
                      {HOURS.slice(0, 23).map((hour) => (
                        <option key={hour} value={hour}>{formatHour12(hour)}</option>
                      ))}
                    </select>
                    {schedule.closed ? (
                      <span style={{ opacity: 0.5, fontSize: '0.72rem' }}>all day</span>
                    ) : (
                      <>
                        <span style={{ opacity: 0.6 }}>–</span>
                        <select
                          value={range.closeHour}
                          onChange={(event) => saveDay(day, { closeHour: Number(event.target.value) })}
                          disabled={savingAvailability}
                          style={hourSelectStyle}
                          aria-label={`${DAY_LABELS[day]} closes at`}
                        >
                          {/* Only hours after opening, because an inverted range
                              would be rejected on save and drop the day back to
                              the shared hours. */}
                          {HOURS.filter((hour) => hour > range.openHour)
                            .map((hour) => <option key={hour} value={hour}>{formatHour12(hour)}</option>)}
                        </select>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Only once something is ticked: an empty bar would be a control
                  that does nothing, sitting under the rows that do. */}
              {selectedDays.length ? (
                <div style={bulkBarStyle}>
                  <span style={{ color: '#cbd5e1' }}>
                    Set {selectedDays.length} selected {selectedDays.length === 1 ? 'day' : 'days'} to
                  </span>
                  <span style={dayRowStyle}>
                    <select
                      value={bulkClosed ? 'closed' : bulkOpen}
                      onChange={(event) => setBulkHours(event.target.value === 'closed'
                        ? { closed: true }
                        : { openHour: Number(event.target.value), closeHour: Math.max(bulkClose, Number(event.target.value) + 1) })}
                      disabled={savingAvailability}
                      style={hourSelectStyle}
                      aria-label="Set selected days to open at"
                    >
                      <option value="closed">Closed</option>
                      {HOURS.slice(0, 23).map((hour) => (
                        <option key={hour} value={hour}>{formatHour12(hour)}</option>
                      ))}
                    </select>
                    {bulkClosed ? (
                      <span style={{ opacity: 0.5 }}>all day</span>
                    ) : (
                      <>
                        <span style={{ opacity: 0.6 }}>–</span>
                        <select
                          value={bulkClose}
                          onChange={(event) => setBulkHours({ openHour: bulkOpen, closeHour: Number(event.target.value) })}
                          disabled={savingAvailability}
                          style={hourSelectStyle}
                          aria-label="Set selected days to close at"
                        >
                          {HOURS.filter((hour) => hour > bulkOpen)
                            .map((hour) => <option key={hour} value={hour}>{formatHour12(hour)}</option>)}
                        </select>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={applyToSelectedDays}
                      disabled={savingAvailability}
                      className="admin-btn"
                      style={applyButtonStyle}
                    >
                      {savingAvailability ? <Loader2 size={12} className="animate-spin" /> : null}
                      Apply
                    </button>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <label style={searchStyle}>
            <Search size={15} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPinnedId(null); }} placeholder="Search conversations" style={searchInputStyle} />
          </label>

          {/* 'New/Unassigned' is far longer than the other four labels, so the
              first column is widened instead of letting an equal split squash
              or wrap it on a narrow phone sidebar. */}
          <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1fr 1fr', gap: '6px', marginTop: '12px' }}>
            {[
              ['new', 'New/Unassigned', counts.newUnassigned],
              ['open', 'Open', counts.open],
              ['pending', 'Wait', counts.pending],
              ['resolved', 'Done', counts.resolved],
              // Renaming Active to New/Unassigned narrowed that chip from
              // "everything not resolved" to "nobody has claimed it", which
              // left no way to see the whole history at once — an agent whose
              // chats were all resolved landed on an empty inbox and assumed
              // they had been lost.
              ['all', 'All', counts.allStatuses],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => { setStatusFilter(value); setPinnedId(null); }}
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

          {/* Whose chats, not what state — the row above is the state.
              'Unassigned' used to live here too, which put the word on screen
              twice with two different counts next to the status row's
              'New/Unassigned'. That chip already answers "nobody has this
              one", so this row is now just mine-versus-everyone, and its last
              chip is 'Everyone' rather than a second 'All'. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginTop: '8px' }}>
            {[
              ['mine', 'Mine', counts.mine],
              ['all', 'Everyone', counts.allInStatus],
            ].map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => { setOwnerFilter(value); setPinnedId(null); }}
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
              {/* Saying "No conversations yet" while chats sat under another
                  filter read as data loss. Say which it is, and offer the way
                  back rather than making the agent guess the right chip. */}
              {conversations.length === 0 ? (
                <div>No conversations yet.</div>
              ) : (
                <>
                  <div>Nothing matches this filter.</div>
                  <button
                    type="button"
                    onClick={() => { setStatusFilter('all'); setOwnerFilter('all'); setSearch(''); setPinnedId(null); }}
                    style={{
                      marginTop: '12px',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      background: 'rgba(15, 23, 42, 0.7)',
                      color: '#e2e8f0',
                      borderRadius: '10px',
                      padding: '8px 14px',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    Show all {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
                  </button>
                </>
              )}
            </div>
          ) : filteredConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                setActiveId(conversation.id);
                // Choosing a different chat retires the previous pin, so an
                // old reply cannot keep an unrelated chat stuck in the list.
                if (conversation.id !== pinnedId) setPinnedId(null);
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
                  {/* Staff without Live Chat access are shown but not
                      selectable, so it is obvious they exist and what is
                      missing, rather than them looking absent from the CRM. */}
                  {agents.map((agent) => (
                    <option
                      key={agent.userId}
                      value={agent.userId}
                      disabled={agent.hasLiveChatAccess === false}
                    >
                      {agent.name}
                      {agent.hasLiveChatAccess === false ? ' — no Live Chat access' : ''}
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
                <button type="button" className="admin-btn" style={{ ...toolbarButtonStyle, color: 'var(--color-danger, #ef4444)' }} onClick={deleteConversation} title="Delete">
                  <Trash2 size={14} /> <span className="admin-live-chat-btn-label">Delete</span>
                </button>
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
  // Square buttons must not be squashed into slivers when the row is tight.
  flexShrink: 0,
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

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const AVAILABILITY_LABELS = { auto: 'Auto', online: 'Online', offline: 'Offline' };

const availabilityHoursStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 10px',
  borderRadius: '999px',
  border: '1px solid rgba(148, 163, 184, 0.24)',
  background: 'transparent',
  fontSize: '0.72rem',
  color: '#cbd5e1',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

const weekPanelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '10px',
  marginBottom: '14px',
  borderRadius: '10px',
  background: 'rgba(2, 6, 23, 0.6)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
};

const weekPanelHintStyle = {
  fontSize: '0.68rem',
  color: '#94a3b8',
  marginBottom: '2px',
};

const dayRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const dayCheckboxStyle = {
  width: '13px',
  height: '13px',
  flexShrink: 0,
  accentColor: '#38bdf8',
  cursor: 'pointer',
};

const bulkBarStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginTop: '4px',
  paddingTop: '8px',
  // A rule rather than a panel of its own: it belongs to the rows above it.
  borderTop: '1px solid rgba(148, 163, 184, 0.18)',
  fontSize: '0.72rem',
};

const applyButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  marginLeft: 'auto',
  padding: '5px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(56, 189, 248, 0.4)',
  background: 'rgba(56, 189, 248, 0.14)',
  color: '#e0f2fe',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const dayNameStyle = {
  // Fixed width so the pickers line up in a column rather than stepping in and
  // out with the length of the day name.
  width: '30px',
  flexShrink: 0,
  fontSize: '0.72rem',
  color: '#cbd5e1',
};

const hourSelectStyle = {
  background: '#020617',
  color: '#e2e8f0',
  border: '1px solid rgba(148, 163, 184, 0.24)',
  borderRadius: '8px',
  padding: '5px 6px',
  fontSize: '0.72rem',
  cursor: 'pointer',
};

// Each option says what it does, not what clicking next would do: the three are
// all on screen now, so there is no cycle left to explain.
const AVAILABILITY_HINTS = {
  auto: 'Follow the hours below — online during them, offline outside them',
  online: 'Always show the website chat as online, whatever the clock says',
  offline: 'Always show the website chat as offline, e.g. a holiday or nobody on shift',
};

// One track holding three segments, so the two modes that are not in force stay
// readable as the alternatives rather than disappearing behind the current one.
const modeToggleStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2px',
  padding: '2px',
  borderRadius: '999px',
  border: '1px solid rgba(148, 163, 184, 0.24)',
  background: 'rgba(2, 6, 23, 0.6)',
};

const modeSegmentStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '5px 10px',
  borderRadius: '999px',
  border: 0,
  background: 'transparent',
  color: '#94a3b8',
  fontSize: '0.72rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

const availabilityPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '0.72rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  border: '1px solid rgba(148, 163, 184, 0.24)',
};

// Auto is deliberately neutral rather than green: it means "whatever the
// schedule says", which is offline for half the day.
function availabilityTone(mode) {
  if (mode === 'online') return { background: 'rgba(34, 197, 94, 0.16)', color: '#86efac' };
  if (mode === 'offline') return { background: 'rgba(239, 68, 68, 0.16)', color: '#fca5a5' };
  return { background: 'rgba(15, 23, 42, 0.7)', color: '#cbd5e1' };
}

const filterButtonStyle = {
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: '10px',
  padding: '7px 4px',
  cursor: 'pointer',
  display: 'grid',
  gap: '2px',
  fontSize: '0.68rem',
  // minWidth:0 lets a grid child shrink below its text width instead of
  // pushing the row wider than the sidebar; the rest keeps all four chips the
  // same height whether their label wraps to two lines or not.
  minWidth: 0,
  textAlign: 'center',
  lineHeight: 1.2,
  alignContent: 'center',
  // break-word, not anywhere: if 'New/Unassigned' ever does outgrow its
  // column it should break after the slash, not mid-word as 'New/Unassigne'
  // + 'd', which is what it was doing.
  overflowWrap: 'break-word',
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
