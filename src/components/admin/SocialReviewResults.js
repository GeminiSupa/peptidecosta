'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';

/**
 * What the review requests have actually achieved.
 *
 * A click is the strongest signal that exists here: nobody can see whether a
 * review was written, and a Trustpilot invitation cannot be tracked at all
 * because Trustpilot sends that email. The screen says so rather than showing a
 * confident zero, which would read as "nobody clicked" when the truth is "we
 * cannot know".
 */

const card = {
  background: '#0e1626',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px',
};

const muted = { fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 };

function Stat({ label, value, sub, tone }) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: '140px' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: tone || '#f8fafc', lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, marginTop: '2px' }}>{label}</div>
      {sub ? <div style={{ ...muted, marginTop: '3px' }}>{sub}</div> : null}
    </div>
  );
}

const shortDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
};

export default function SocialReviewResults() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/reviews/stats');
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Could not load the results');
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ ...card, color: '#94a3b8' }}>Loading results…</div>;
  if (error) {
    return (
      <div style={{ ...card, color: '#fca5a5' }}>
        {error}
        <button type="button" onClick={load} style={{ marginLeft: 10, background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Retry</button>
      </div>
    );
  }
  if (!data?.available) {
    return (
      <div style={{ ...card, color: '#fde68a' }}>
        {data?.reason || 'The review history is not available yet.'}
      </div>
    );
  }

  const { totals, bySite, flagged, flaggedTotal, recent, trustpilotThisMonth, trustpilotCap } = data;
  const capUsedUp = trustpilotCap > 0 && trustpilotThisMonth >= trustpilotCap;

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: 0 }}>Results</h3>
          <button
            type="button" onClick={load}
            style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8', borderRadius: 8, padding: '5px 12px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Refresh
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          <Stat label="Requests sent" value={totals.asks} sub={`${totals.customers} customers`} />
          <Stat
            label="Clicks"
            value={totals.clicks}
            tone={totals.clicks > 0 ? '#4ade80' : undefined}
            sub={`out of ${totals.trackableAsks} we can measure`}
          />
          <Stat
            label="Click rate"
            value={totals.clickRatePct === null ? '—' : `${totals.clickRatePct}%`}
            sub="Google and Facebook only"
          />
          <Stat
            label="Trustpilot this month"
            value={`${trustpilotThisMonth}/${trustpilotCap}`}
            tone={capUsedUp ? '#fbbf24' : undefined}
            sub={capUsedUp ? 'Full — everyone goes to Google or Facebook' : 'Room left this month'}
          />
        </div>

        <p style={{ ...muted, marginTop: '16px', marginBottom: 0 }}>
          A click means the customer opened the review page. Whether they actually left a
          review is not something any of these sites report back. Trustpilot invitations are
          sent by Trustpilot, so their clicks cannot be counted at all.
        </p>
      </div>

      <div style={card}>
        <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: '0 0 14px' }}>By site</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
          {[
            { id: 'google', label: 'Google' },
            { id: 'facebook', label: 'Facebook' },
            { id: 'trustpilot', label: 'Trustpilot' },
          ].map(({ id, label }) => {
            const site = bySite[id] || { asked: 0, clicked: 0 };
            const rate = site.clicked === null || !site.asked
              ? null
              : Math.round((site.clicked / site.asked) * 1000) / 10;
            return (
              <div key={id} style={{ flex: '1 1 160px', minWidth: '160px', background: 'rgba(148,163,184,0.05)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>{label}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f8fafc' }}>{site.asked}</div>
                <div style={{ ...muted }}>requests sent</div>
                <div style={{ marginTop: '8px', fontSize: '0.85rem', color: site.clicked === null ? '#64748b' : '#4ade80' }}>
                  {site.clicked === null ? 'clicks not measurable' : `${site.clicked} clicks${rate === null ? '' : ` · ${rate}%`}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={card}>
        <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: '0 0 6px' }}>
          Customers who ignored every request
          {flaggedTotal > 0 && (
            <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>{flaggedTotal}</span>
          )}
        </h3>
        <p style={{ ...muted, marginTop: 0, marginBottom: '12px' }}>
          Asked the maximum number of times without ever clicking. They are no longer
          sent review requests. Trustpilot requests are not counted here, because a click
          on one of those would never have been visible.
        </p>
        {flaggedTotal === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.88rem' }}>Nobody yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Ignored</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Last asked</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((f) => (
                  <tr key={f.email} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#cbd5e1' }}>
                    <td style={{ padding: '7px 8px' }}>{f.email}</td>
                    <td style={{ padding: '7px 8px', color: '#fbbf24', fontWeight: 700 }}>{f.ignored}</td>
                    <td style={{ padding: '7px 8px', color: '#94a3b8' }}>{shortDate(f.lastAskedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ color: '#f8fafc', fontSize: '1rem', margin: '0 0 12px' }}>Recent requests</h3>
        {recent.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.88rem' }}>No requests sent yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Order</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Asked for</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Sent</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>Clicked</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={`${r.email}-${r.askedAt}-${i}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#cbd5e1' }}>
                    <td style={{ padding: '7px 8px' }}>{r.email}</td>
                    <td style={{ padding: '7px 8px', color: '#94a3b8' }}>{r.orderNumber || '—'}</td>
                    <td style={{ padding: '7px 8px', textTransform: 'capitalize' }}>{(r.platforms || []).join(', ') || '—'}</td>
                    <td style={{ padding: '7px 8px', color: '#94a3b8' }}>{shortDate(r.askedAt)}</td>
                    <td style={{ padding: '7px 8px' }}>
                      {r.clicked
                        ? <span style={{ color: '#4ade80', fontWeight: 700, textTransform: 'capitalize' }}>{r.clicked}</span>
                        : <span style={{ color: '#64748b' }}>{(r.platforms || []).includes('trustpilot') ? 'not measurable' : '—'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
