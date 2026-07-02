"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { BarChart2, Mail, Users, Zap, TrendingUp, Send } from 'lucide-react';
import SubscriberManager from './SubscriberManager';
import CampaignAnalytics from './CampaignAnalytics';
import AutomationStudio from './AutomationStudio';
import { adminFetch } from '@/lib/adminApi';

// We dynamically import the campaign manager to handle the list/builder views
const CampaignManager = dynamic(() => import('./CampaignManager'), { ssr: false });

const TABS = [
  { id: 'subscribers', label: 'Subscribers', icon: Users },
  { id: 'campaigns',   label: 'Campaigns',   icon: Mail },
  { id: 'automations', label: 'Automations', icon: Zap },
];

export default function EmailMarketingStudio() {
  const [activeTab, setActiveTab] = useState('subscribers');
  const [headerStats, setHeaderStats] = useState({ subscribers: '—', campaigns: '—', sent: '—' });

  // Pull quick KPIs for the stats strip
  useEffect(() => {
    const load = async () => {
      try {
        const [subRes, campRes] = await Promise.all([
          adminFetch('/api/admin/subscribers'),
          adminFetch('/api/admin/campaigns'),
        ]);
        const subData  = await subRes.json();
        const campData = await campRes.json();

        const active = subData.subscribers?.filter(s => s.status === 'subscribed').length ?? '—';
        const camps  = campData.campaigns?.length ?? '—';
        const sent   = campData.campaigns?.filter(c => c.status === 'sent').length ?? '—';
        setHeaderStats({ subscribers: active, campaigns: camps, sent });
      } catch {
        // silent — stats are decorative
      }
    };
    load();
  }, []);

  return (
    <div className="mkt-studio mkt-fade-in">
      {/* ── Sticky Header ── */}
      <div className="mkt-header">
        <div>
          <h2 className="mkt-title">
            <Mail size={22} />
            Marketing Studio
          </h2>
          <p className="mkt-subtitle">Manage subscribers, build campaigns, and track analytics.</p>
          {/* Stats strip */}
          <div className="mkt-stats-strip">
            <span className="mkt-stat-pill">
              <Users size={12} />
              {headerStats.subscribers} <span>subscribers</span>
            </span>
            <span className="mkt-stat-pill" style={{ background: 'rgba(96,165,250,0.08)', borderColor: 'rgba(96,165,250,0.18)', color: '#60a5fa' }}>
              <Mail size={12} />
              {headerStats.campaigns} <span>campaigns</span>
            </span>
            <span className="mkt-stat-pill" style={{ background: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.18)', color: '#fbbf24' }}>
              <Send size={12} />
              {headerStats.sent} <span>sent</span>
            </span>
          </div>
        </div>

        {/* Scrollable tab bar */}
        <div className="mkt-tabs" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`mkt-tab ${activeTab === id ? 'active' : ''}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Panel ── */}
      <div className="mkt-container mkt-fade-in" key={activeTab}>
        {activeTab === 'subscribers' && <SubscriberManager />}
        {activeTab === 'campaigns'   && <CampaignManager />}
        {activeTab === 'automations' && <AutomationStudio />}
      </div>
    </div>
  );
}
