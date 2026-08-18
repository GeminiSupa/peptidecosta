"use client";

import React, { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { normalizeAudienceScope, scopeIncludesLeads } from '@/lib/campaignAudience.mjs';
import {
  BarChart2, Eye, MousePointerClick, Send, Loader2,
  Trophy, RefreshCw, TrendingUp, Activity, CopyPlus,
} from 'lucide-react';

function RateBar({ value, max = 100, className }) {
  return (
    <div className="mkt-metric-bar">
      <div className="mkt-metric-bar-track">
        <div
          className={`mkt-metric-bar-fill ${className}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function formatBatchTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function CampaignHealthCell({ batch }) {
  if (!batch) {
    return <span className="mkt-text-xs mkt-text-muted">No batch yet</span>;
  }

  const failed = Number(batch.failed || 0);
  const attempted = Number(batch.attempted || 0);
  const sent = Number(batch.sent || 0);
  const statusClass = batch.status === 'failed'
    ? 'mkt-badge-danger'
    : failed > 0 || batch.status === 'partial'
      ? 'mkt-badge-warning'
      : 'mkt-badge-success';
  const providerText = [
    batch.provider,
    batch.fallback_used && batch.fallback_provider ? `fallback ${batch.fallback_provider}` : null,
  ].filter(Boolean).join(' + ');

  return (
    <div style={{ minWidth: '150px' }}>
      <span className={`mkt-badge ${statusClass}`} style={{ marginBottom: '5px' }}>
        <Activity size={11} /> {batch.status}
      </span>
      <div className="mkt-text-xs" style={{ color: '#cbd5e1', lineHeight: 1.45 }}>
        {providerText || 'SMTP'} · {sent}/{attempted} sent
        {failed > 0 ? ` · ${failed} failed` : ''}
      </div>
      <div className="mkt-text-xs mkt-text-muted">
        {formatBatchTime(batch.completed_at || batch.started_at)}
      </div>
      {batch.error_message && (
        <div className="mkt-text-xs" title={batch.error_message} style={{ color: '#f87171', marginTop: '3px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {batch.error_message}
        </div>
      )}
    </div>
  );
}

export default function CampaignDashboard({ onEdit, onCreate }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [duplicatingId, setDuplicatingId] = useState(null);

  useEffect(() => { fetchCampaigns(); }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res  = await adminFetch('/api/admin/campaigns');
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendWinner = async (campaignId, variant) => {
    if (!confirm(`Send Subject Line ${variant} to the remaining 80% of subscribers?`)) return;
    try {
      const res  = await adminFetch('/api/admin/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaignId, send_winner: true, winner_variant: variant }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send winner');
      alert('Winner is being sent to the remaining subscribers!');
      fetchCampaigns();
    } catch (err) {
      alert('Failed to send winner: ' + err.message);
    }
  };

  // A copy is always a fresh draft: the schedule, the status and every send /
  // open / click stat stay behind with the original. `audience_scope` has to be
  // carried explicitly — the boolean alone cannot say "leads only", so a copy
  // that only sent it would silently widen the audience to everyone.
  const duplicateCampaign = async (campaign) => {
    const scope = normalizeAudienceScope(campaign.audience_scope, campaign.include_leads);
    setDuplicatingId(campaign.id);
    try {
      const res = await adminFetch('/api/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          title: `${campaign.title} (Copy)`,
          subject_line: campaign.subject_line,
          subject_line_b: campaign.subject_line_b,
          is_ab_test: campaign.is_ab_test,
          target_tags: campaign.target_tags,
          audience_scope: scope,
          include_leads: scopeIncludesLeads(scope),
          design_json: campaign.design_json,
          html_content: campaign.html_content,
          from_name: campaign.from_name,
          from_email: campaign.from_email,
          reply_to: campaign.reply_to,
          preview_text: campaign.preview_text,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to duplicate campaign');
      await fetchCampaigns();
    } catch (err) {
      alert('Failed to duplicate: ' + err.message);
    } finally {
      setDuplicatingId(null);
    }
  };

  const deleteCampaign = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    try {
      const res = await adminFetch(`/api/admin/campaigns?id=${campaignId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete campaign');
      fetchCampaigns();
    } catch (err) {
      alert(err.message);
    }
  };

  // Aggregate summary stats
  const totalSent    = campaigns.reduce((sum, c) => sum + (c.campaign_sends?.[0]?.count || 0), 0);
  const totalOpens   = campaigns.reduce((sum, c) => sum + (c.campaign_opens?.[0]?.count || 0), 0);
  const totalClicks  = campaigns.reduce((sum, c) => sum + (c.campaign_clicks?.[0]?.count || 0), 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.orders_revenue || 0), 0);
  const avgOpenRate  = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
  const avgClickRate = totalOpens > 0 ? Math.round((totalClicks / totalOpens) * 100) : 0;

  return (
    <div className="mkt-fade-in">
      {/* ── Header ── */}
      <div className="mkt-flex mkt-justify-between mkt-items-center mkt-mb-4">
        <h3 className="mkt-title" style={{ fontSize: '1rem' }}>
          <BarChart2 size={18} /> Campaign Dashboard
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchCampaigns} className="mkt-btn" disabled={loading} aria-label="Refresh data">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            <span className="mkt-hide-xs">Refresh</span>
          </button>
          <button onClick={onCreate} className="mkt-btn mkt-btn-primary">
            + Create New Campaign
          </button>
        </div>
      </div>

      {/* ── Aggregate KPIs ── */}
      {campaigns.length > 0 && (
        <div className="mkt-stats-grid mkt-mb-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          {[
            { label: 'Total Sends',  value: totalSent.toLocaleString(),    icon: Send,              color: '#60a5fa' },
            { label: 'Avg Open Rate', value: `${avgOpenRate}%`,            icon: Eye,               color: '#34d399' },
            { label: 'Avg CTR',      value: `${avgClickRate}%`,            icon: MousePointerClick, color: '#a78bfa' },
            { label: 'Revenue',      value: `$${totalRevenue.toLocaleString()}`, icon: TrendingUp,  color: '#fbbf24' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="mkt-stat-card">
              <div className="mkt-stat-icon" style={{ color, background: `${color}18`, borderColor: `${color}22` }}>
                <Icon size={16} />
              </div>
              <div>
                <div className="mkt-stat-value" style={{ color, fontSize: '18px' }}>{value}</div>
                <div className="mkt-stat-label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Campaigns table ── */}
      <div className="mkt-table-wrapper">
        <table className="mkt-table responsive-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Health</th>
              <th className="mkt-text-right">Sends</th>
              <th>Open Rate</th>
              <th>Click Rate</th>
              <th className="mkt-text-right">Revenue</th>
              <th className="mkt-text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="mkt-text-center mkt-text-muted" style={{ padding: '40px' }}>
                  <Loader2 className="animate-spin" size={22} style={{ display: 'inline-block', color: '#34d399' }} />
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <div className="mkt-empty-state">
                    <BarChart2 size={36} />
                    <h4>No campaigns yet</h4>
                    <p>Build and send your first campaign to see analytics here.</p>
                  </div>
                </td>
              </tr>
            ) : (
              campaigns.map((camp) => {
                const sends  = camp.campaign_sends?.[0]?.count  || 0;
                const opens  = camp.campaign_opens?.[0]?.count  || 0;
                const clicks = camp.campaign_clicks?.[0]?.count || 0;
                const orders  = camp.orders_count   || 0;
                const revenue = camp.orders_revenue || 0;
                const openRate  = sends  > 0 ? Math.round((opens  / sends)  * 100) : 0;
                const clickRate = opens  > 0 ? Math.round((clicks / opens)  * 100) : 0;

                return (
                  <React.Fragment key={camp.id}>
                    <tr>
                      <td data-label="Campaign">
                        <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '2px' }}>{camp.title}</div>
                        <div className="mkt-text-xs mkt-text-muted">
                          A: {camp.subject_line}
                          {camp.subject_line_b && <><br />B: {camp.subject_line_b}</>}
                        </div>
                        {camp.target_tags?.length > 0 && (
                          <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {camp.target_tags.map(t => (
                              <span key={t} style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>🎯 {t}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className={`mkt-badge ${
                          camp.status === 'sent'    ? 'mkt-badge-success' :
                          camp.status === 'sending' ? 'mkt-badge-warning' :
                          camp.status === 'testing' ? 'mkt-badge-info'    :
                          'mkt-badge-neutral'
                        }`}>
                          {camp.status}
                        </span>
                      </td>
                      <td data-label="Health">
                        <CampaignHealthCell batch={camp.latest_delivery_batch} />
                      </td>
                      <td data-label="Sends" className="mkt-text-right">
                        <span style={{ fontWeight: '700', fontSize: '15px' }}>{sends.toLocaleString()}</span>
                      </td>
                      <td data-label="Open Rate">
                        <div>
                          <div className="mkt-flex mkt-items-center mkt-gap-2" style={{ marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700', color: '#34d399', fontSize: '14px' }}>{openRate}%</span>
                            <span className="mkt-text-xs mkt-text-muted">({opens})</span>
                          </div>
                          <RateBar value={openRate} className="opens" />
                        </div>
                      </td>
                      <td data-label="Click Rate">
                        <div>
                          <div className="mkt-flex mkt-items-center mkt-gap-2" style={{ marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700', color: '#60a5fa', fontSize: '14px' }}>{clickRate}%</span>
                            <span className="mkt-text-xs mkt-text-muted">({clicks})</span>
                          </div>
                          <RateBar value={clickRate} className="clicks" />
                        </div>
                      </td>
                      <td data-label="Revenue" className="mkt-text-right">
                        {orders > 0 ? (
                          <div>
                            <div style={{ color: '#fbbf24', fontWeight: '800', fontSize: '14px' }}>${revenue.toLocaleString()}</div>
                            <div className="mkt-text-xs mkt-text-muted">{orders} order{orders !== 1 ? 's' : ''}</div>
                          </div>
                        ) : (
                          <span className="mkt-text-xs mkt-text-muted">—</span>
                        )}
                      </td>
                      <td data-label="Actions" className="mkt-text-right">
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button onClick={() => onEdit(camp.id)} className="mkt-btn" style={{ padding: '6px 12px', fontSize: '12px' }}>
                            Edit
                          </button>
                          <button
                            onClick={() => duplicateCampaign(camp)}
                            disabled={duplicatingId === camp.id}
                            className="mkt-btn"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            title="Save a new draft with this campaign's design, subject and audience"
                          >
                            {duplicatingId === camp.id ? <Loader2 size={12} className="animate-spin" /> : <CopyPlus size={12} />}
                            Duplicate
                          </button>
                          <button onClick={() => deleteCampaign(camp.id)} className="mkt-btn" style={{ padding: '6px 12px', fontSize: '12px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* A/B winner picker */}
                    {camp.status === 'testing' && camp.is_ab_test && (
                      <tr>
                        <td colSpan="8">
                          <div style={{
                            background: 'rgba(251,191,36,0.07)',
                            border: '1px solid rgba(251,191,36,0.18)',
                            borderRadius: '10px', padding: '14px 16px',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
                          }}>
                            <div>
                              <div style={{ fontWeight: '700', color: '#fbbf24', fontSize: '13px', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Trophy size={14} /> A/B Test Complete — Pick the Winner
                              </div>
                              <div className="mkt-text-xs mkt-text-muted">Review open rates above, then send the winning subject to the remaining 80%.</div>
                            </div>
                            <div className="mkt-flex mkt-gap-2">
                              <button onClick={() => sendWinner(camp.id, 'A')} className="mkt-btn mkt-btn-primary" style={{ fontSize: '12px', padding: '8px 16px' }}>
                                🏆 Send A as Winner
                              </button>
                              <button onClick={() => sendWinner(camp.id, 'B')} className="mkt-btn mkt-btn-primary" style={{ fontSize: '12px', padding: '8px 16px' }}>
                                🏆 Send B as Winner
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
