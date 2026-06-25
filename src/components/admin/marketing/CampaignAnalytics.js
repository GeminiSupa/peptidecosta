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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <BarChart2 className="text-emerald-400" />
          Campaign Performance
        </h3>
        <button 
          onClick={fetchCampaigns}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Refresh Data
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center text-emerald-400">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="bg-black/20 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="p-4 font-semibold text-white/60 text-sm">Campaign</th>
                <th className="p-4 font-semibold text-white/60 text-sm">Status</th>
                <th className="p-4 font-semibold text-white/60 text-sm text-right">Sends</th>
                <th className="p-4 font-semibold text-white/60 text-sm text-right">Opens</th>
                <th className="p-4 font-semibold text-white/60 text-sm text-right">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-white/40">
                    No campaigns found. Build and send one first!
                  </td>
                </tr>
              ) : (
                campaigns.map((camp) => {
                  const sends = camp.campaign_sends?.[0]?.count || 0;
                  const opens = camp.campaign_opens?.[0]?.count || 0;
                  const clicks = camp.campaign_clicks?.[0]?.count || 0;
                  
                  const openRate = sends > 0 ? Math.round((opens / sends) * 100) : 0;
                  const clickRate = opens > 0 ? Math.round((clicks / opens) * 100) : 0;

                  return (
                    <tr key={camp.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="p-4">
                        <div className="text-white font-medium">{camp.title}</div>
                        <div className="text-white/50 text-xs">{camp.subject_line}</div>
                        <div className="text-white/30 text-[10px] font-mono mt-1">ID: {camp.id}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${
                          camp.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' :
                          camp.status === 'sending' ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                          'bg-white/10 text-white/60'
                        }`}>
                          {camp.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-white/80">
                          {sends} <Send size={14} className="text-white/40" />
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-white/80">
                          <span>{opens} <span className="text-emerald-400 text-xs ml-1">({openRate}%)</span></span>
                          <Eye size={14} className="text-white/40" />
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 text-white/80">
                          <span>{clicks} <span className="text-blue-400 text-xs ml-1">({clickRate}%)</span></span>
                          <MousePointerClick size={14} className="text-white/40" />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
