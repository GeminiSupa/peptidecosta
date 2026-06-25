"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Mail, Users, Settings } from 'lucide-react';
import SubscriberManager from './SubscriberManager';

// We dynamically import the campaign builder because react-email-editor is heavy
const CampaignBuilder = dynamic(() => import('./CampaignBuilder'), { 
  ssr: false,
  loading: () => <div className="p-12 text-center text-white/50 animate-pulse">Loading Drag & Drop Builder...</div>
});

export default function EmailMarketingStudio() {
  const [activeTab, setActiveTab] = useState('subscribers'); // subscribers, campaigns, sequences

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Mail className="text-emerald-400" />
            Marketing Studio
          </h2>
          <p className="text-sm text-white/60">Manage subscribers, build campaigns, and track analytics.</p>
        </div>
        
        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('subscribers')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'subscribers' ? 'bg-white/10 text-white shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users size={16} />
            Subscribers
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'campaigns' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Mail size={16} />
            Campaigns
          </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-h-[600px] shadow-xl backdrop-blur-md">
        {activeTab === 'subscribers' && <SubscriberManager />}
        {activeTab === 'campaigns' && <CampaignBuilder />}
      </div>
    </div>
  );
}
