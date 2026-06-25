"use client";

import React, { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { BarChart2, Eye, MousePointerClick, Send, Loader2 } from 'lucide-react';

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
      if (res.campaigns) {
        setCampaigns(res.campaigns);
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="mkt-text-center mkt-text-muted"><Loader2 className="animate-spin" size={20} style={{display: 'inline-block', marginRight: '8px'}}/> Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan="5" className="mkt-text-center mkt-text-muted">No campaigns found. Build and send one first!</td></tr>
            ) : (
              campaigns.map((camp) => {
                const sends = camp.campaign_sends?.[0]?.count || 0;
                const opens = camp.campaign_opens?.[0]?.count || 0;
                const clicks = camp.campaign_clicks?.[0]?.count || 0;
                
                const openRate = sends > 0 ? Math.round((opens / sends) * 100) : 0;
                const clickRate = opens > 0 ? Math.round((clicks / opens) * 100) : 0;

                return (
                  <tr key={camp.id}>
                    <td>
                      <div className="mkt-font-medium">{camp.title}</div>
                      <div className="mkt-text-xs mkt-text-muted">{camp.subject_line}</div>
                      <div style={{fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '4px'}}>ID: {camp.id}</div>
                    </td>
                    <td>
                      <span className={`mkt-badge ${
                        camp.status === 'sent' ? 'mkt-badge-success' :
                        camp.status === 'sending' ? 'mkt-badge-warning' :
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
