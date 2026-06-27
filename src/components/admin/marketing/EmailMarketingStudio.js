"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { BarChart2, Mail, Users, Zap } from 'lucide-react';
import SubscriberManager from './SubscriberManager';
import CampaignAnalytics from './CampaignAnalytics';
import AutomationStudio from './AutomationStudio';

// We dynamically import the campaign builder because react-email-editor is heavy
const CampaignBuilder = dynamic(() => import('./CampaignBuilder'), { 
  ssr: false,
  loading: () => <div style={{ padding: '48px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>Loading Drag & Drop Builder...</div>
});

export default function EmailMarketingStudio() {
  const [activeTab, setActiveTab] = useState('subscribers'); // subscribers, campaigns, analytics

  return (
    <div className="mkt-studio">
      <div className="mkt-header">
        <div>
          <h2 className="mkt-title">
            <Mail />
            Marketing Studio
          </h2>
          <p className="mkt-subtitle">Manage subscribers, build campaigns, and track analytics.</p>
        </div>
        
        <div className="mkt-tabs">
          <button
            onClick={() => setActiveTab('subscribers')}
            className={`mkt-tab ${activeTab === 'subscribers' ? 'active' : ''}`}
          >
            <Users size={16} />
            Subscribers
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`mkt-tab ${activeTab === 'campaigns' ? 'active' : ''}`}
          >
            <Mail size={16} />
            Campaigns
          </button>
          <button
            onClick={() => setActiveTab('automations')}
            className={`mkt-tab ${activeTab === 'automations' ? 'active' : ''}`}
          >
            <Zap size={16} />
            Automations
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`mkt-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          >
            <BarChart2 size={16} />
            Analytics
          </button>
        </div>
      </div>

      <div className="mkt-container">
        {activeTab === 'subscribers' && <SubscriberManager />}
        {activeTab === 'campaigns' && <CampaignBuilder />}
        {activeTab === 'automations' && <AutomationStudio />}
        {activeTab === 'analytics' && <CampaignAnalytics />}
      </div>
    </div>
  );
}
