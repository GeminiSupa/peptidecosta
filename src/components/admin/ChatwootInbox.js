"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Lock, MessageCircle, RotateCw, Send } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const STATUS_FILTERS = [
  ['', 'All'],
  ['open', 'Open'],
  ['pending', 'Pending'],
  ['snoozed', 'Snoozed'],
  ['resolved', 'Resolved'],
];

const STATUS_STYLES = {
  open: { label: 'Open', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' },
  pending: { label: 'Pending', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
  snoozed: { label: 'Snoozed', color: '#c4b5fd', background: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)' },
  resolved: { label: 'Resolved', color: '#4ade80', background: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)' },
};

const REPLY_MAX_LENGTH = 4000;
// Chatwoot is an outside service, so this is slower than the live-chat inbox,
// which reads our own database.
const POLL_MS = 30000;

const panelStyle = {
  background: 'rgba(255,255,255,0.02)',
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.05)',
};

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.open;
  return (
    <span style={{
      color: style.color,
      background: style.background,
      border: `1px solid ${style.border}`,
      padding: '2px 9px',
      borderRadius: '20px',
      fontSize: '0.65rem',
      fontWeight: 'bold',
      textTransform: 'uppercase',
      display: 'inline-block',
      whiteSpace: 'nowrap',
    }}>{style.label}</span>
  );
}

function MessageBubble({ message }) {
  if (message.kind === 'activity') {
    return (
      <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.7rem', padding: '2px 0' }}>
        {message.content} · {formatTime(message.createdAt)}
      </div>
    );
  }

  const fromContact = message.kind === 'incoming';
  const background = message.private
    ? 'rgba(245, 158, 11, 0.1)'
    : (fromContact ? 'rgba(255,255,255,0.05)' : 'rgba(56, 189, 248, 0.12)');
  const border = message.private
    ? 'rgba(245, 158, 11, 0.3)'
    : (fromContact ? 'rgba(255,255,255,0.08)' : 'rgba(56, 189, 248, 0.25)');

  return (
    <div style={{ display: 'flex', justifyContent: fromContact ? 'flex-start' : 'flex-end' }}>
      <div style={{ maxWidth: '85%', background, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.67rem', color: '#94a3b8', marginBottom: '3px' }}>
          {message.private && <Lock size={10} />}
          <span style={{ fontWeight: 700 }}>
            {message.senderName || (fromContact ? 'Customer' : 'Agent')}
            {message.private ? ' · Private note' : ''}
          </span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        {message.content && (
          <div style={{ fontSize: '0.82rem', color: '#f8fafc', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
            {message.content}
          </div>
        )}
        {message.attachments.map((attachment) => (
          <a
            key={attachment.url}
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#7dd3fc', fontSize: '0.72rem', marginTop: '4px' }}
          >
            {attachment.type} attachment <ExternalLink size={10} />
          </a>
        ))}
      </div>
    </div>
  );
}

function ConversationThread({ conversation, draft, onDraftChange, onSent }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // `quiet` is the background poll: it refills the thread without blanking it
  // or flashing "Loading messages…" under the agent who is reading it.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const response = await adminFetch(`/api/admin/chatwoot?conversationId=${encodeURIComponent(conversation.id)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load this conversation.');
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (loadError) {
      if (!quiet) setError(loadError.message || 'Could not load this conversation.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [conversation.id]);

  useEffect(() => { load(); }, [load]);

  // The customer's own replies arrive in Chatwoot, not here, so the open
  // thread re-reads itself while the dashboard is on screen.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load({ quiet: true });
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const sendReply = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError('');
    try {
      const response = await adminFetch('/api/admin/chatwoot', {
        method: 'POST',
        body: JSON.stringify({ conversationId: conversation.id, content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send the reply.');
      onDraftChange('');
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
        onSent(conversation.id, data.message);
      }
    } catch (replyError) {
      setSendError(replyError.message || 'Could not send the reply.');
    } finally {
      setSending(false);
    }
  };

  const visibleMessages = messages.filter((message) => message.content || message.attachments.length);

  return (
    <div style={{ ...panelStyle, padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '420px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#f8fafc' }}>
            {conversation.contactName || `Conversation #${conversation.id}`}
          </span>
          <StatusBadge status={conversation.status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '8px', padding: '4px 9px', fontSize: '0.7rem', cursor: loading ? 'wait' : 'pointer' }}
          >
            <RotateCw size={11} /> Refresh
          </button>
          {conversation.url && (
            <a
              href={conversation.url}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#7dd3fc', fontSize: '0.72rem', textDecoration: 'none' }}
            >
              Open in Chatwoot <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
      <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '10px' }}>
        #{conversation.id}
        {conversation.assigneeName ? ` · Assigned to ${conversation.assigneeName}` : ' · Unassigned'}
        {conversation.lastActivityAt ? ` · Last activity ${formatTime(conversation.lastActivityAt)}` : ''}
      </div>

      {error && <div role="alert" style={{ color: '#fca5a5', fontSize: '0.78rem', marginBottom: '8px' }}>{error}</div>}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '420px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
        {loading && messages.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '12px 0' }}>Loading messages…</div>
        )}
        {!loading && visibleMessages.length === 0 && !error && (
          <div style={{ color: '#64748b', fontSize: '0.78rem', textAlign: 'center', padding: '12px 0' }}>No messages in this conversation yet.</div>
        )}
        {visibleMessages.map((message) => <MessageBubble key={message.id} message={message} />)}
      </div>

      <div style={{ marginTop: '12px' }}>
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) sendReply();
          }}
          maxLength={REPLY_MAX_LENGTH}
          placeholder="Type a reply to send through Chatwoot…"
          style={{
            width: '100%',
            minHeight: '70px',
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '0.8rem',
            color: '#f8fafc',
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'sans-serif',
            boxSizing: 'border-box',
          }}
        />
        {sendError && <div role="alert" style={{ color: '#fca5a5', fontSize: '0.75rem', marginTop: '6px' }}>{sendError}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Ctrl+Enter to send. The customer receives this message.</span>
          <button
            type="button"
            onClick={sendReply}
            disabled={sending || !draft.trim()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '7px 14px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer',
              opacity: sending || !draft.trim() ? 0.55 : 1,
            }}
          >
            <Send size={13} /> {sending ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The Chatwoot tab: the account's conversations with their status and full
 * history, answered without leaving the dashboard.
 */
export default function ChatwootInbox() {
  const [status, setStatus] = useState('');
  const [state, setState] = useState({
    loading: true, error: '', configured: true, conversations: [], hasMore: false,
  });
  const [selectedId, setSelectedId] = useState(null);
  // Unsent replies, kept per conversation so switching to another chat and
  // back does not throw away what the agent was typing.
  const [drafts, setDrafts] = useState({});

  // page 1 replaces the list; a later page is added to the end, so "Load more"
  // reaches conversations past Chatwoot's first page. `quiet` is the
  // background poll, which must not flash the spinner over a list in use.
  const loadPage = useCallback(async (page, { quiet = false } = {}) => {
    if (!quiet) setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const response = await adminFetch(
        `/api/admin/chatwoot?status=${encodeURIComponent(status)}&page=${page}`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load Chatwoot conversations.');
      const batch = Array.isArray(data.conversations) ? data.conversations : [];
      setState((prev) => {
        const conversations = page > 1 ? [...prev.conversations, ...batch] : batch;
        return {
          loading: false,
          error: '',
          configured: data.configured !== false,
          conversations,
          hasMore: batch.length > 0,
        };
      });
      // The open conversation stays open. Only a first load, or a filter that
      // dropped it from the list, moves the selection.
      setSelectedId((prev) => {
        if (!prev) return batch[0]?.id ?? null;
        if (quiet || page > 1) return prev;
        return batch.some((conversation) => conversation.id === prev) ? prev : (batch[0]?.id ?? null);
      });
      return page;
    } catch (error) {
      if (!quiet) {
        setState((prev) => ({ ...prev, loading: false, error: error.message || 'Could not load Chatwoot conversations.' }));
      }
      return null;
    }
  }, [status]);

  const [page, setPage] = useState(1);
  const load = useCallback(() => {
    setPage(1);
    return loadPage(1);
  }, [loadPage]);

  // Reloads from the first page whenever the status filter changes.
  useEffect(() => { setPage(1); loadPage(1); }, [loadPage]);

  // Keeps the list current while the dashboard is on screen. It only runs on
  // page 1: a background reload while "Load more" pages are open would throw
  // those extra conversations away.
  useEffect(() => {
    if (page !== 1) return undefined;
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadPage(1, { quiet: true });
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [loadPage, page]);

  // A sent reply becomes the preview line straight away, rather than waiting
  // for the next refresh.
  const handleSent = useCallback((conversationId, message) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((conversation) => (
        conversation.id === conversationId
          ? { ...conversation, lastMessage: message.content, lastActivityAt: message.createdAt }
          : conversation
      )),
    }));
  }, []);

  const setDraftFor = useCallback((conversationId, value) => {
    setDrafts((prev) => ({ ...prev, [conversationId]: value }));
  }, []);

  const selected = state.conversations.find((conversation) => conversation.id === selectedId) || null;

  return (
    <div className="admin-tab-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => setStatus(value)}
              style={{
                background: status === value ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                color: status === value ? '#38bdf8' : '#94a3b8',
                border: `1px solid ${status === value ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '8px',
                padding: '6px 13px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={state.loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '8px', padding: '6px 11px', fontSize: '0.74rem', cursor: state.loading ? 'wait' : 'pointer' }}
        >
          <RotateCw size={12} /> {state.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {state.error && (
        <div role="alert" style={{ ...panelStyle, padding: '16px', borderColor: 'rgba(248, 113, 113, 0.3)', color: '#fca5a5', fontSize: '0.8rem' }}>
          {state.error}
        </div>
      )}

      {!state.error && !state.loading && !state.configured && (
        <div style={{ ...panelStyle, padding: '16px', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
          Chatwoot is not connected on this server, so conversations can&apos;t be shown.
        </div>
      )}

      {!state.error && state.configured && (
        <div className="chatwoot-inbox-layout">
          <div style={{ ...panelStyle, padding: '8px', maxHeight: '560px', overflowY: 'auto' }}>
            {state.loading && state.conversations.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '16px 0' }}>Loading conversations…</div>
            )}
            {!state.loading && state.conversations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '28px 12px' }}>
                <div style={{ color: '#38bdf8', marginBottom: '8px' }}><MessageCircle size={24} /></div>
                <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '0.86rem' }}>No conversations yet</div>
                <div style={{ color: '#64748b', fontSize: '0.74rem', marginTop: '4px' }}>
                  Nothing in Chatwoot{status ? ` with status "${status}"` : ''}.
                </div>
              </div>
            )}
            {state.conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: conversation.id === selectedId ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  border: `1px solid ${conversation.id === selectedId ? 'rgba(56, 189, 248, 0.25)' : 'transparent'}`,
                  borderRadius: '8px',
                  padding: '10px',
                  marginBottom: '4px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ color: '#f8fafc', fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conversation.contactName || `Conversation #${conversation.id}`}
                  </span>
                  <StatusBadge status={conversation.status} />
                </div>
                {conversation.lastMessage && (
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conversation.lastMessage}
                  </div>
                )}
                <div style={{ color: '#64748b', fontSize: '0.66rem', marginTop: '3px' }}>
                  {conversation.assigneeName || 'Unassigned'}
                  {conversation.lastActivityAt ? ` · ${formatTime(conversation.lastActivityAt)}` : ''}
                  {conversation.unreadCount > 0 ? ` · ${conversation.unreadCount} unread` : ''}
                </div>
              </button>
            ))}
            {state.hasMore && state.conversations.length > 0 && (
              <button
                type="button"
                onClick={() => { const next = page + 1; setPage(next); loadPage(next); }}
                disabled={state.loading}
                style={{ display: 'block', width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', borderRadius: '8px', padding: '8px', fontSize: '0.74rem', cursor: state.loading ? 'wait' : 'pointer', marginTop: '4px' }}
              >
                {state.loading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>

          {selected
            ? (
              <ConversationThread
                key={selected.id}
                conversation={selected}
                draft={drafts[selected.id] || ''}
                onDraftChange={(value) => setDraftFor(selected.id, value)}
                onSent={handleSent}
              />
            )
            : (
              <div style={{ ...panelStyle, padding: '28px 16px', color: '#64748b', fontSize: '0.8rem', textAlign: 'center' }}>
                Pick a conversation on the left to read it and reply.
              </div>
            )}
        </div>
      )}

      <style jsx>{`
        .chatwoot-inbox-layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 14px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .chatwoot-inbox-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
