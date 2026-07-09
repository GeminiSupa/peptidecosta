'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, RefreshCw, ArrowDownLeft, ArrowUpRight, Megaphone, Receipt } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: '30 days' },
];

const QUALITY_COLOR = {
  GREEN: '#22c55e',
  YELLOW: '#eab308',
  RED: '#ef4444',
  UNKNOWN: '#64748b',
};

function Kpi({ icon: Icon, label, value, color, hint }) {
  return (
    <div style={{ flex: '1 1 120px', minWidth: 120, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: color || '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        <Icon size={14} /> {label}
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default function WhatsAppAnalyticsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('today');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/whatsapp-analytics');
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch (e) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const p = data?.periods?.[period];
  const quality = data?.quality;
  const qColor = QUALITY_COLOR[quality?.rating] || QUALITY_COLOR.UNKNOWN;

  return (
    <div style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} style={{ color: '#25D366' }} />
          <span style={{ fontWeight: 800, color: '#f8fafc', fontSize: '1rem' }}>WhatsApp Message Analytics</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Live number quality */}
          {quality && (
            <span title="Live number quality from Meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: qColor, background: `${qColor}22`, border: `1px solid ${qColor}55`, borderRadius: 20, padding: '4px 10px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: qColor, display: 'inline-block' }} />
              {quality.rating}{quality.tier ? ` · ${quality.tier}` : ''}
            </span>
          )}
          <button type="button" onClick={load} title="Refresh" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem' }}>
            <RefreshCw size={13} className={loading ? 'spinner' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {PERIODS.map((pd) => (
          <button
            key={pd.id}
            type="button"
            onClick={() => setPeriod(pd.id)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              border: '1px solid ' + (period === pd.id ? '#25D366' : 'rgba(255,255,255,0.1)'),
              background: period === pd.id ? 'rgba(37,211,102,0.15)' : 'transparent',
              color: period === pd.id ? '#25D366' : '#94a3b8',
            }}
          >
            {pd.label}
          </button>
        ))}
      </div>

      {error ? (
        <div style={{ color: '#f87171', fontSize: '0.85rem', padding: '8px 0' }}>{error}</div>
      ) : loading && !data ? (
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px 0' }}>Loading analytics…</div>
      ) : p ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Kpi icon={ArrowDownLeft} label="Inbound" value={p.inbound.toLocaleString()} color="#38bdf8" hint="Messages received" />
            <Kpi icon={ArrowUpRight} label="Outbound" value={p.outbound.toLocaleString()} color="#a78bfa" hint="Messages sent" />
            <Kpi icon={Megaphone} label="Marketing" value={p.marketing.toLocaleString()} color="#fb923c" hint="Studio campaigns" />
            <Kpi icon={Receipt} label="Other outbound" value={p.transactional.toLocaleString()} color="#4ade80" hint="Non-campaign" />
            <Kpi
              icon={Activity}
              label="Out : In ratio"
              value={p.ratio === null ? '—' : `${p.ratio}×`}
              color={p.ratio !== null && p.ratio >= 5 ? '#f87171' : '#94a3b8'}
              hint={p.ratio === null ? 'No inbound yet' : 'Sent per received'}
            />
          </div>

          <div style={{ marginTop: 10, fontSize: '0.7rem', color: '#64748b' }}>
            &ldquo;Marketing&rdquo; counts Marketing Studio campaign deliveries only. Manual broadcasts currently fall under &ldquo;Other outbound.&rdquo;
          </div>

          {/* Warnings */}
          {Array.isArray(data.warnings) && data.warnings.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.warnings.map((w, i) => {
                const c = w.level === 'critical' ? '#ef4444' : '#eab308';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: `${c}18`, border: `1px solid ${c}55`, borderRadius: 10, padding: '8px 12px', color: '#f8fafc', fontSize: '0.8rem' }}>
                    <AlertTriangle size={16} style={{ color: c, flexShrink: 0 }} />
                    {w.text}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
