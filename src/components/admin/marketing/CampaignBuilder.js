"use client";

import React, { useRef, useState } from 'react';
import EmailEditor from 'react-email-editor';
import { Save, Send, Eye, Loader2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

export default function CampaignBuilder() {
  const emailEditorRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [subject, setSubject] = useState('');
  const [campaignName, setCampaignName] = useState('New Campaign ' + new Date().toLocaleDateString());

  const exportHtml = () => {
    emailEditorRef.current.editor.exportHtml((data) => {
      const { design, html } = data;
      console.log('exportHtml', html);
      alert('Output HTML logged to console!');
    });
  };

  const saveCampaign = async () => {
    if (!subject) {
      alert("Please enter a subject line.");
      return;
    }

    setIsSaving(true);
    emailEditorRef.current.editor.exportHtml(async (data) => {
      const { design, html } = data;
      
      try {
        const res = await adminFetch('/api/admin/campaigns', {
          method: 'POST',
          body: JSON.stringify({
            title: campaignName,
            subject_line: subject,
            design_json: design,
            html_content: html
          })
        });
        
        if (res.error) throw new Error(res.error);
        alert('Campaign saved successfully!');
      } catch (err) {
        console.error(err);
        alert('Failed to save campaign');
      } finally {
        setIsSaving(false);
      }
    });
  };

  const sendCampaign = async () => {
    const campaignId = prompt("To confirm sending to all active subscribers, enter the Campaign ID you just saved (or we can build a better UI to pick drafts):");
    if (!campaignId) return;

    try {
      const res = await adminFetch('/api/admin/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaignId })
      });
      if (res.error) throw new Error(res.error);
      alert('Campaign sending initiated! Emails are being dispatched in the background.');
    } catch (err) {
      alert('Failed to send: ' + err.message);
    }
  };

  const onLoad = () => {
    setIsReady(true);
  };

  const onReady = () => {
    // Editor is ready
  };

  return (
    <div className="mkt-flex mkt-flex-col" style={{height: '800px'}}>
      <div className="mkt-flex mkt-justify-between mkt-mb-6" style={{flexWrap: 'wrap', gap: '16px'}}>
        <div className="mkt-flex-1" style={{maxWidth: '500px'}}>
          <div className="mkt-input-group">
            <label className="mkt-label">Campaign Name (Internal)</label>
            <input 
              type="text" 
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              className="mkt-input" 
            />
          </div>
          <div className="mkt-input-group" style={{marginBottom: 0}}>
            <label className="mkt-label">Subject Line *</label>
            <input 
              type="text" 
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Huge Sale on BPC-157!"
              className="mkt-input" 
              style={{fontWeight: 500}}
            />
          </div>
        </div>
        
        <div className="mkt-flex mkt-items-end mkt-gap-2 pb-1">
          <button 
            onClick={sendCampaign}
            disabled={!isReady}
            className="mkt-btn mkt-btn-danger"
          >
            <Send size={16} />
            Send to List
          </button>
          <button 
            onClick={exportHtml}
            className="mkt-btn"
          >
            <Eye size={16} />
            Preview HTML
          </button>
          <button 
            onClick={saveCampaign}
            disabled={!isReady || isSaving}
            className="mkt-btn mkt-btn-primary"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Save Draft
          </button>
        </div>
      </div>

      <div style={{flex: 1, borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', position: 'relative', background: '#fff'}}>
        {!isReady && (
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', zIndex: 10, color: 'rgba(255,255,255,0.5)', flexDirection: 'column', gap: '12px'}}>
            <Loader2 className="animate-spin" size={32} />
            <p>Loading Editor...</p>
          </div>
        )}
        <EmailEditor 
          ref={emailEditorRef} 
          onLoad={onLoad} 
          onReady={onReady} 
          minHeight="100%"
          options={{
            appearance: {
              theme: 'dark'
            }
          }}
        />
      </div>
    </div>
  );
}
