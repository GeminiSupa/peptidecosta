"use client";

import React, { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { BarChart2, Eye, MousePointerClick, Send, Loader2, Trophy, DollarSign, ShoppingCart } from 'lucide-react';

export default function CampaignAnalytics() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await adminFetch('/api/admin/campaigns');
      const data = await res.json();
      if (data.campaigns) {
        setCampaigns(data.campaigns);
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendWinner = async (campaignId, variant) => {
    if (!confirm(`Send Subject Line ${variant} to the remaining 80% of subscribers?`)) return;
    try {
      const res = await adminFetch('/api/admin/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaignId, send_winner: true, winner_variant: variant })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send winner');
      alert('Winner is being sent to the remaining subscribers!');
      fetchCampaigns();
    } catch (err) {
      alert('Failed to send winner: ' + err.message);
    }
  };

  return (
    <div>
      <div className="mkt-flex mkt-justify-between mkt-items-center mkt-mb-6">
        <h3 className="mkt-title">
          <BarChart2 />
          Campaign Performance
        </h3>
        <button 
          onClick={fetchCampaigns}
          className="mkt-btn"
          style={{background: 'transparent', border: 'none', color: '#34d399'}}
        >
          Refresh Data
        </button>
      </div>

      <div className="mkt-table-wrapper">
        <table className="mkt-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th className="mkt-text-right">Sends</th>
              <th className="mkt-text-right">Opens</th>
              <th className="mkt-text-right">Clicks</th>
              <th className="mkt-text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="mkt-text-center mkt-text-muted"><Loader2 className="animate-spin" size={20} style={{display: 'inline-block', marginRight: '8px'}}/> Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan="6" className="mkt-text-center mkt-text-muted">No campaigns found. Build and send one first!</td></tr>
            ) : (
              campaigns.map((camp) => {
                const sends = camp.campaign_sends?.[0]?.count || 0;
                const opens = camp.campaign_opens?.[0]?.count || 0;
                const clicks = camp.campaign_clicks?.[0]?.count || 0;
                const orders = camp.orders_count || 0;
                const revenue = camp.orders_revenue || 0;
                
                const openRate = sends > 0 ? Math.round((opens / sends) * 100) : 0;
                const clickRate = opens > 0 ? Math.round((clicks / opens) * 100) : 0;

                return (
                  <React.Fragment key={camp.id}>
                    <tr>
                      <td>
                        <div className="mkt-font-medium">{camp.title}</div>
                        <div className="mkt-text-xs mkt-text-muted">
                          A: {camp.subject_line}
                          {camp.subject_line_b && <><br/>B: {camp.subject_line_b}</>}
                        </div>
                        {camp.target_tags && camp.target_tags.length > 0 && (
                          <div style={{marginTop: '4px'}}>
                            {camp.target_tags.map(t => <span key={t} style={{background: 'rgba(96,165,250,0.2)', color: '#60a5fa', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', marginRight: '4px'}}>🎯 {t}</span>)}
                          </div>
                        )}
                        <div style={{fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '4px'}}>ID: {camp.id}</div>
                      </td>
                      <td>
                        <span className={`mkt-badge ${
                          camp.status === 'sent' ? 'mkt-badge-success' :
                          camp.status === 'sending' ? 'mkt-badge-warning' :
                          camp.status === 'testing' ? 'mkt-badge-info' :
                          'mkt-badge-neutral'
                        }`}>
                          {camp.status}
                        </span>
                      </td>
                      <td className="mkt-text-right">
                        <div className="mkt-flex mkt-items-center mkt-justify-end mkt-gap-2">
                          {sends} <Send size={14} color="rgba(255,255,255,0.4)" />
                        </div>
                      </td>
                      <td className="mkt-text-right">
                        <div className="mkt-flex mkt-items-center mkt-justify-end mkt-gap-2">
                          <span>{opens} <span style={{color: '#34d399', fontSize: '12px', marginLeft: '4px'}}>({openRate}%)</span></span>
                          <Eye size={14} color="rgba(255,255,255,0.4)" />
                        </div>
                      </td>
                      <td className="mkt-text-right">
                        <div className="mkt-flex mkt-items-center mkt-justify-end mkt-gap-2">
                          <span>{clicks} <span style={{color: '#60a5fa', fontSize: '12px', marginLeft: '4px'}}>({clickRate}%)</span></span>
                          <MousePointerClick size={14} color="rgba(255,255,255,0.4)" />
                        </div>
                      </td>
                      <td className="mkt-text-right">
                        <div className="mkt-flex mkt-flex-col mkt-items-end">
                          {orders > 0 ? (
                            <>
                              <span style={{color: '#fbbf24', fontWeight: 600}}>${revenue.toLocaleString()}</span>
                              <span className="mkt-text-xs mkt-text-muted">{orders} order{orders !== 1 ? 's' : ''}</span>
                            </>
                          ) : (
                            <span className="mkt-text-xs mkt-text-muted">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* A/B Test Winner Selection Row */}
                    {camp.status === 'testing' && camp.is_ab_test && (
                      <tr>
                        <td colSpan="6">
                          <div style={{
                            background: 'rgba(251,191,36,0.08)',
                            border: '1px solid rgba(251,191,36,0.2)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px'
                          }}>
                            <div>
                              <div style={{fontWeight: 600, color: '#fbbf24', fontSize: '13px', marginBottom: '4px'}}>
                                <Trophy size={14} style={{display: 'inline', marginRight: '6px'}} />
                                A/B Test Complete — Pick the Winner
                              </div>
                              <div className="mkt-text-xs mkt-text-muted">Review the open rates above, then send the winning subject to the remaining 80%.</div>
                            </div>
                            <div className="mkt-flex mkt-gap-2">
                              <button 
                                onClick={() => sendWinner(camp.id, 'A')} 
                                className="mkt-btn mkt-btn-primary" 
                                style={{fontSize: '12px', padding: '6px 14px'}}
                              >
                                Send A as Winner
                              </button>
                              <button 
                                onClick={() => sendWinner(camp.id, 'B')} 
                                className="mkt-btn mkt-btn-primary" 
                                style={{fontSize: '12px', padding: '6px 14px'}}
                              >
                                Send B as Winner
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
