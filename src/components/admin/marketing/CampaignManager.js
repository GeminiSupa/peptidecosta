"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import CampaignDashboard from './CampaignDashboard';
import CampaignDetail from './CampaignDetail';
import { useMarketingFeedback } from './useMarketingFeedback';

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
  const [view, setView] = useState('list'); // 'list' | 'builder' | 'detail'
  const [editingId, setEditingId] = useState(null);
  const [builderDirty, setBuilderDirty] = useState(false);
  const { notify, confirm, feedback } = useMarketingFeedback();

  const leaveBuilder = async () => {
    if (view !== 'builder' || !builderDirty) return true;
    return confirm({
      title: 'Discard unsaved changes?',
      message: 'This campaign has edits that have not been saved to the server.',
      confirmLabel: 'Discard and leave',
      tone: 'danger',
    });
  };

  const handleEdit = async (id) => {
    if (!(await leaveBuilder())) return;
    setEditingId(id);
    setBuilderDirty(false);
    setView('builder');
  };

  const handleViewReport = async (id) => {
    if (!(await leaveBuilder())) return;
    setEditingId(id);
    setBuilderDirty(false);
    setView('detail');
  };

  const handleCreate = async () => {
    if (!(await leaveBuilder())) return;
    setEditingId(null);
    setBuilderDirty(false);
    setView('builder');
  };

  const handleBack = async () => {
    if (!(await leaveBuilder())) return;
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
        <CampaignDashboard
          onEdit={handleEdit}
          onCreate={handleCreate}
          onViewReport={handleViewReport}
          notify={notify}
          confirm={confirm}
        />
      )}
      {view !== 'list' && (
        <div className="mkt-fade-in">
          <button
            onClick={handleBack}
            className="mkt-builder-back"
          >
            <span aria-hidden="true">&larr;</span> Campaigns
          </button>
          {view === 'builder' && (
            <CampaignBuilder
              editingCampaignId={editingId}
              onDirtyChange={setBuilderDirty}
              notify={notify}
              confirm={confirm}
            />
          )}
          {view === 'detail' && (
            <CampaignDetail campaignId={editingId} onEdit={handleEdit} notify={notify} />
          )}
        </div>
      )}
      {feedback}
    </div>
  );
}
