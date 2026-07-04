"use client";

import React, { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import JourneyManager from './JourneyManager';
import {
  Activity, CalendarClock, Loader2, Play, RefreshCw,
  ShoppingCart, Sparkles, Users, Zap, Clock, CheckCircle2,
  Eye, X
} from 'lucide-react';

const STAT_CONFIG = {
  subscribers:     { label: 'Audience',        icon: Users,         color: '#34d399' },
  newSubscribers:  { label: 'New Subscribers',  icon: Sparkles,      color: '#60a5fa' },
  activeCarts:     { label: 'Active Carts',     icon: ShoppingCart,  color: '#fbbf24' },
  newCatalogLeads: { label: 'Catalog Leads',    icon: Zap,           color: '#a78bfa' },
  reorderReady:    { label: 'Reorder Ready',    icon: CalendarClock, color: '#fb923c' },
  winbackReady:    { label: 'Win-Back Pool',    icon: Activity,      color: '#f472b6' },
};

const STATUS_COLOR = {
  ready:    { bg: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'rgba(16,185,129,0.25)' },
  watching: { bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: 'rgba(255,255,255,0.08)' },
};

export default function AutomationStudio() {
  const [summary,     setSummary]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [schedulingId, setSchedulingId] = useState('');
  const [previewFlow,  setPreviewFlow]  = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/admin/automations')
      .then(async res => ({ res, data: await res.json() }))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to load');
        setSummary(data);
      })
      .catch(err => { if (!cancelled) console.error('Failed to load automations:', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res  = await adminFetch('/api/admin/automations');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to load');
      setSummary(data);
    } catch (err) {
      console.error('Failed to load automations:', err);
    } finally {
      setLoading(false);
    }
  };

  const scheduleFlow = async (flow) => {
    if (!confirm(`Schedule "${flow.name}" for the next available run?`)) return;
    try {
      setSchedulingId(flow.id);
      const res  = await adminFetch('/api/admin/automations', { method: 'POST', body: JSON.stringify({ flowId: flow.id }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to schedule');
      await fetchSummary();
      const sent = data.queuedCount ?? 0;
      alert(data.text || `Automation triggered. ${sent} email${sent === 1 ? '' : 's'} sent.`);
    } catch (err) {
      alert('Failed to schedule automation: ' + err.message);
    } finally {
      setSchedulingId('');
    }
  };

  if (loading && !summary) {
    return (
      <div className="mkt-loading-state">
        <Loader2 className="animate-spin" size={28} style={{ color: '#34d399' }} />
        <span>Loading automation opportunities…</span>
      </div>
    );
  }

  const totals    = summary?.totals || {};
  const flows     = summary?.flows || [];
  const scheduled = summary?.scheduledBroadcasts || [];

  return (
    <div className="mkt-automation mkt-fade-in">
      <JourneyManager />
      <hr className="mkt-divider" />
      {/* ── Header ── */}
      <div className="mkt-flex mkt-justify-between mkt-items-center mkt-mb-4">
        <div>
          <h3 className="mkt-title" style={{ fontSize: '1rem' }}>
            <Zap size={18} /> Lifecycle Automations
          </h3>
          <p className="mkt-subtitle">Turn leads, carts, and reorder windows into revenue.</p>
        </div>
        <button onClick={fetchSummary} className="mkt-btn" disabled={loading} aria-label="Refresh automations">
          {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          <span className="mkt-hide-xs">Refresh</span>
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="mkt-stats-grid mkt-mb-4">
        {Object.entries(STAT_CONFIG).map(([key, { label, icon: Icon, color }]) => (
          <div key={key} className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ color, background: `${color}18`, borderColor: `${color}22` }}>
              <Icon size={17} />
            </div>
            <div>
              <div className="mkt-stat-value" style={{ color }}>{totals[key] ?? 0}</div>
              <div className="mkt-stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Flow cards ── */}
      <h4 style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'rgba(255,255,255,0.38)', margin: '0 0 10px' }}>
        Available Flows
      </h4>
      {flows.length === 0 ? (
        <div className="mkt-empty-state">
          <Zap size={36} />
          <h4>No automations available</h4>
          <p>Grow your subscriber list to unlock lifecycle flows.</p>
        </div>
      ) : (
        <div className="mkt-flow-grid">
          {flows.map(flow => {
            const { bg, color, border } = STATUS_COLOR[flow.status] || STATUS_COLOR.watching;
            const isReady = flow.status === 'ready' && flow.opportunities > 0;
            return (
              <div key={flow.id} className="mkt-flow-card">
                <div className="mkt-flow-header">
                  <div>
                    <div className="mkt-panel-kicker">{flow.status === 'ready' ? '● Ready to Run' : '○ Watching'}</div>
                    <h4>{flow.name}</h4>
                  </div>
                  <span style={{ background: bg, color, border: `1px solid ${border}`, borderRadius: '20px', padding: '4px 10px', fontSize: '13px', fontWeight: '900', flexShrink: 0 }}>
                    {flow.opportunities}
                  </span>
                </div>
                <div className="mkt-flow-meta">
                  <span>👥 {flow.audience.replaceAll('_', ' ')}</span>
                  <span>📡 {flow.channel}</span>
                </div>
                <p>{flow.message.split('\n').find(Boolean)}</p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button onClick={() => setPreviewFlow(flow)} className="mkt-btn" style={{ flex: '1 1 auto', padding: '8px', fontSize: '12px' }}>
                    <Eye size={14} /> Preview Message
                  </button>
                  <button
                    onClick={() => scheduleFlow(flow)}
                    disabled={schedulingId === flow.id || !isReady}
                    className={`mkt-btn ${isReady ? 'mkt-btn-primary' : ''}`}
                    style={{ flex: '1 1 auto', padding: '8px', fontSize: '12px' }}
                  >
                    {schedulingId === flow.id ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                    {isReady ? 'Schedule' : 'Waiting'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Scheduled broadcasts table ── */}
      {scheduled.length > 0 && (
        <>
          <hr className="mkt-divider" />
          <h4 style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'rgba(255,255,255,0.38)', margin: '0 0 10px' }}>
            Scheduled Broadcasts
          </h4>
          <div className="mkt-table-wrapper">
            <table className="mkt-table responsive-table">
              <thead>
                <tr>
                  <th>Broadcast</th>
                  <th>Audience</th>
                  <th>Channels</th>
                  <th>Status</th>
                  <th className="mkt-text-right">Run Time</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map(item => (
                  <tr key={item.id}>
                    <td data-label="Broadcast">
                      <div className="mkt-font-medium" style={{ fontSize: '13px' }}>{item.channels?.emailSubject || 'Lifecycle broadcast'}</div>
                      <div className="mkt-text-xs mkt-text-muted">{String(item.message || '').slice(0, 80)}…</div>
                    </td>
                    <td data-label="Audience">{item.audience?.replaceAll('_', ' ')}</td>
                    <td data-label="Channels">
                      {Object.entries(item.channels || {}).filter(([, v]) => v === true).map(([k]) => k).join(', ') || 'email'}
                    </td>
                    <td data-label="Status">
                      <span className="mkt-badge mkt-badge-warning">{item.status}</span>
                    </td>
                    <td data-label="Run Time" className="mkt-text-right">
                      <div className="mkt-flex mkt-items-center mkt-justify-end mkt-gap-1" style={{ fontSize: '12px' }}>
                        <Clock size={12} style={{ color: 'rgba(255,255,255,0.35)' }} />
                        {new Date(item.scheduled_at).toLocaleString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {/* ── Preview Modal ── */}
      {previewFlow && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', padding: '20px' }}
          onClick={() => setPreviewFlow(null)}
        >
          <div
            style={{ background: '#111827', borderRadius: '16px', width: '100%', maxWidth: '500px', padding: '28px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="mkt-title" style={{ fontSize: '1.1rem', margin: 0 }}>
                {previewFlow.name} Preview
              </h3>
              <button onClick={() => setPreviewFlow(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Subject Line:</div>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#fff', marginBottom: '16px' }}>{previewFlow.subject}</div>
              
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Message Body:</div>
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                {previewFlow.message}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setPreviewFlow(null)} className="mkt-btn mkt-flex-1">Close</button>
              <button 
                onClick={() => { scheduleFlow(previewFlow); setPreviewFlow(null); }} 
                className="mkt-btn mkt-btn-primary mkt-flex-1"
                disabled={previewFlow.status !== 'ready' || previewFlow.opportunities === 0}
              >
                Schedule Flow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
