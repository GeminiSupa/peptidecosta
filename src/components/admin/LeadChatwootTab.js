"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, RotateCw, Send, Lock } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const STATUS_STYLES = {
  open: { label: 'Open', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' },
  pending: { label: 'Pending', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
  snoozed: { label: 'Snoozed', color: '#c4b5fd', background: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)' },
  resolved: { label: 'Resolved', color: '#4ade80', background: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)' },
};

const REPLY_MAX_LENGTH = 4000;

const panelStyle = {
  background: 'rgba(255,255,255,0.02)',
  padding: '16px',
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
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '0.7rem',
      fontWeight: 'bold',
      textTransform: 'uppercase',
      display: 'inline-block',
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

  const fromLead = message.kind === 'incoming';
  const background = message.private
    ? 'rgba(245, 158, 11, 0.1)'
    : (fromLead ? 'rgba(255,255,255,0.05)' : 'rgba(56, 189, 248, 0.12)');
  const border = message.private
    ? 'rgba(245, 158, 11, 0.3)'
    : (fromLead ? 'rgba(255,255,255,0.08)' : 'rgba(56, 189, 248, 0.25)');

  return (
    <div style={{ display: 'flex', justifyContent: fromLead ? 'flex-start' : 'flex-end' }}>
      <div style={{ maxWidth: '85%', background, border: `1px solid ${border}`, borderRadius: '10px', padding: '8px 11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.67rem', color: '#94a3b8', marginBottom: '3px' }}>
          {message.private && <Lock size={10} />}
          <span style={{ fontWeight: 700 }}>
            {message.senderName || (fromLead ? 'Lead' : 'Agent')}
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

function ConversationCard({ leadId, conversation, onSent }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const sendReply = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError('');
    try {
      const response = await adminFetch('/api/admin/leads/chatwoot', {
        method: 'POST',
        body: JSON.stringify({ leadId, conversationId: conversation.id, content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send the reply.');
      setDraft('');
      onSent(conversation.id, data.message);
    } catch (error) {
      setSendError(error.message || 'Could not send the reply.');
    } finally {
      setSending(false);
    }
  };

  const visibleMessages = conversation.messages.filter((message) => (
    message.content || message.attachments.length
  ));

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc' }}>Conversation #{conversation.id}</span>
          <StatusBadge status={conversation.status} />
        </div>
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
      <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '10px' }}>
        {conversation.assigneeName ? `Assigned to ${conversation.assigneeName}` : 'Unassigned'}
        {conversation.lastActivityAt ? ` · Last activity ${formatTime(conversation.lastActivityAt)}` : ''}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
        {visibleMessages.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.78rem', textAlign: 'center', padding: '12px 0' }}>No messages in this conversation yet.</div>
        ) : visibleMessages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <div style={{ marginTop: '12px' }}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
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
        {sendError && (
          <div role="alert" style={{ color: '#fca5a5', fontSize: '0.75rem', marginTop: '6px' }}>{sendError}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
            Ctrl+Enter to send. The lead receives this message.
          </span>
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
 * The Chatwoot tab of the Lead Profile: the lead's Chatwoot conversations,
 * each with its status, full history and a reply box.
 */
export default function LeadChatwootTab({ lead }) {
  const leadId = lead?.id;
  const [state, setState] = useState({ loading: true, error: '', configured: true, conversations: [] });

  const load = useCallback(async () => {
    if (!leadId) return;
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const response = await adminFetch(`/api/admin/leads/chatwoot?leadId=${encodeURIComponent(leadId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load Chatwoot conversations.');
      setState({
        loading: false,
        error: '',
        configured: data.configured !== false,
        conversations: Array.isArray(data.conversations) ? data.conversations : [],
      });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message || 'Could not load Chatwoot conversations.' }));
    }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  const handleSent = (conversationId, message) => {
    if (!message) return;
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((conversation) => (
        conversation.id === conversationId
          ? { ...conversation, messages: [...conversation.messages, message] }
          : conversation
      )),
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', margin: 0, letterSpacing: '0.05em' }}>
          Chatwoot Conversations
        </h3>
        <button
          type="button"
          onClick={load}
          disabled={state.loading}
          title="Reload from Chatwoot"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '8px', padding: '5px 10px', fontSize: '0.72rem', cursor: state.loading ? 'wait' : 'pointer' }}
        >
          <RotateCw size={12} /> {state.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {state.error && (
        <div role="alert" style={{ ...panelStyle, borderColor: 'rgba(248, 113, 113, 0.3)', color: '#fca5a5', fontSize: '0.8rem' }}>
          {state.error}
        </div>
      )}

      {!state.error && state.loading && state.conversations.length === 0 && (
        <div style={{ ...panelStyle, color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>Loading conversations from Chatwoot…</div>
      )}

      {!state.error && !state.loading && !state.configured && (
        <div style={{ ...panelStyle, color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
          Chatwoot is not connected on this server, so conversations can&apos;t be shown.
        </div>
      )}

      {!state.error && !state.loading && state.configured && state.conversations.length === 0 && (
        <div style={{ ...panelStyle, textAlign: 'center', padding: '28px 16px' }}>
          <div style={{ color: '#38bdf8', marginBottom: '8px' }}><MessageCircle size={26} /></div>
          <div style={{ color: '#f8fafc', fontWeight: 800, fontSize: '0.9rem' }}>No conversations yet</div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
            This lead doesn&apos;t have a Chatwoot conversation.
          </div>
        </div>
      )}

      {state.conversations.map((conversation) => (
        <ConversationCard
          key={conversation.id}
          leadId={leadId}
          conversation={conversation}
          onSent={handleSent}
        />
      ))}
    </div>
  );
}
