'use client';

/**
 * Requests — the one place things wait for the owner's yes.
 *
 * Order owner changes used to be answered from a panel inside the Orders tab,
 * which meant noticing them depended on being in Orders at the time. They are
 * answered here now, alongside affiliate email changes, and Orders no longer
 * carries its own copy: two lists of the same requests would drift apart the
 * first time one of them was answered.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { formatCrInstant } from '@/lib/crTime.mjs';

const KIND_LABEL = {
  order_owner: 'Order owner',
  affiliate_email: 'Affiliate email',
};

export default function RequestsManager({ onCountChange }) {
  const [requests, setRequests] = useState([]);
  const [migrationsMissing, setMigrationsMissing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/requests');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load requests.');
      setRequests(body.requests || []);
      setMigrationsMissing(body.migrationsMissing || []);
      if (onCountChange) onCountChange((body.requests || []).length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const answer = async (row, decision) => {
    const note = decision === 'reject'
      ? window.prompt('Why are you turning this down? (optional — they will see it)') ?? ''
      : '';
    setBusyId(row.id);
    setError('');
    setNotice('');
    try {
      // Each kind keeps its own rules at its own endpoint; this screen only
      // decides which one to call.
      const url = row.kind === 'order_owner' ? '/api/admin/orders/owner' : '/api/admin/requests';
      const res = await adminFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: row.id, decision, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'That did not work.');
      setNotice(body.message || (decision === 'approve' ? 'Approved.' : 'Rejected.'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p style={{ color: '#94a3b8' }}>Loading requests…</p>;

  return (
    <div style={{ color: '#f8fafc', maxWidth: 900 }}>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 16px', lineHeight: 1.6 }}>
        Anything that needs your yes before it happens. Nothing here has taken effect yet.
      </p>

      {migrationsMissing.length > 0 && (
        <Banner tone="#fbbf24">
          Not everything can be listed yet — run {migrationsMissing.join(' and ')} in Supabase.
        </Banner>
      )}
      {error && <Banner tone="#f87171">{error}</Banner>}
      {notice && <Banner tone="#4ade80">{notice}</Banner>}

      {requests.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
            Nothing is waiting on you.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {requests.map((row) => (
            <div key={row.id} style={card}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: '0.95rem' }}>{row.title}</strong>
                <span style={pill}>{KIND_LABEL[row.kind] || row.kind}</span>
              </div>
              <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6 }}>
                {row.detail}
              </p>
              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.78rem' }}>
                Asked by {row.askedBy} · {formatCrInstant(row.createdAt)}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={approve} disabled={busyId === row.id} onClick={() => answer(row, 'approve')}>
                  {busyId === row.id ? 'Working…' : 'Approve'}
                </button>
                <button style={reject} disabled={busyId === row.id} onClick={() => answer(row, 'reject')}>
                  Turn down
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Banner({ tone, children }) {
  return (
    <div style={{
      border: `1px solid ${tone}`, color: tone, background: 'rgba(255,255,255,0.02)',
      borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: '0.85rem', lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

const card = { background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 };
const pill = { padding: '4px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.12)', whiteSpace: 'nowrap' };
const approve = { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#0e1626', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' };
const reject = { padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.5)', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: '0.85rem' };
