'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { formatCrDate } from '@/lib/crTime.mjs';

/**
 * Handing back the Trustpilot invitations Trustpilot never delivered.
 *
 * Between July and August 2026 the order-complete email BCC'd 643 invitations
 * against a plan that delivers 50 a month. The ask history then recorded all
 * 643 as "this customer has been asked", so 286 customers who never received
 * anything are permanently barred from ever being invited.
 *
 * Releasing clears that phantom mark. It sends no email: the customer becomes
 * eligible again and the invitation rides out on their next completed order,
 * through the same BCC as everyone else's, still inside the monthly cap.
 */

const card = {
  background: '#0e1626',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px',
};

const muted = { fontSize: '0.78rem', color: '#64748b', lineHeight: 1.55 };

const monthName = (key) => {
  const [y, m] = String(key || '').split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m) - 1] || key} ${y}`;
};

const shortDate = (iso) => formatCrDate(iso, { day: 'numeric', month: 'short' }) || '—';

export default function TrustpilotRecoveryCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [batch, setBatch] = useState('');
  const [pastAllowance, setPastAllowance] = useState('50');
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async (allowance) => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(`/api/admin/reviews/recovery?pastAllowance=${encodeURIComponent(allowance)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not work out what was lost');
      setData(body);
      setBatch(String(body?.suggestedBatch ?? 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(pastAllowance); }, [load, pastAllowance]);

  const release = async () => {
    setReleasing(true);
    setNotice(null);
    try {
      const res = await adminFetch('/api/admin/reviews/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: Number(batch) || 0, pastAllowance: Number(pastAllowance) || 50 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not release them');
      setNotice({ tone: 'ok', text: body.message });
      await load(pastAllowance);
    } catch (err) {
      setNotice({ tone: 'error', text: err.message });
    } finally {
      setReleasing(false);
    }
  };

  if (loading) return <div style={{ ...card, color: '#94a3b8' }}>Working out what Trustpilot never received…</div>;

  if (error) {
    return (
      <div style={{ ...card, color: '#fca5a5' }}>
        {error}
        <button
          type="button" onClick={() => load(pastAllowance)}
          style={{ marginLeft: 10, background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data?.available) {
    return <div style={{ ...card, color: '#fde68a' }}>{data?.reason || 'The review history is not available yet.'}</div>;
  }

  const { totals, months, readyCount, waitingCount, roomLeft, currentAllowance, canRelease, migrationNeeded, preview } = data;
  const nothingToDo = readyCount === 0;

  return (
    <div style={card}>
      <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: '0 0 6px' }}>
        Invitations Trustpilot never delivered
        {totals.stillBlocked > 0 && (
          <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>{totals.stillBlocked}</span>
        )}
      </h3>
      <p style={{ ...muted, marginTop: 0, marginBottom: '16px' }}>
        Trustpilot only delivers so many invitations a month and silently drops the rest — no
        bounce, no warning. Every dropped one was still recorded here as &ldquo;this customer has
        been asked&rdquo;, which bars them from Trustpilot for good. Releasing clears that mark.
        <strong style={{ color: '#cbd5e1' }}> Nobody is emailed by releasing</strong>: the invitation goes
        out on their next completed order, inside the monthly limit like every other.
      </p>

      {/* Month by month: the arithmetic in the open, because the delivered /
          not-delivered split is an inference from the allowance, not a record
          Trustpilot gives us. */}
      <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: '#64748b', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Month</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>We sent</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Plan allowed</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Never delivered</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Still blocked</th>
            </tr>
          </thead>
          <tbody>
            {months.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '10px 8px', color: '#64748b' }}>No Trustpilot invitations on record.</td></tr>
            ) : months.map((m) => (
              <tr key={m.month} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#cbd5e1' }}>
                <td style={{ padding: '7px 8px' }}>
                  {monthName(m.month)}
                  {m.isCurrentMonth && <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#38bdf8' }}>this month</span>}
                </td>
                <td style={{ padding: '7px 8px', textAlign: 'right' }}>{m.sent}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: '#94a3b8' }}>{m.allowance}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: m.undelivered ? '#fca5a5' : '#64748b', fontWeight: m.undelivered ? 700 : 400 }}>{m.undelivered}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: m.stillBlocked ? '#fbbf24' : '#4ade80', fontWeight: 700 }}>{m.stillBlocked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: readyCount ? '#fbbf24' : '#4ade80', lineHeight: 1.15 }}>{readyCount}</div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>customers we can free up</div>
        </div>
        <div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#cbd5e1', lineHeight: 1.15 }}>{roomLeft}</div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>invitations left this month</div>
          <div style={muted}>of {currentAllowance}</div>
        </div>
        {waitingCount > 0 && (
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#64748b', lineHeight: 1.15 }}>{waitingCount}</div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>held by the re-ask gap</div>
            <div style={muted}>asked on Google or Facebook recently</div>
          </div>
        )}
      </div>

      {!canRelease && (
        <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', fontSize: '0.85rem', color: '#fde68a', lineHeight: 1.55 }}>
          Run <strong>{migrationNeeded}</strong> in the Supabase SQL editor first. It adds the column
          that records a release; without it there is nowhere to write one, so the button is off.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Release how many
          </label>
          <input
            type="number" min="0" max={readyCount}
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            style={{ width: '120px', padding: '8px 11px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#0b1220', color: '#f8fafc', fontSize: '0.92rem' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Allowance back then
          </label>
          <input
            type="number" min="0"
            value={pastAllowance}
            onChange={(e) => setPastAllowance(e.target.value)}
            style={{ width: '120px', padding: '8px 11px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#0b1220', color: '#f8fafc', fontSize: '0.92rem' }}
          />
        </div>
        <button
          type="button"
          onClick={release}
          disabled={releasing || nothingToDo || !canRelease}
          style={{
            padding: '9px 18px', fontSize: '0.88rem', borderRadius: '8px', fontWeight: 700,
            background: (releasing || nothingToDo || !canRelease) ? 'rgba(148,163,184,0.12)' : 'rgba(74,222,128,0.12)',
            border: `1px solid ${(releasing || nothingToDo || !canRelease) ? 'rgba(255,255,255,0.1)' : 'rgba(74,222,128,0.3)'}`,
            color: (releasing || nothingToDo || !canRelease) ? '#64748b' : '#4ade80',
            cursor: (releasing || nothingToDo || !canRelease) ? 'default' : 'pointer',
          }}
        >
          {releasing ? 'Releasing…' : nothingToDo ? 'Nobody left to release' : `Release ${Number(batch) || 0}`}
        </button>
        {readyCount > 0 && (
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            style={{ padding: '9px 14px', fontSize: '0.82rem', borderRadius: '8px', fontWeight: 600, background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', cursor: 'pointer' }}
          >
            {showPreview ? 'Hide' : 'Who first?'}
          </button>
        )}
        {notice && (
          <span style={{ fontSize: '0.85rem', color: notice.tone === 'ok' ? '#4ade80' : '#fca5a5', flex: '1 1 220px' }}>
            {notice.text}
          </span>
        )}
      </div>

      <p style={{ ...muted, marginTop: '12px', marginBottom: 0 }}>
        <strong style={{ color: '#94a3b8' }}>Allowance back then</strong> is what your Trustpilot plan
        delivered per month during those months — 50 on the free plan, 100 on Starter. It decides where the
        line falls between the invitations that went out and the ones that did not, so if the plan changed
        mid-way the split is an estimate. Newest customers are released first: their purchase is freshest,
        and it is their next order that carries the invitation.
      </p>

      {showPreview && preview?.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
          <div style={{ ...muted, marginBottom: '6px' }}>First in the queue:</div>
          {preview.map((p) => (
            <div key={p.email} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 0', fontSize: '0.84rem', color: '#cbd5e1' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>
              <span style={{ color: '#64748b', flexShrink: 0 }}>{p.orderNumber ? `#${p.orderNumber} · ` : ''}{shortDate(p.lastAskedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
