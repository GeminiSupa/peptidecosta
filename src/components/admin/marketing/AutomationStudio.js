"use client";

import React, { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { Activity, CalendarClock, Loader2, Play, RefreshCw, ShoppingCart, Sparkles, Users, Zap } from 'lucide-react';

const statIcons = {
  subscribers: Users,
  newSubscribers: Sparkles,
  activeCarts: ShoppingCart,
  newCatalogLeads: Zap,
  reorderReady: CalendarClock,
  winbackReady: Activity
};

const statLabels = {
  subscribers: 'Subscribed Audience',
  newSubscribers: 'New Subscribers',
  activeCarts: 'Active Carts',
  newCatalogLeads: 'New Catalog Leads',
  reorderReady: 'Ready To Reorder',
  winbackReady: 'Win-Back Pool'
};

export default function AutomationStudio() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schedulingId, setSchedulingId] = useState('');

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await adminFetch('/api/admin/automations');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to load automations');
      setSummary(data);
    } catch (err) {
      alert('Failed to load automations: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const scheduleFlow = async (flow) => {
    if (!confirm(`Schedule "${flow.name}" for the next available run?`)) return;

    try {
      setSchedulingId(flow.id);
      const res = await adminFetch('/api/admin/automations', {
        method: 'POST',
        body: JSON.stringify({ flowId: flow.id })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to schedule flow');
      await fetchSummary();
      alert('Automation scheduled successfully.');
    } catch (err) {
      alert('Failed to schedule automation: ' + err.message);
    } finally {
      setSchedulingId('');
    }
  };

  if (loading && !summary) {
    return (
      <div className="mkt-loading-state">
        <Loader2 className="animate-spin" size={28} />
        <span>Loading automation opportunities...</span>
      </div>
    );
  }

  const totals = summary?.totals || {};
  const flows = summary?.flows || [];
  const scheduled = summary?.scheduledBroadcasts || [];

  return (
    <div className="mkt-automation">
      <div className="mkt-flex mkt-justify-between mkt-items-center mkt-mb-6">
        <div>
          <h3 className="mkt-title">
            <Zap />
            Lifecycle Automations
          </h3>
          <p className="mkt-subtitle">Turn leads, carts, and reorder windows into scheduled revenue plays.</p>
        </div>
        <button onClick={fetchSummary} className="mkt-btn" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      <div className="mkt-stats-grid mkt-mb-6">
        {Object.entries(statLabels).map(([key, label]) => {
          const Icon = statIcons[key];
          return (
            <div key={key} className="mkt-stat-card">
              <div className="mkt-stat-icon"><Icon size={18} /></div>
              <div>
                <div className="mkt-stat-value">{totals[key] || 0}</div>
                <div className="mkt-stat-label">{label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mkt-flow-grid">
        {flows.map(flow => (
          <div key={flow.id} className="mkt-flow-card">
            <div className="mkt-flow-header">
              <div>
                <div className="mkt-panel-kicker">{flow.status === 'ready' ? 'Ready To Run' : 'Watching'}</div>
                <h4>{flow.name}</h4>
              </div>
              <span className={`mkt-badge ${flow.status === 'ready' ? 'mkt-badge-success' : 'mkt-badge-neutral'}`}>
                {flow.opportunities}
              </span>
            </div>
            <div className="mkt-flow-meta">
              <span>Audience: {flow.audience.replaceAll('_', ' ')}</span>
              <span>Channel: {flow.channel}</span>
            </div>
            <p>{flow.message.split('\n').find(Boolean)}</p>
            <button
              onClick={() => scheduleFlow(flow)}
              disabled={schedulingId === flow.id || flow.opportunities === 0}
              className="mkt-btn mkt-btn-primary mkt-w-full"
            >
              {schedulingId === flow.id ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
              Schedule Flow
            </button>
          </div>
        ))}
      </div>

      <div className="mkt-table-wrapper">
        <table className="mkt-table responsive-table">
          <thead>
            <tr>
              <th>Scheduled Broadcast</th>
              <th>Audience</th>
              <th>Channels</th>
              <th>Status</th>
              <th className="mkt-text-right">Run Time</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.length === 0 ? (
              <tr><td colSpan="5" className="mkt-text-center mkt-text-muted">No pending automation broadcasts.</td></tr>
            ) : scheduled.map(item => (
              <tr key={item.id}>
                <td data-label="Broadcast">
                  <div className="mkt-font-medium">{item.channels?.emailSubject || 'Lifecycle broadcast'}</div>
                  <div className="mkt-text-xs mkt-text-muted">{String(item.message || '').slice(0, 90)}...</div>
                </td>
                <td data-label="Audience">{item.audience?.replaceAll('_', ' ')}</td>
                <td data-label="Channels">
                  {Object.entries(item.channels || {}).filter(([, value]) => value === true).map(([key]) => key).join(', ') || 'email'}
                </td>
                <td data-label="Status"><span className="mkt-badge mkt-badge-warning">{item.status}</span></td>
                <td data-label="Run Time" className="mkt-text-right">{new Date(item.scheduled_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
