"use client";

import React, { useRef, useState } from 'react';
import EmailEditor from 'react-email-editor';
import { Save, Send, Eye, Loader2, ArrowLeft } from 'lucide-react';
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
    <div className="flex flex-col h-[800px]">
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="flex-1 max-w-lg space-y-3">
          <div>
            <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider font-semibold">Campaign Name (Internal)</label>
            <input 
              type="text" 
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white" 
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider font-semibold">Subject Line *</label>
            <input 
              type="text" 
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Huge Sale on BPC-157!"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-medium" 
            />
          </div>
        </div>
        
        <div className="flex items-end gap-2 pb-1">
          <button 
            onClick={sendCampaign}
            disabled={!isReady}
            className="px-4 h-[42px] bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 rounded-lg font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Send size={16} />
            Send to List
          </button>
          <button 
            onClick={exportHtml}
            className="px-4 h-[42px] bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-white font-medium flex items-center gap-2 transition-colors"
          >
            <Eye size={16} />
            Preview HTML
          </button>
          <button 
            onClick={saveCampaign}
            disabled={!isReady || isSaving}
            className="px-4 h-[42px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Save Draft
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-xl overflow-hidden border border-white/10 relative bg-white">
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10 text-white/50 flex-col gap-3">
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
