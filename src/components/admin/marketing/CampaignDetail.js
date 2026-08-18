"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { campaignEngagement } from '@/lib/campaignEngagement.mjs';
import { normalizeAudienceScope } from '@/lib/campaignAudience.mjs';
import { behaviorFilterLabel, normalizeBehaviorFilter } from '@/lib/campaignBehavior.mjs';
import {
  Activity, AlertTriangle, Eye, ExternalLink, Loader2, MousePointerClick,
  Pencil, RefreshCw, Send, TrendingUp, Users,
} from 'lucide-react';

const SCOPE_LABELS = {
  subscribers: 'Newsletter subscribers only',
  non_subscribers: 'Non-subscribers only',
  leads: 'CRM leads only',
  all: 'Everyone with an email',
};

function shortenUrl(value) {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}`.replace(/utm_[^&]+&?/g, '').replace(/[?&]$/, '');
    return `${url.host}${path === '/' ? '' : path}`;
  } catch {
    return String(value || '');
  }
}

function formatWhen(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function StatCard({ label, value, hint, icon: Icon, color }) {
  return (
    <div className="mkt-stat-card">
      <div className="mkt-stat-icon" style={{ color, background: `${color}18`, borderColor: `${color}22` }}>
        <Icon size={16} />
      </div>
      <div>
        <div className="mkt-stat-value" style={{ color, fontSize: '18px' }}>{value}</div>
        <div className="mkt-stat-label">{label}</div>
        {hint && <div className="mkt-text-xs mkt-text-muted">{hint}</div>}
      </div>
    </div>
  );
}

export default function CampaignDetail({ campaignId, onEdit, notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(`/api/admin/campaigns/stats?id=${encodeURIComponent(campaignId)}`);
      const payload = await res.json();
      if (!res.ok || payload.error) throw new Error(payload.error || 'Failed to load campaign stats');
      setData(payload);
    } catch (err) {
      setError(err.message);
      notify?.(`Could not load campaign stats: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [campaignId, notify]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="mkt-loading-state">
        <Loader2 size={22} className="animate-spin" style={{ color: '#34d399' }} />
        <span>Loading campaign report…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mkt-empty-state">
        <AlertTriangle size={32} />
        <h4>Could not load this campaign</h4>
        <p>{error}</p>
        <button type="button" className="mkt-btn" onClick={load} style={{ marginTop: '12px' }}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  const { campaign, links = [], recentActivity = [], deliveryBatches = [], revenue, truncated } = data;
  const stats = campaignEngagement({ engagement: data.engagement });
  const scope = normalizeAudienceScope(campaign.audience_scope, campaign.include_leads);
  const behavior = normalizeBehaviorFilter(campaign.behavior_filter);
  const topLinkClicks = links[0]?.unique_clicks || 0;

  return (
    <div className="mkt-fade-in">
      <div className="mkt-flex mkt-justify-between mkt-items-center mkt-mb-4" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 className="mkt-title" style={{ fontSize: '1rem', marginBottom: '3px' }}>{campaign.title}</h3>
          <div className="mkt-text-xs mkt-text-muted">
            {campaign.subject_line}
            {campaign.subject_line_b && ` · B: ${campaign.subject_line_b}`}
          </div>
          <div className="mkt-text-xs mkt-text-muted" style={{ marginTop: '4px' }}>
            {SCOPE_LABELS[scope] || scope}
            {behavior !== 'none' ? ` · ${behaviorFilterLabel(behavior).toLowerCase()}` : ''}
            {campaign.target_tags?.length ? ` · tagged ${campaign.target_tags.join(', ')}` : ''}
            {campaign.sent_at ? ` · sent ${formatWhen(campaign.sent_at)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={load} className="mkt-btn" disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="mkt-hide-xs">Refresh</span>
          </button>
          <button type="button" onClick={() => onEdit(campaign.id)} className="mkt-btn">
            <Pencil size={14} /> Edit
          </button>
        </div>
      </div>

      {!stats.exact && (
        <div className="mkt-check warn" style={{ marginBottom: '14px' }}>
          <AlertTriangle size={14} />
          <span>
            Counting from raw event rows. Run <code>campaign-engagement-stats.sql</code> for exact per-person rates.
          </span>
        </div>
      )}

      <div className="mkt-stats-grid mkt-mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatCard label="Delivered" value={stats.sends.toLocaleString()} icon={Send} color="#60a5fa" />
        <StatCard
          label="Open Rate"
          value={`${stats.openRate}%`}
          hint={`${stats.uniqueOpens.toLocaleString()} people · ${stats.totalOpens.toLocaleString()} opens`}
          icon={Eye}
          color="#34d399"
        />
        <StatCard
          label="Click Rate"
          value={`${stats.clickRate}%`}
          hint={`${stats.uniqueClicks.toLocaleString()} people · ${stats.totalClicks.toLocaleString()} clicks`}
          icon={MousePointerClick}
          color="#a78bfa"
        />
        <StatCard
          label="Click to Open"
          value={`${stats.clickToOpenRate}%`}
          hint="of people who opened"
          icon={Users}
          color="#38bdf8"
        />
        <StatCard
          label="Revenue"
          value={`$${Math.round(revenue?.total || 0).toLocaleString()}`}
          hint={`${revenue?.orders || 0} order${revenue?.orders === 1 ? '' : 's'}`}
          icon={TrendingUp}
          color="#fbbf24"
        />
      </div>

      {/* ── Which link won ── */}
      <div className="mkt-panel mkt-mb-4">
        <div className="mkt-panel-header">
          <div>
            <div className="mkt-panel-kicker">Link performance</div>
            <h3 className="mkt-panel-title">What people clicked</h3>
          </div>
          <MousePointerClick size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
        </div>

        {links.length === 0 ? (
          <div className="mkt-empty-state" style={{ padding: '26px' }}>
            <MousePointerClick size={28} />
            <h4>No clicks recorded yet</h4>
            <p>Every tracked link in this campaign is waiting for its first click.</p>
          </div>
        ) : (
          <div className="mkt-table-wrapper">
            <table className="mkt-table responsive-table">
              <thead>
                <tr>
                  <th>Destination</th>
                  <th className="mkt-text-right">People</th>
                  <th className="mkt-text-right">Clicks</th>
                  <th>Share</th>
                  <th className="mkt-text-right">Last click</th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => {
                  const unique = Number(link.unique_clicks) || 0;
                  const share = topLinkClicks > 0 ? Math.round((unique / topLinkClicks) * 100) : 0;
                  return (
                    <tr key={link.target_url}>
                      <td data-label="Destination">
                        <a
                          href={link.target_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={link.target_url}
                          style={{ color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', wordBreak: 'break-all' }}
                        >
                          {shortenUrl(link.target_url)} <ExternalLink size={11} />
                        </a>
                      </td>
                      <td data-label="People" className="mkt-text-right" style={{ fontWeight: '700' }}>
                        {unique.toLocaleString()}
                      </td>
                      <td data-label="Clicks" className="mkt-text-right mkt-text-muted">
                        {Number(link.clicks || 0).toLocaleString()}
                      </td>
                      <td data-label="Share" style={{ minWidth: '110px' }}>
                        <div className="mkt-metric-bar">
                          <div className="mkt-metric-bar-track">
                            <div className="mkt-metric-bar-fill clicks" style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      </td>
                      <td data-label="Last click" className="mkt-text-right mkt-text-xs mkt-text-muted">
                        {formatWhen(link.last_clicked_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {truncated && (
          <div className="mkt-text-xs mkt-text-muted" style={{ marginTop: '10px' }}>
            Showing the most recent 5,000 click events. Run the engagement migration for exact whole-campaign totals.
          </div>
        )}
      </div>

      <div className="mkt-command-grid">
        {/* ── Recent activity ── */}
        <div className="mkt-panel">
          <div className="mkt-panel-header">
            <div>
              <div className="mkt-panel-kicker">Live feed</div>
              <h3 className="mkt-panel-title">Recent engagement</h3>
            </div>
            <Activity size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
          {recentActivity.length === 0 ? (
            <p className="mkt-text-xs mkt-text-muted">Nothing yet.</p>
          ) : (
            <div className="mkt-checklist">
              {recentActivity.map((entry, index) => (
                <div key={`${entry.email}-${entry.at}-${index}`} className="mkt-check ok" style={{ alignItems: 'flex-start' }}>
                  {entry.action === 'click' ? <MousePointerClick size={13} /> : <Eye size={13} />}
                  <span style={{ display: 'block' }}>
                    <strong style={{ color: '#e2e8f0' }}>{entry.first_name || entry.email}</strong>
                    {' '}{entry.action === 'click' ? 'clicked' : 'opened'}
                    {entry.action === 'click' && entry.target_url && (
                      <span className="mkt-text-muted"> {shortenUrl(entry.target_url)}</span>
                    )}
                    <span className="mkt-text-xs mkt-text-muted" style={{ display: 'block' }}>{formatWhen(entry.at)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Delivery health ── */}
        <div className="mkt-panel">
          <div className="mkt-panel-header">
            <div>
              <div className="mkt-panel-kicker">Delivery</div>
              <h3 className="mkt-panel-title">Send batches</h3>
            </div>
            <Send size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
          {deliveryBatches.length === 0 ? (
            <p className="mkt-text-xs mkt-text-muted">No delivery batches recorded for this campaign.</p>
          ) : (
            <div className="mkt-checklist">
              {deliveryBatches.map(batch => {
                const failed = Number(batch.failed || 0);
                return (
                  <div key={batch.id} className={`mkt-check ${failed > 0 || batch.status === 'failed' ? 'warn' : 'ok'}`} style={{ alignItems: 'flex-start' }}>
                    <Activity size={13} />
                    <span style={{ display: 'block' }}>
                      <strong style={{ color: '#e2e8f0' }}>{batch.status}</strong>
                      {' · '}{batch.sent || 0}/{batch.attempted || 0} sent
                      {failed > 0 ? ` · ${failed} failed` : ''}
                      <span className="mkt-text-xs mkt-text-muted" style={{ display: 'block' }}>
                        {batch.provider || 'SMTP'} · {formatWhen(batch.completed_at || batch.started_at)}
                      </span>
                      {batch.error_message && (
                        <span className="mkt-text-xs" style={{ color: '#f87171', display: 'block' }}>{batch.error_message}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
