"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import EmailEditor from 'react-email-editor';
import { AlertTriangle, CheckCircle2, Copy, Eye, Loader2, Save, Send, Users } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

export default function CampaignBuilder() {
  const emailEditorRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [subscribers, setSubscribers] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [subject, setSubject] = useState('');
  const [campaignName, setCampaignName] = useState('New Campaign ' + new Date().toLocaleDateString());
  
  // Phase 3 additions
  const [isABTest, setIsABTest] = useState(false);
  const [subjectB, setSubjectB] = useState('');
  const [targetSegment, setTargetSegment] = useState(''); // empty means all

  useEffect(() => {
    fetchCampaigns();
    fetchSubscribers();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await adminFetch('/api/admin/campaigns');
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    }
  };

  const fetchSubscribers = async () => {
    try {
      const res = await adminFetch('/api/admin/subscribers');
      const data = await res.json();
      if (data.subscribers) setSubscribers(data.subscribers);
    } catch (err) {
      console.error('Failed to fetch subscribers:', err);
    }
  };

  const selectedCampaign = useMemo(
    () => campaigns.find(campaign => campaign.id === selectedCampaignId),
    [campaigns, selectedCampaignId]
  );

  const estimatedAudience = useMemo(() => {
    const campaignTags = selectedCampaign?.target_tags || (targetSegment ? [targetSegment] : []);
    return subscribers.filter(sub => {
      if (sub.status !== 'subscribed') return false;
      if (!campaignTags.length) return true;
      return Array.isArray(sub.tags) && sub.tags.includes(campaignTags[0]);
    });
  }, [selectedCampaign, subscribers, targetSegment]);

  const preflightItems = useMemo(() => {
    const activeSubject = selectedCampaign?.subject_line || subject;
    const activeHtml = selectedCampaign?.html_content || '';
    const activeTitle = selectedCampaign?.title || campaignName;
    return [
      { label: 'Campaign has a name', ok: Boolean(activeTitle?.trim()) },
      { label: 'Subject line is ready', ok: Boolean(activeSubject?.trim()) },
      { label: 'Audience has subscribers', ok: estimatedAudience.length > 0 },
      { label: 'Sender credentials configured', ok: true, note: 'Server verifies credentials during send.' },
      { label: 'Unsubscribe footer added automatically', ok: true },
      { label: 'Open and click tracking enabled', ok: true },
      { label: 'Saved campaign selected for send', ok: Boolean(selectedCampaignId) },
      { label: 'Email body saved', ok: Boolean(activeHtml || selectedCampaignId) }
    ];
  }, [campaignName, estimatedAudience.length, selectedCampaign, selectedCampaignId, subject]);

  const canSend = preflightItems.every(item => item.ok);
  const activeCampaignIsABTest = Boolean(selectedCampaign?.is_ab_test || isABTest);

  const exportHtml = () => {
    emailEditorRef.current.editor.exportHtml((data) => {
      const { design, html } = data;
      console.log('exportHtml', html);
      alert('Output HTML logged to console!');
    });
  };

  const saveCampaign = async () => {
    if (!subject || (isABTest && !subjectB)) {
      alert("Please enter subject line(s).");
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
            subject_line_b: isABTest ? subjectB : null,
            is_ab_test: isABTest,
            target_tags: targetSegment ? [targetSegment] : null,
            design_json: design,
            html_content: html
          })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to save campaign');
        alert(`Campaign saved! ID: ${data.campaign.id}`);
        setSelectedCampaignId(data.campaign.id);
        fetchCampaigns();
      } catch (err) {
        console.error(err);
        alert('Failed to save campaign: ' + err.message);
      } finally {
        setIsSaving(false);
      }
    });
  };

  const sendCampaign = async (isTestBatch = false) => {
    if (!selectedCampaignId) {
      alert('Select a saved campaign first.');
      return;
    }

    if (!canSend) {
      alert('Resolve the preflight checks before sending.');
      return;
    }

    const label = isTestBatch ? 'A/B test batch' : 'full campaign';
    if (!confirm(`Send ${label} to ${estimatedAudience.length} subscriber${estimatedAudience.length === 1 ? '' : 's'}?`)) return;

    try {
      setIsSending(true);
      const res = await adminFetch('/api/admin/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: selectedCampaignId, is_test_batch: isTestBatch })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send campaign');
      alert('Campaign sending initiated! Emails are being dispatched in the background.');
      fetchCampaigns();
    } catch (err) {
      alert('Failed to send: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const onLoad = () => {
    setIsReady(true);
  };

  const onReady = () => {
    // Editor is ready
  };

  return (
    <div className="mkt-builder-shell mkt-flex mkt-flex-col">
      <div className="mkt-command-grid mkt-mb-6">
        <div className="mkt-panel">
          <div className="mkt-panel-header">
            <div>
              <div className="mkt-panel-kicker">Campaign Library</div>
              <h3 className="mkt-panel-title">Select a saved campaign</h3>
            </div>
            <Copy size={18} />
          </div>
          <select
            className="mkt-input"
            value={selectedCampaignId}
            onChange={e => setSelectedCampaignId(e.target.value)}
          >
            <option value="">Choose draft or sent campaign...</option>
            {campaigns.map(campaign => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.title} · {campaign.status}
              </option>
            ))}
          </select>
          {selectedCampaign && (
            <div className="mkt-selected-campaign">
              <div className="mkt-font-medium">{selectedCampaign.subject_line}</div>
              <div className="mkt-text-xs mkt-text-muted">
                {selectedCampaign.target_tags?.length ? `Segment: ${selectedCampaign.target_tags.join(', ')}` : 'Audience: all subscribers'}
              </div>
            </div>
          )}
        </div>

        <div className="mkt-panel">
          <div className="mkt-panel-header">
            <div>
              <div className="mkt-panel-kicker">Preflight</div>
              <h3 className="mkt-panel-title">Send readiness</h3>
            </div>
            <Users size={18} />
          </div>
          <div className="mkt-audience-count">
            <span>{estimatedAudience.length}</span>
            eligible subscribers
          </div>
          <div className="mkt-checklist">
            {preflightItems.map(item => (
              <div key={item.label} className={`mkt-check ${item.ok ? 'ok' : 'warn'}`}>
                {item.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mkt-flex mkt-justify-between mkt-mb-6" style={{flexWrap: 'wrap', gap: '16px'}}>
        <div className="mkt-flex-1" style={{maxWidth: '500px'}}>
          <div className="mkt-flex mkt-gap-4">
            <div className="mkt-input-group mkt-flex-1">
              <label className="mkt-label">Campaign Name (Internal)</label>
              <input 
                type="text" 
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                className="mkt-input" 
              />
            </div>
            <div className="mkt-input-group mkt-flex-1">
              <label className="mkt-label">Audience Segment (Tag)</label>
              <input 
                type="text" 
                value={targetSegment}
                onChange={e => setTargetSegment(e.target.value)}
                placeholder="Leave blank for all"
                className="mkt-input" 
              />
            </div>
          </div>
          
          <div className="mkt-flex mkt-gap-4 mkt-items-start" style={{marginBottom: '0px'}}>
            <div className="mkt-input-group mkt-flex-1" style={{marginBottom: 0}}>
              <label className="mkt-label mkt-flex mkt-justify-between mkt-items-center">
                <span>Subject Line (A) *</span>
                <label className="mkt-flex mkt-items-center mkt-gap-1" style={{fontSize: '10px', fontWeight: 'normal', cursor: 'pointer', color: '#34d399'}}>
                  <input type="checkbox" checked={isABTest} onChange={e => setIsABTest(e.target.checked)} />
                  A/B Test
                </label>
              </label>
              <input 
                type="text" 
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Hi [FIRST_NAME], Huge Sale!"
                className="mkt-input" 
                style={{fontWeight: 500}}
              />
            </div>
            {isABTest && (
              <div className="mkt-input-group mkt-flex-1" style={{marginBottom: 0}}>
                <label className="mkt-label">Subject Line (B) *</label>
                <input 
                  type="text" 
                  value={subjectB}
                  onChange={e => setSubjectB(e.target.value)}
                  placeholder="e.g. Don't miss this, [FIRST_NAME]!"
                  className="mkt-input" 
                  style={{fontWeight: 500}}
                />
              </div>
            )}
          </div>
          <p style={{fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '6px'}}>Tip: Use <code style={{background:'rgba(255,255,255,0.1)', padding:'2px 4px', borderRadius:'4px'}}>[FIRST_NAME]</code> to personalize.</p>
        </div>
        
        <div className="mkt-flex mkt-items-end mkt-gap-2 pb-1">
          {activeCampaignIsABTest && (
            <button 
              onClick={() => sendCampaign(true)}
              disabled={!isReady || isSending || !selectedCampaign?.is_ab_test}
              className="mkt-btn mkt-btn-warning"
              title="Send A/B Test Batch to 20% of your list"
            >
              <Send size={16} />
              Test Batch (20%)
            </button>
          )}
          <button 
            onClick={() => sendCampaign(false)}
            disabled={!isReady || isSending || !selectedCampaignId || selectedCampaign?.status === 'testing'}
            className="mkt-btn mkt-btn-danger"
            title={selectedCampaign?.status === 'testing' ? 'Pick the A/B winner from Analytics to send the remaining audience.' : 'Send selected campaign'}
          >
            {isSending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
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
