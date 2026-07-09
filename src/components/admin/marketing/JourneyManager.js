"use client";

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Clock, Edit3, Loader2, Mail, Pause, Play, Plus, RefreshCw, Save, ShoppingCart, Sparkles, Trash2, UserPlus, X, Zap } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const TEMPLATES = [
  {
    id: 'welcome', name: 'Welcome & Educate', description: 'Welcome new subscribers and follow up with the catalog.',
    trigger: { type: 'new_subscriber' },
    steps: [
      { channel: 'email', delay_hours: 0, subject: 'Welcome to Costa Peptides, [FIRST_NAME]', message: 'Hi [FIRST_NAME],\n\nThanks for joining Costa Peptides. Explore our catalog and reply if you need help with availability, ordering, or delivery.\n\nhttps://catalog.peptidescostarica.net/catalog' },
      { channel: 'email', delay_hours: 48, subject: 'Can we help with your research order?', message: 'Hi [FIRST_NAME],\n\nIf you have questions about availability, bulk pricing, or delivery, reply here and our team will help.' },
    ],
  },
  {
    id: 'cart', name: 'Cart Rescue Sequence', description: 'Recover unfinished carts without continuing after an order.',
    trigger: { type: 'abandoned_cart' },
    steps: [
      { channel: 'email', delay_hours: 2, subject: 'Need help finishing your order?', message: 'Hi [FIRST_NAME],\n\nIt looks like your order was not completed. If availability, payment, or delivery caused a problem, reply and we will help.' },
      { channel: 'whatsapp', delay_hours: 22, message: 'Hi [FIRST_NAME], this is Costa Peptides. We noticed your order was not completed. Reply here if you need help with availability, payment, or delivery.' },
    ],
  },
  {
    id: 'reorder', name: '30-Day Reorder', description: 'Reach customers when they enter their likely reorder window.',
    trigger: { type: 'reorder_due', days: 30 },
    steps: [
      { channel: 'email', delay_hours: 0, subject: 'Time to restock, [FIRST_NAME]?', message: 'Hi [FIRST_NAME],\n\nIt may be time to restock your research supplies. Browse current availability or reply for direct support.\n\nhttps://catalog.peptidescostarica.net/catalog' },
    ],
  },
];

const TRIGGER_LABELS = { new_subscriber: 'New subscriber', abandoned_cart: 'Cart abandoned', catalog_lead: 'Catalog lead', reorder_due: 'Reorder window' };
const CONDITION_LABELS = { has_active_cart: 'Contact still has an active cart', email_engaged: 'Contact opened or clicked an email', no_order_since_enrollment: 'Contact has not ordered since enrollment' };
const formatMoney = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
const EMPTY_JOURNEY = {
  name: '', description: '', trigger: { type: 'new_subscriber', days: 30 },
  steps: [{ id: 'step_1', type: 'action', channel: 'email', delay_hours: 0, subject: '', message: '' }],
};

export default function JourneyManager() {
  const [journeys, setJourneys] = useState([]);
  const [campaignTemplates, setCampaignTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [editor, setEditor] = useState(null);
  const [editorError, setEditorError] = useState('');
  const [aiGoal, setAiGoal] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [strategyNote, setStrategyNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/journeys');
      const payload = await response.json();
      if (!response.ok) {
        setSetupRequired(Boolean(payload.setupRequired));
        throw new Error(payload.error || 'Unable to load journeys');
      }
      setJourneys(payload.journeys || []);
      setSetupRequired(false);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCampaignTemplates = async () => {
    try {
      const response = await adminFetch('/api/admin/campaigns');
      const payload = await response.json();
      if (response.ok) {
        setCampaignTemplates((payload.campaigns || []).filter(campaign => campaign.subject_line && (campaign.html_content || campaign.design_json)));
      }
    } catch (templateError) {
      console.error('Unable to load saved email templates:', templateError);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminFetch('/api/admin/journeys'),
      adminFetch('/api/admin/campaigns'),
    ])
      .then(async ([journeyResponse, campaignResponse]) => ({
        response: journeyResponse,
        payload: await journeyResponse.json(),
        campaignPayload: await campaignResponse.json().catch(() => ({})),
        campaignsOk: campaignResponse.ok,
      }))
      .then(({ response, payload, campaignPayload, campaignsOk }) => {
        if (cancelled) return;
        if (!response.ok) {
          setSetupRequired(Boolean(payload.setupRequired));
          setError(payload.error || 'Unable to load journeys');
          return;
        }
        setJourneys(payload.journeys || []);
        if (campaignsOk) setCampaignTemplates((campaignPayload.campaigns || []).filter(campaign => campaign.subject_line && (campaign.html_content || campaign.design_json)));
        setSetupRequired(false);
      })
      .catch(initialError => { if (!cancelled) setError(initialError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const campaignToPlainMessage = campaign => {
    const html = String(campaign.html_content || '');
    if (typeof window !== 'undefined' && html) {
      const container = document.createElement('div');
      container.innerHTML = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n');
      return (container.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 5000);
    }
    return String(campaign.preview_text || campaign.subject_line || '').slice(0, 5000);
  };

  const applyCampaignTemplateToStep = (stepIndex, campaignId) => {
    if (!campaignId) {
      setEditor(current => ({
        ...current,
        steps: current.steps.map((step, index) => index === stepIndex
          ? {
            ...step,
            html_content: null,
            template_campaign_id: null,
            template_campaign_title: null,
          }
          : step),
      }));
      return;
    }
    const campaign = campaignTemplates.find(item => item.id === campaignId);
    if (!campaign) return;
    const htmlContent = String(campaign.html_content || '').trim();
    setEditor(current => ({
      ...current,
      steps: current.steps.map((step, index) => index === stepIndex
        ? {
          ...step,
          type: 'action',
          channel: 'email',
          subject: campaign.subject_line || step.subject || '',
          message: campaignToPlainMessage(campaign) || step.message || '',
          html_content: htmlContent || null,
          template_campaign_id: campaign.id,
          template_campaign_title: campaign.title,
        }
        : step),
    }));
  };

  const createTemplate = async template => {
    setWorkingId(template.id);
    try {
      const response = await adminFetch('/api/admin/journeys', { method: 'POST', body: JSON.stringify(template) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create journey');
      await load();
    } catch (createError) {
      alert(createError.message);
    } finally {
      setWorkingId('');
    }
  };

  const setStatus = async (journey, status) => {
    if (status === 'active' && !confirm(`Activate “${journey.name}”? Eligible contacts will enter on the next 15-minute run.`)) return;
    setWorkingId(journey.id);
    try {
      const response = await adminFetch('/api/admin/journeys', { method: 'PUT', body: JSON.stringify({ id: journey.id, action: 'status', status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update journey');
      await load();
    } catch (statusError) {
      alert(statusError.message);
    } finally {
      setWorkingId('');
    }
  };

  const remove = async journey => {
    if (!confirm(`Delete “${journey.name}” and its enrollment history?`)) return;
    setWorkingId(journey.id);
    try {
      const response = await adminFetch(`/api/admin/journeys?id=${journey.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to delete journey');
      await load();
    } catch (deleteError) {
      alert(deleteError.message);
    } finally {
      setWorkingId('');
    }
  };

  const openEditor = journey => {
    const source = journey || EMPTY_JOURNEY;
    setEditor({
      id: journey?.id,
      name: source.name || '',
      description: source.description || '',
      trigger: { type: source.trigger?.type || 'new_subscriber', days: source.trigger?.days || 30 },
      steps: (source.steps || EMPTY_JOURNEY.steps).map((step, index) => ({ ...step, type: step.type || 'action', id: step.id || `step_${index + 1}` })),
    });
    setEditorError('');
    setAiOpen(false);
    setAiGoal('');
    setStrategyNote('');
    loadCampaignTemplates();
  };

  const updateStep = (index, field, value) => {
    setEditor(current => ({ ...current, steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, [field]: value } : step) }));
  };

  const addStep = () => {
    setEditor(current => ({
      ...current,
      steps: [...current.steps, { id: `step_${Date.now()}`, type: 'action', channel: 'email', delay_hours: 24, subject: '', message: '' }],
    }));
  };

  const removeStep = index => setEditor(current => ({ ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index) }));

  const moveStep = (index, direction) => {
    setEditor(current => {
      const target = index + direction;
      if (target < 0 || target >= current.steps.length) return current;
      const steps = [...current.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...current, steps };
    });
  };

  const saveEditor = async () => {
    setEditorError('');
    if (!editor.name.trim()) return setEditorError('Give this journey a name.');
    if (!editor.steps.length) return setEditorError('Add at least one step.');
    const invalidStep = editor.steps.find(step => step.type !== 'condition' && (!step.message.trim() || (step.channel === 'email' && !step.subject.trim())));
    if (invalidStep) return setEditorError('Every step needs a message, and email steps also need a subject.');

    setWorkingId(editor.id || 'custom');
    try {
      const response = await adminFetch('/api/admin/journeys', {
        method: editor.id ? 'PUT' : 'POST',
        body: JSON.stringify(editor),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save journey');
      setEditor(null);
      await load();
    } catch (saveError) {
      setEditorError(saveError.message);
    } finally {
      setWorkingId('');
    }
  };

  const generateJourney = async () => {
    if (!aiGoal.trim()) return setEditorError('Describe what this journey should accomplish.');
    setGenerating(true);
    setEditorError('');
    try {
      const response = await adminFetch('/api/ai', { method: 'POST', body: JSON.stringify({ mode: 'generate_journey', context: { goal: aiGoal } }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'AI generation failed');
      const cleaned = String(payload.text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const generated = JSON.parse(cleaned);
      if (!generated.name || !generated.trigger?.type || !Array.isArray(generated.steps) || !generated.steps.length) throw new Error('AI returned an incomplete journey. Try a more specific goal.');
      if (!Object.hasOwn(TRIGGER_LABELS, generated.trigger.type)) throw new Error('AI selected an unsupported trigger. Please try again.');
      const invalidGeneratedStep = generated.steps.some(step => step.type === 'condition'
        ? !Object.hasOwn(CONDITION_LABELS, step.condition) || !['stop', 'skip_next', 'continue'].includes(step.on_false)
        : !['email', 'whatsapp'].includes(step.channel) || !String(step.message || '').trim() || (step.channel === 'email' && !String(step.subject || '').trim()));
      if (invalidGeneratedStep) throw new Error('AI returned an unsupported or incomplete step. Please try again.');
      setEditor(current => ({
        ...current,
        name: generated.name,
        description: generated.description || current.description,
        trigger: { type: generated.trigger.type, days: Number(generated.trigger.days || 30) },
        steps: generated.steps.slice(0, 12).map((step, index) => ({
          ...step,
          id: `ai_step_${Date.now()}_${index}`,
          type: step.type === 'condition' ? 'condition' : 'action',
          delay_hours: Math.max(0, Number(step.delay_hours || 0)),
          subject: step.subject || '',
          message: step.message || '',
          on_false: step.on_false || 'stop',
        })),
      }));
      setStrategyNote(String(generated.strategy_note || 'Review every step before saving and activation.'));
      setAiOpen(false);
    } catch (generateError) {
      setEditorError(generateError instanceof SyntaxError ? 'AI returned invalid JSON. Please try again.' : generateError.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="mkt-journeys">
      <div className="mkt-section-header">
        <div>
          <div className="mkt-panel-kicker">Persistent engine</div>
          <h3 className="mkt-section-title">Customer Journeys</h3>
          <p className="mkt-section-description">Contacts enroll automatically and advance through timed email and WhatsApp steps.</p>
        </div>
        <div className="mkt-flex mkt-gap-2">
          <button className="mkt-btn mkt-btn-primary" onClick={() => openEditor()} disabled={setupRequired}><Plus size={14} /> Build journey</button>
          <button className="mkt-btn" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'mkt-spin' : ''} /> Refresh</button>
        </div>
      </div>

      {setupRequired && (
        <div className="mkt-setup-card">
          <AlertTriangle size={20} />
          <div><strong>Database setup required</strong><p>Run <code>marketing-journeys-migration.sql</code> in the Supabase SQL Editor, then refresh.</p></div>
        </div>
      )}
      {error && !setupRequired && <div className="mkt-warning-strip"><AlertTriangle size={15} /> {error}</div>}

      {!setupRequired && journeys.length === 0 && !loading && (
        <div className="mkt-template-grid">
          {TEMPLATES.map(template => (
            <div className="mkt-template-card" key={template.id}>
              <div className="mkt-template-icon">{template.id === 'cart' ? <ShoppingCart size={18} /> : template.id === 'welcome' ? <UserPlus size={18} /> : <Clock size={18} />}</div>
              <h4>{template.name}</h4><p>{template.description}</p>
              <div className="mkt-mini-flow">{template.steps.map((step, index) => <React.Fragment key={index}><span>{step.channel === 'email' ? <Mail size={12} /> : 'WA'} {step.delay_hours ? `${step.delay_hours}h` : 'Now'}</span>{index < template.steps.length - 1 && <i>→</i>}</React.Fragment>)}</div>
              <button className="mkt-btn mkt-btn-primary" onClick={() => createTemplate(template)} disabled={Boolean(workingId)}><Plus size={14} /> Use template</button>
            </div>
          ))}
        </div>
      )}

      {journeys.length > 0 && (
        <div className="mkt-journey-list">
          {journeys.map(journey => (
            <article className="mkt-journey-card" key={journey.id}>
              <div className="mkt-journey-top">
                <div>
                  <div className="mkt-flex mkt-items-center mkt-gap-2">
                    <h4>{journey.name}</h4>
                    <span className={`mkt-badge ${journey.status === 'active' ? 'mkt-badge-success' : journey.status === 'paused' ? 'mkt-badge-warning' : 'mkt-badge-neutral'}`}>{journey.status}</span>
                  </div>
                  <p>{journey.description}</p>
                </div>
                <div className="mkt-flex mkt-gap-2">
                  <button className="mkt-btn" onClick={() => openEditor(journey)} disabled={journey.status === 'active' || workingId === journey.id} title={journey.status === 'active' ? 'Pause before editing' : 'Edit journey'}><Edit3 size={14} /> Edit</button>
                  {journey.status === 'active'
                    ? <button className="mkt-btn" onClick={() => setStatus(journey, 'paused')} disabled={workingId === journey.id}><Pause size={14} /> Pause</button>
                    : <button className="mkt-btn mkt-btn-primary" onClick={() => setStatus(journey, 'active')} disabled={workingId === journey.id}><Play size={14} /> Activate</button>}
                  <button className="mkt-btn mkt-btn-danger" onClick={() => remove(journey)} disabled={workingId === journey.id}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mkt-journey-flow">
                <div className="mkt-trigger-node"><Zap size={14} /><span>Trigger</span><strong>{TRIGGER_LABELS[journey.trigger?.type] || journey.trigger?.type}</strong></div>
                {(journey.steps || []).map((step, index) => (
                  <React.Fragment key={step.id || index}>
                    <div className="mkt-flow-arrow">→<small>{step.delay_hours ? `${step.delay_hours}h` : 'now'}</small></div>
                    <div className={`mkt-step-node ${step.type === 'condition' ? 'condition' : ''}`}>{step.type === 'condition' ? <Zap size={14} /> : step.channel === 'email' ? <Mail size={14} /> : <span className="mkt-wa-mark">WA</span>}<span>{step.type === 'condition' ? 'Decision' : `Step ${index + 1}`}</span><strong>{step.type === 'condition' ? CONDITION_LABELS[step.condition] : step.channel === 'email' ? step.subject : 'WhatsApp message'}</strong></div>
                  </React.Fragment>
                ))}
              </div>
              <div className="mkt-journey-stats">
                <span><strong>{journey.enrollmentStats.total}</strong> enrolled</span>
                <span><strong>{journey.enrollmentStats.active}</strong> in progress</span>
                <span><CheckCircle2 size={13} /><strong>{journey.enrollmentStats.completed}</strong> completed</span>
                <span><strong>{journey.enrollmentStats.stopped || 0}</strong> goal exits</span>
                {(journey.enrollmentStats.failed || 0) > 0 && <span style={{ color: '#f87171' }}><strong>{journey.enrollmentStats.failed}</strong> failed</span>}
              </div>
              <div className="mkt-journey-attribution">
                <div><span>Opens</span><strong>{journey.analytics?.opens || 0}</strong></div>
                <div><span>Clicks</span><strong>{journey.analytics?.clicks || 0}</strong></div>
                <div><span>Direct revenue</span><strong>{formatMoney(journey.analytics?.directRevenue)}</strong><small>{journey.analytics?.directOrders || 0} orders</small></div>
                <div><span>Assisted revenue · 7d</span><strong>{formatMoney(journey.analytics?.assistedRevenue)}</strong><small>{journey.analytics?.assistedOrders || 0} orders</small></div>
              </div>
            </article>
          ))}
          <div className="mkt-template-actions">
            {TEMPLATES.map(template => <button key={template.id} className="mkt-btn" onClick={() => createTemplate(template)} disabled={Boolean(workingId)}><Plus size={13} /> {template.name}</button>)}
          </div>
        </div>
      )}

      {editor && (
        <div className="mkt-modal-backdrop" onClick={() => setEditor(null)}>
          <div className="mkt-journey-editor" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Journey builder">
            <div className="mkt-editor-header">
              <div><div className="mkt-panel-kicker">Journey builder</div><h3>{editor.id ? 'Edit journey' : 'Build a custom journey'}</h3></div>
              <div className="mkt-flex mkt-gap-2"><button className="mkt-btn mkt-ai-btn" onClick={() => setAiOpen(current => !current)}><Sparkles size={14} /> Generate with AI</button><button className="mkt-btn mkt-btn-icon" onClick={() => setEditor(null)} aria-label="Close journey builder"><X size={17} /></button></div>
            </div>

            {aiOpen && <div className="mkt-ai-journey-panel">
              <div><Sparkles size={18} /><div><strong>AI Journey Copilot</strong><span>Describe the outcome, audience, offer, and preferred channels.</span></div></div>
              <textarea className="mkt-textarea" rows="3" value={aiGoal} onChange={event => setAiGoal(event.target.value)} placeholder="Example: Recover high-value abandoned carts with one email and a careful WhatsApp follow-up, but stop after purchase." />
              <div className="mkt-flex mkt-justify-between mkt-items-center"><span className="mkt-muted">AI creates a draft only. You remain in control of activation.</span><button className="mkt-btn mkt-btn-primary" onClick={generateJourney} disabled={generating}>{generating ? <Loader2 className="mkt-spin" size={14} /> : <Sparkles size={14} />} Generate draft</button></div>
            </div>}
            {strategyNote && <div className="mkt-ai-strategy"><Sparkles size={14} /><div><strong>Copilot strategy</strong><span>{strategyNote}</span></div></div>}

            <div className="mkt-editor-fields">
              <label><span>Journey name</span><input className="mkt-input" value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} placeholder="High-intent follow-up" /></label>
              <label><span>Description</span><input className="mkt-input" value={editor.description} onChange={event => setEditor({ ...editor, description: event.target.value })} placeholder="What this journey should accomplish" /></label>
              <label><span>Enrollment trigger</span>
                <select className="mkt-select" value={editor.trigger.type} onChange={event => setEditor({ ...editor, trigger: { ...editor.trigger, type: event.target.value } })}>
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {editor.trigger.type === 'reorder_due' && <label><span>Days after order</span><input className="mkt-input" type="number" min="1" max="365" value={editor.trigger.days} onChange={event => setEditor({ ...editor, trigger: { ...editor.trigger, days: Number(event.target.value) } })} /></label>}
            </div>

            <div className="mkt-builder-trigger"><Zap size={15} /><div><span>START WHEN</span><strong>{TRIGGER_LABELS[editor.trigger.type]}</strong></div></div>
            <div className="mkt-editor-steps">
              {editor.steps.map((step, index) => (
                <div className="mkt-editor-step" key={step.id}>
                  <div className="mkt-editor-step-head">
                    <div><span>STEP {index + 1}</span><strong>{step.type === 'condition' ? 'Decision gate' : step.channel === 'email' ? 'Send email' : 'Send WhatsApp'}</strong></div>
                    <div className="mkt-flex mkt-gap-1">
                      <button className="mkt-btn mkt-btn-icon" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label="Move step up"><ArrowUp size={13} /></button>
                      <button className="mkt-btn mkt-btn-icon" onClick={() => moveStep(index, 1)} disabled={index === editor.steps.length - 1} aria-label="Move step down"><ArrowDown size={13} /></button>
                      <button className="mkt-btn mkt-btn-icon mkt-btn-danger" onClick={() => removeStep(index)} disabled={editor.steps.length === 1} aria-label="Remove step"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="mkt-step-settings">
                    <label><span>Step type</span><select className="mkt-select" value={step.type === 'condition' ? 'condition' : step.channel} onChange={event => {
                      const value = event.target.value;
                      setEditor(current => ({ ...current, steps: current.steps.map((item, stepIndex) => stepIndex !== index ? item : value === 'condition'
                        ? { id: item.id, type: 'condition', condition: 'has_active_cart', on_false: 'stop', delay_hours: item.delay_hours || 0 }
                        : { id: item.id, type: 'action', channel: value, delay_hours: item.delay_hours || 0, subject: value === 'email' ? (item.subject || '') : '', message: item.message || '' }) }));
                    }}><option value="email">Send email</option><option value="whatsapp">Send WhatsApp</option><option value="condition">Decision gate</option></select></label>
                    <label><span>Wait before step</span><div className="mkt-delay-input"><input className="mkt-input" type="number" min="0" max="8760" value={step.delay_hours} onChange={event => updateStep(index, 'delay_hours', Number(event.target.value))} /><em>hours</em></div></label>
                  </div>
                  {step.type === 'condition' ? <div className="mkt-condition-settings">
                    <label className="mkt-editor-label"><span>Continue only when</span><select className="mkt-select" value={step.condition} onChange={event => updateStep(index, 'condition', event.target.value)}>{Object.entries(CONDITION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    <label className="mkt-editor-label"><span>If condition is false</span><select className="mkt-select" value={step.on_false} onChange={event => updateStep(index, 'on_false', event.target.value)}><option value="stop">Stop the journey</option><option value="skip_next">Skip the next step</option><option value="continue">Continue anyway</option></select></label>
                  </div> : <>
                    {step.channel === 'email' && (
                      <div className="mkt-editor-label">
                        <span>Use saved email template</span>
                        <select className="mkt-select" value={step.template_campaign_id || ''} onChange={event => applyCampaignTemplateToStep(index, event.target.value)}>
                          <option value="">Choose a Marketing Studio email...</option>
                          {campaignTemplates.map(campaign => (
                            <option key={campaign.id} value={campaign.id}>{campaign.title || campaign.subject_line}</option>
                          ))}
                        </select>
                        {step.html_content && <small className="mkt-muted">This step will send the saved drag-and-drop email layout.</small>}
                      </div>
                    )}
                    {step.channel === 'email' && <label className="mkt-editor-label"><span>Subject</span><input className="mkt-input" value={step.subject || ''} onChange={event => updateStep(index, 'subject', event.target.value)} placeholder="Hi [FIRST_NAME], a quick follow-up" /></label>}
                    <label className="mkt-editor-label"><span>Message</span><textarea className="mkt-textarea" rows="5" value={step.message} onChange={event => updateStep(index, 'message', event.target.value)} placeholder="Write the message. Use [FIRST_NAME] for personalization." /></label>
                  </>}
                </div>
              ))}
            </div>
            <button className="mkt-add-step" onClick={addStep} disabled={editor.steps.length >= 12}><Plus size={15} /> Add another step</button>
            <div className="mkt-editor-footer">
              <div>{editorError ? <span className="mkt-editor-error"><AlertTriangle size={14} /> {editorError}</span> : <span className="mkt-muted">Saved as a draft. Activate it when you are ready.</span>}</div>
              <div className="mkt-flex mkt-gap-2"><button className="mkt-btn" onClick={() => setEditor(null)}>Cancel</button><button className="mkt-btn mkt-btn-primary" onClick={saveEditor} disabled={Boolean(workingId)}><Save size={14} /> Save draft</button></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
