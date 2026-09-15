'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { formatCrInstant } from '@/lib/crTime.mjs';

/**
 * Owner change requests waiting on a superadmin, shown above the orders table.
 *
 * Renders nothing when there is nothing to answer, so it costs the page no
 * space on an ordinary day.
 */
export default function OwnerRequestsPanel({ orders = [], refreshKey = 0, onOrderUpdated, onOpenOrder }) {
  const [requests, setRequests] = useState([]);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await adminFetch('/api/admin/orders/owner');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load owner change requests.');
      setRequests(data.requests || []);
      setMigrationMissing(Boolean(data.migrationMissing));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const answer = async (ownerRequest, decision) => {
    let note = '';
    if (decision === 'reject') {
      const typed = window.prompt('Optional: say why. The person who asked will see this.', '');
      if (typed === null) return;
      note = typed;
    }
    setBusyId(ownerRequest.id);
    setError('');
    try {
      const response = await adminFetch('/api/admin/orders/owner', {
        method: 'PATCH',
        body: JSON.stringify({ requestId: ownerRequest.id, decision, note }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.order) onOrderUpdated?.(data.order);
      if (!response.ok) {
        setError(data.error || 'Could not save your answer.');
        if (response.status === 409 || response.status === 404) await load();
        return;
      }
      setRequests((current) => current.filter((row) => row.id !== ownerRequest.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  if (migrationMissing) {
    return (
      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#fbbf24' }}>
        Owner change requests are off until add-order-owner-guard.sql is run in Supabase.
      </p>
    );
  }
  if (requests.length === 0 && !error) return null;

  return (
    <section
      aria-labelledby="owner-requests-title"
      style={{
        border: '1px solid rgba(251, 191, 36, 0.35)', background: 'rgba(251, 191, 36, 0.06)',
        borderRadius: '10px', padding: '12px 14px', marginBottom: '16px',
      }}
    >
      <h4 id="owner-requests-title" style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#fbbf24' }}>
        Owner change requests ({requests.length})
      </h4>
      {error && (
        <p role="alert" style={{ color: '#fca5a5', margin: '0 0 8px', fontSize: '0.82rem' }}>{error}</p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
        {requests.map((row) => {
          const order = orders.find((candidate) => candidate.id === row.order_id);
          const busy = busyId === row.id;
          return (
            <li
              key={row.id}
              style={{
                display: 'flex', flexWrap: 'wrap', gap: '8px 12px', alignItems: 'center',
                justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '8px', padding: '10px 12px',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 260px', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                <button
                  type="button"
                  onClick={() => order && onOpenOrder?.(order)}
                  disabled={!order}
                  style={{ background: 'none', border: 'none', padding: 0, color: '#93c5fd', fontWeight: 800, cursor: order ? 'pointer' : 'default' }}
                >
                  #{row.order_number || 'order'}
                </button>
                {order?.customer_name ? ` · ${order.customer_name}` : ''}
                <div>
                  <strong style={{ color: '#e2e8f0' }}>{row.from_agent || 'Unassigned'} → {row.to_agent}</strong>
                  {' · asked by '}{row.requested_by_name || row.requested_by_email || 'a team member'}
                  {' · '}{formatCrInstant(row.created_at)}
                </div>
                <div style={{ color: '#94a3b8', overflowWrap: 'anywhere' }}>“{row.reason}”</div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className="admin-btn admin-btn-primary" disabled={busy} onClick={() => answer(row, 'approve')}>
                  Approve
                </button>
                <button type="button" className="admin-btn admin-btn-secondary" disabled={busy} onClick={() => answer(row, 'reject')}>
                  Reject
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
