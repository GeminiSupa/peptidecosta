"use client";

import React, { useEffect, useState } from 'react';
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

export default function CampaignManager({ onDirtyChange }) {
  const [view, setView] = useState('list'); // 'list' | 'builder'
  const [editingId, setEditingId] = useState(null);
  const [builderDirty, setBuilderDirty] = useState(false);

  const handleEdit = (id) => {
    setEditingId(id);
    setBuilderDirty(false);
    setView('builder');
  };

  const handleCreate = () => {
    setEditingId(null);
    setBuilderDirty(false);
    setView('builder');
  };

  const handleBack = () => {
    if (builderDirty && !confirm('You have unsaved campaign changes. Leave the builder and discard them?')) return;
    setView('list');
    setEditingId(null);
    setBuilderDirty(false);
  };

  useEffect(() => {
    onDirtyChange?.(builderDirty);
  }, [builderDirty, onDirtyChange]);

  return (
    <div className="mkt-campaign-manager">
      {view === 'list' && (
        <CampaignDashboard onEdit={handleEdit} onCreate={handleCreate} />
      )}
      {view === 'builder' && (
        <div className="mkt-fade-in">
          <button 
            onClick={handleBack} 
            className="mkt-builder-back"
          >
            <span aria-hidden="true">&larr;</span> Campaigns
          </button>
          <CampaignBuilder editingCampaignId={editingId} onDirtyChange={setBuilderDirty} />
        </div>
      )}
    </div>
  );
}
