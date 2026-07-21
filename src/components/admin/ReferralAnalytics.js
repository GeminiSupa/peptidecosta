import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, QrCode, Users, Loader, AlertTriangle, Smartphone, Monitor, Tablet } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
];

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

const money = (usd) => `$${Number(usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReferralAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (range) => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/referral-stats?days=${range}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const cardStyle = { background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', marginBottom: '20px' };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={18} color="#22d3ee" /> Referral &amp; QR performance
        </h3>
        <div style={{ display: 'flex', gap: '6px' }}>
          {RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => setDays(range.days)}
              style={{
                padding: '5px 11px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', borderRadius: '999px',
                background: days === range.days ? 'rgba(34, 211, 238, 0.15)' : 'transparent',
                color: days === range.days ? '#22d3ee' : '#94a3b8',
                border: `1px solid ${days === range.days ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '0.9rem', padding: '20px 0' }}>
          <Loader size={16} className="sync-spinner" /> Loading…
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: '14px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', color: '#fca5a5', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {!loading && !error && data?.migrationRequired && (
        <div style={{ display: 'flex', gap: '10px', padding: '14px 16px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '10px', color: '#fde68a', fontSize: '0.85rem' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>Scan tracking isn&apos;t switched on yet. Run <code style={{ color: '#fbbf24' }}>add-referral-scans.sql</code> against the database, then scans will start recording. Orders already placed still appear below.</span>
        </div>
      )}

      {!loading && !error && !data?.migrationRequired && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '18px' }}>
            {[
              { label: 'Scans', value: data?.totals?.scans ?? 0, icon: QrCode, color: '#22d3ee' },
              { label: 'Orders', value: data?.totals?.orders ?? 0, icon: Users, color: '#10b981' },
              { label: 'Revenue', value: money(data?.totals?.revenueUsd), icon: BarChart3, color: '#f58220' },
            ].map((stat) => (
              <div key={stat.label} style={{ background: 'rgba(15,23,42,0.6)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.75rem', marginBottom: '4px' }}>
                  <stat.icon size={13} color={stat.color} /> {stat.label}
                </div>
                <div style={{ color: '#f8fafc', fontSize: '1.25rem', fontWeight: 800 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {!data?.stats?.length ? (
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: 0 }}>
              Nothing in the last {days} days. Once someone scans a QR or opens a referral link, it shows up here.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '560px' }}>
                <thead>
                  <tr style={{ color: '#94a3b8', textAlign: 'left', fontSize: '0.75rem' }}>
                    <th style={{ padding: '8px 10px' }}>Referral</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Scans</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Orders</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Conv.</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Revenue</th>
                    <th style={{ padding: '8px 10px' }}>Mostly</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.map((row) => {
                    const Icon = DEVICE_ICON[row.topDevice] || Monitor;
                    return (
                      <tr key={row.key} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px' }}>
                          <div style={{ color: '#f8fafc', fontWeight: 700 }}>{row.label}</div>
                          <div style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            {row.kind === 'agent' ? 'Sales agent' : row.kind === 'promo' ? 'Promo code' : 'Referral'}
                          </div>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#e2e8f0' }}>{row.scans || '—'}</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{row.orders}</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: row.conversionRate === null ? '#64748b' : '#e2e8f0' }}
                            title={row.conversionRate === null ? 'No scans recorded for this referral, so a rate cannot be worked out' : ''}>
                          {row.conversionRate === null ? 'n/a' : `${row.conversionRate}%`}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#f58220', fontWeight: 700 }}>{money(row.revenueUsd)}</td>
                        <td style={{ padding: '10px', color: '#94a3b8' }}>
                          {row.topDevice ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}>
                              <Icon size={13} /> {row.topDevice}{row.topCountry ? ` · ${row.topCountry}` : ''}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
