"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import EmailEditor from 'react-email-editor';
import {
  AlertTriangle, CheckCircle2, Copy, Eye, Loader2, Save, Send,
  Users, ChevronDown, ChevronUp, Smartphone, LayoutTemplate,
  Tag, Layers,
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

// ── Template Library ─────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'newsletter',
    icon: '📰',
    name: 'Newsletter',
    desc: 'Regular content digest',
    design: null, // will use default blank
  },
  {
    id: 'promo',
    icon: '🏷️',
    name: 'Promotion',
    desc: 'Sale or discount offer',
    design: null,
  },
  {
    id: 'welcome',
    icon: '👋',
    name: 'Welcome',
    desc: 'Greet new subscribers',
    design: null,
  },
  {
    id: 'product',
    icon: '🧪',
    name: 'Product Spotlight',
    desc: 'Feature a peptide',
    design: null,
  },
  {
    id: 'winback',
    icon: '🔄',
    name: 'Win-Back',
    desc: 'Re-engage inactive leads',
    design: null,
  },
  {
    id: 'blank',
    icon: '✏️',
    name: 'Blank Canvas',
    desc: 'Start from scratch',
    design: null,
  },
];

// Collapsible section component
function Section({ title, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', gap: '10px' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.7)' }}>
          {Icon && <Icon size={14} style={{ color: '#34d399' }} />}
          {title}
        </span>
        {open ? <ChevronUp size={15} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} /> : <ChevronDown size={15} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />}
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  );
}

export default function CampaignBuilder() {
  const emailEditorRef      = useRef(null);
  const [isReady,           setIsReady]           = useState(false);
  const [isSaving,          setIsSaving]          = useState(false);
  const [isSending,         setIsSending]         = useState(false);
  const [campaigns,         setCampaigns]         = useState([]);
  const [subscribers,       setSubscribers]       = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [subject,           setSubject]           = useState('');
  const [campaignName,      setCampaignName]      = useState('New Campaign ' + new Date().toLocaleDateString());
  const [selectedTemplate,  setSelectedTemplate]  = useState('blank');
  const [showTemplates,     setShowTemplates]     = useState(true);

  // A/B test
  const [isABTest,    setIsABTest]    = useState(false);
  const [subjectB,    setSubjectB]    = useState('');
  const [targetSegment, setTargetSegment] = useState('');

  useEffect(() => {
    fetchCampaigns();
    fetchSubscribers();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res  = await adminFetch('/api/admin/campaigns');
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    }
  };

  const fetchSubscribers = async () => {
    try {
      const res  = await adminFetch('/api/admin/subscribers');
      const data = await res.json();
      if (data.subscribers) setSubscribers(data.subscribers);
    } catch (err) {
      console.error('Failed to fetch subscribers:', err);
    }
  };

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedCampaignId),
    [campaigns, selectedCampaignId]
  );

  const estimatedAudience = useMemo(() => {
    const tags = selectedCampaign?.target_tags || (targetSegment ? [targetSegment] : []);
    return subscribers.filter(sub => {
      if (sub.status !== 'subscribed') return false;
      if (!tags.length) return true;
      return Array.isArray(sub.tags) && sub.tags.includes(tags[0]);
    });
  }, [selectedCampaign, subscribers, targetSegment]);

  const preflightItems = useMemo(() => {
    const activeSubject = selectedCampaign?.subject_line || subject;
    const activeTitle   = selectedCampaign?.title || campaignName;
    return [
      { label: 'Campaign name set',              ok: Boolean(activeTitle?.trim()) },
      { label: 'Subject line ready',             ok: Boolean(activeSubject?.trim()) },
      { label: 'Audience has subscribers',       ok: estimatedAudience.length > 0 },
      { label: 'Sender credentials configured',  ok: true, note: 'Verified at send time.' },
      { label: 'Unsubscribe footer auto-added',  ok: true },
      { label: 'Tracking enabled',               ok: true },
      { label: 'Saved campaign selected',        ok: Boolean(selectedCampaignId) },
      { label: 'Email body saved',               ok: Boolean(selectedCampaign?.html_content || selectedCampaignId) },
    ];
  }, [campaignName, estimatedAudience.length, selectedCampaign, selectedCampaignId, subject]);

  const canSend = preflightItems.every(item => item.ok);
  const activeCampaignIsABTest = Boolean(selectedCampaign?.is_ab_test || isABTest);

  const saveCampaign = async () => {
    if (!subject || (isABTest && !subjectB)) { alert('Please enter subject line(s).'); return; }
    setIsSaving(true);
    emailEditorRef.current.editor.exportHtml(async ({ design, html }) => {
      try {
        const res  = await adminFetch('/api/admin/campaigns', {
          method: 'POST',
          body: JSON.stringify({
            title: campaignName, subject_line: subject,
            subject_line_b: isABTest ? subjectB : null,
            is_ab_test: isABTest,
            target_tags: targetSegment ? [targetSegment] : null,
            design_json: design, html_content: html,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to save campaign');
        setSelectedCampaignId(data.campaign.id);
        fetchCampaigns();
      } catch (err) {
        alert('Failed to save campaign: ' + err.message);
      } finally {
        setIsSaving(false);
      }
    });
  };

  const sendCampaign = async (isTestBatch = false) => {
    if (!selectedCampaignId) { alert('Select a saved campaign first.'); return; }
    if (!canSend) { alert('Resolve the preflight checks before sending.'); return; }
    const label = isTestBatch ? 'A/B test batch' : 'full campaign';
    if (!confirm(`Send ${label} to ${estimatedAudience.length} subscriber${estimatedAudience.length === 1 ? '' : 's'}?`)) return;
    try {
      setIsSending(true);
      const res  = await adminFetch('/api/admin/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({ campaign_id: selectedCampaignId, is_test_batch: isTestBatch }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send');
      alert('Campaign sending initiated! Emails are dispatching in the background.');
      fetchCampaigns();
    } catch (err) {
      alert('Failed to send: ' + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const exportHtml = () => {
    emailEditorRef.current.editor.exportHtml(({ html }) => {
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
    });
  };

  return (
    <div className="mkt-builder-shell">
      {/* ── Mobile notice ── */}
      <div className="mkt-mobile-editor-notice">
        <Smartphone size={18} />
        <div>
          <strong>Tip for mobile:</strong> The drag &amp; drop builder works best on a tablet or desktop.
          On mobile, configure your campaign settings below and use "Save Draft" — then open on a larger screen to design the email body.
        </div>
      </div>

      {/* ══ CONFIG PANEL ══ */}
      <div className="mkt-builder-config">

        {/* Template picker */}
        <Section title="1. Choose a Template" icon={LayoutTemplate} defaultOpen={showTemplates}>
          <div className="mkt-template-grid">
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => { setSelectedTemplate(tpl.id); setShowTemplates(false); }}
                className={`mkt-template-card ${selectedTemplate === tpl.id ? 'selected' : ''}`}
              >
                <div className="mkt-template-icon">{tpl.icon}</div>
                <div className="mkt-template-name">{tpl.name}</div>
                <div className="mkt-template-desc">{tpl.desc}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* Campaign settings */}
        <Section title="2. Campaign Settings" icon={Layers} defaultOpen>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">Campaign Name (Internal)</label>
              <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} className="mkt-input" />
            </div>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px' }}>
              <label className="mkt-label">Audience Segment Tag</label>
              <div style={{ position: 'relative' }}>
                <Tag size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
                <input type="text" value={targetSegment} onChange={e => setTargetSegment(e.target.value)} placeholder="Leave blank for all" className="mkt-input" style={{ paddingLeft: '32px' }} />
              </div>
            </div>
          </div>

          {/* Subject lines */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
            <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px', marginBottom: 0 }}>
              <label className="mkt-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Subject Line {isABTest ? '(A) *' : '*'}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'normal', fontSize: '11px', color: '#34d399', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                  <input type="checkbox" checked={isABTest} onChange={e => setIsABTest(e.target.checked)} style={{ accentColor: '#10b981' }} />
                  A/B Test
                </label>
              </label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Hi [FIRST_NAME], big news…" className="mkt-input" />
            </div>
            {isABTest && (
              <div className="mkt-input-group mkt-flex-1" style={{ minWidth: '180px', marginBottom: 0 }}>
                <label className="mkt-label">Subject Line B *</label>
                <input type="text" value={subjectB} onChange={e => setSubjectB(e.target.value)} placeholder="Don't miss this, [FIRST_NAME]!" className="mkt-input" />
              </div>
            )}
          </div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '8px', marginBottom: 0 }}>
            Tip: Use <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>[FIRST_NAME]</code> for personalisation.
          </p>
        </Section>

        {/* Preflight + actions */}
        <div className="mkt-command-grid" style={{ marginBottom: 0 }}>
          {/* Library */}
          <div className="mkt-panel">
            <div className="mkt-panel-header">
              <div>
                <div className="mkt-panel-kicker">Campaign Library</div>
                <h3 className="mkt-panel-title">Select a saved campaign</h3>
              </div>
              <Copy size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
            </div>
            <select className="mkt-input" value={selectedCampaignId} onChange={e => setSelectedCampaignId(e.target.value)}>
              <option value="">Choose draft or sent campaign…</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.title} · {c.status}</option>
              ))}
            </select>
            {selectedCampaign && (
              <div className="mkt-selected-campaign">
                <div style={{ fontWeight: '700', fontSize: '13px', color: '#fff', marginBottom: '4px' }}>{selectedCampaign.subject_line}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                  {selectedCampaign.target_tags?.length ? `Segment: ${selectedCampaign.target_tags.join(', ')}` : 'Audience: all subscribers'}
                </div>
              </div>
            )}
          </div>

          {/* Preflight */}
          <div className="mkt-panel">
            <div className="mkt-panel-header">
              <div>
                <div className="mkt-panel-kicker">Preflight</div>
                <h3 className="mkt-panel-title">
                  <span className="mkt-audience-count" style={{ marginBottom: 0 }}>
                    <span>{estimatedAudience.length}</span> eligible
                  </span>
                </h3>
              </div>
              <Users size={16} style={{ color: 'rgba(255,255,255,0.3)' }} />
            </div>
            <div className="mkt-checklist">
              {preflightItems.map(item => (
                <div key={item.label} className={`mkt-check ${item.ok ? 'ok' : 'warn'}`}>
                  {item.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
              <button onClick={exportHtml} className="mkt-btn" style={{ flex: '1 1 auto' }}>
                <Eye size={14} /> Preview
              </button>
              <button onClick={saveCampaign} disabled={!isReady || isSaving} className="mkt-btn mkt-btn-primary" style={{ flex: '1 1 auto' }}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
              </button>
              {activeCampaignIsABTest && (
                <button onClick={() => sendCampaign(true)} disabled={!isReady || isSending || !selectedCampaign?.is_ab_test} className="mkt-btn mkt-btn-warning" style={{ flex: '1 1 auto' }}>
                  <Send size={14} /> Test 20%
                </button>
              )}
              <button
                onClick={() => sendCampaign(false)}
                disabled={!isReady || isSending || !selectedCampaignId || selectedCampaign?.status === 'testing'}
                className="mkt-btn mkt-btn-danger"
                style={{ flex: '1 1 auto' }}
                title={selectedCampaign?.status === 'testing' ? 'Pick A/B winner from Analytics first.' : 'Send to full list'}
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ EMAIL EDITOR ══ */}
      <div className="mkt-email-editor-frame">
        {!isReady && (
          <div className="mkt-email-editor-loading">
            <Loader2 className="animate-spin" size={30} style={{ color: '#34d399' }} />
            <p style={{ margin: 0, fontSize: '14px' }}>Loading Email Editor…</p>
          </div>
        )}
        <div className="mkt-email-editor">
          <EmailEditor
            ref={emailEditorRef}
            onLoad={() => setIsReady(true)}
            minHeight="640px"
            options={{ appearance: { theme: 'dark' } }}
          />
        </div>
      </div>
    </div>
  );
}
