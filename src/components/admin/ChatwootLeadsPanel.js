"use client";

import React, { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, MessagesSquare } from 'lucide-react';
import { leadEmail, leadName, leadPhone } from '@/lib/leadContact.mjs';
import { formatCrDate } from '@/lib/crTime.mjs';
import {
  adLandingPageLabel,
  chatwootNeedsAttention,
  chatwootStatusView,
  isAdLandingLead,
} from '@/lib/adLandingLeads.mjs';

// Every Google Ads lead (/lp, /glp-1) in one list: who they are, which agent got
// them, and whether their Chatwoot chat was actually created. Before this the
// Chatwoot result only reached the Vercel logs, so a failed chat was invisible.

const TONES = {
  ok: { color: '#22c55e', background: 'rgba(34, 197, 94, 0.12)' },
  warn: { color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)' },
  bad: { color: '#ef4444', background: 'rgba(239, 68, 68, 0.14)' },
  muted: { color: '#94a3b8', background: 'rgba(148, 163, 184, 0.12)' },
};

const cell = { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' };

export default function ChatwootLeadsPanel({ leads = [], getLeadOwner, onOpenLead, limit = 100 }) {
  const adLeads = useMemo(() => (leads || [])
    .filter(isAdLandingLead)
    .sort((a, b) => new Date(b.last_enquiry_at || b.created_at) - new Date(a.last_enquiry_at || a.created_at)),
  [leads]);
  const problemCount = useMemo(() => adLeads.filter(chatwootNeedsAttention).length, [adLeads]);
  const createdCount = useMemo(
    () => adLeads.filter((lead) => chatwootStatusView(lead).tone === 'ok').length,
    [adLeads],
  );

  const [open, setOpen] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const shown = (onlyProblems ? adLeads.filter(chatwootNeedsAttention) : adLeads).slice(0, limit);

  if (!adLeads.length) return null;

  return (
    <section style={{ marginBottom: '16px', border: `1px solid ${problemCount ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '12px', background: 'rgba(15, 23, 42, 0.45)' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px 16px', background: 'transparent', border: 'none', color: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}
      >
        <MessagesSquare size={16} color="#38bdf8" />
        <strong style={{ fontSize: '0.92rem' }}>Google Ads leads → Chatwoot</strong>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          {adLeads.length} lead{adLeads.length === 1 ? '' : 's'} · {createdCount} chat{createdCount === 1 ? '' : 's'} created
        </span>
        {problemCount > 0 && (
          <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', ...TONES.bad }}>
            {problemCount} need attention
          </span>
        )}
        <ChevronDown size={16} style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} />
            Only show leads that need attention
          </label>
          {shown.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Nothing needs attention.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', color: '#e2e8f0', minWidth: '720px' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
                    <th style={cell}>Date (CR)</th>
                    <th style={cell}>Page</th>
                    <th style={cell}>Name</th>
                    <th style={cell}>Email</th>
                    <th style={cell}>Phone</th>
                    <th style={cell}>Agent</th>
                    <th style={cell}>Chatwoot</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((lead) => {
                    const status = chatwootStatusView(lead);
                    const owner = getLeadOwner ? getLeadOwner(lead) : (lead.sales_agent || 'Unassigned');
                    return (
                      <tr key={lead.id}>
                        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                          {formatCrDate(lead.last_enquiry_at || lead.created_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                        </td>
                        <td style={cell}>{adLandingPageLabel(lead)}</td>
                        <td style={cell}>
                          {onOpenLead ? (
                            <button type="button" onClick={() => onOpenLead(lead)} style={{ background: 'none', border: 'none', padding: 0, color: '#7dd3fc', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
                              {leadName(lead) || 'No name'}
                            </button>
                          ) : (leadName(lead) || 'No name')}
                        </td>
                        <td style={{ ...cell, wordBreak: 'break-all' }}>{leadEmail(lead) || '—'}</td>
                        <td style={{ ...cell, whiteSpace: 'nowrap' }}>{leadPhone(lead) || '—'}</td>
                        <td style={{ ...cell, fontWeight: 600, color: owner === 'Unassigned' ? '#f59e0b' : '#f8fafc' }}>{owner}</td>
                        <td style={cell}>
                          <span style={{ display: 'inline-block', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', ...TONES[status.tone] }}>
                            {status.text}
                          </span>
                          {lead.chatwoot_conversation_url && (
                            <a href={lead.chatwoot_conversation_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '6px', color: '#7dd3fc', whiteSpace: 'nowrap' }}>
                              Open <ExternalLink size={11} style={{ verticalAlign: '-1px' }} />
                            </a>
                          )}
                          {status.detail && (
                            <div style={{ color: '#94a3b8', fontSize: '0.74rem', marginTop: '3px' }}>{status.detail}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
