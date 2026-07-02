"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import CampaignDashboard from './CampaignDashboard';

const CampaignBuilder = dynamic(() => import('./CampaignBuilder'), { 
  ssr: false,
  loading: () => (
    <div className="mkt-loading-state">
      <div style={{ width: '32px', height: '32px', border: '3px solid rgba(16,185,129,0.2)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span>Loading Drag &amp; Drop Builder…</span>
    </div>
  )
});

export default function CampaignManager() {
  const [view, setView] = useState('list'); // 'list' | 'builder'
  const [editingId, setEditingId] = useState(null);

  const handleEdit = (id) => {
    setEditingId(id);
    setView('builder');
  };

  const handleCreate = () => {
    setEditingId(null);
    setView('builder');
  };

  const handleBack = () => {
    setView('list');
    setEditingId(null);
  };

  return (
    <div className="mkt-campaign-manager">
      {view === 'list' && (
        <CampaignDashboard onEdit={handleEdit} onCreate={handleCreate} />
      )}
      {view === 'builder' && (
        <div className="mkt-fade-in">
          <button 
            onClick={handleBack} 
            className="mkt-btn" 
            style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            &larr; Back to Campaigns
          </button>
          <CampaignBuilder editingCampaignId={editingId} />
        </div>
      )}
    </div>
  );
}
