'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  DEFAULT_LANDING_LEAD_SETTINGS,
  LANDING_LEAD_SETTINGS_ID,
  normalizeLandingLeadSettings,
} from '@/lib/landingLeadSettings.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const inputStyle = { width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#f8fafc', padding: '9px 10px', fontSize: '.8rem' };
const smallButton = { border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#cbd5e1', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 };

export default function LandingLeadSettingsManager() {
  const [settings, setSettings] = useState(clone(DEFAULT_LANDING_LEAD_SETTINGS));
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
      const { data, error } = await supabase.from('site_settings').select('value').eq('id', LANDING_LEAD_SETTINGS_ID).maybeSingle();
      if (!active) return;
      if (error) setMessage(`Could not load saved settings: ${error.message}`);
      setSettings(normalizeLandingLeadSettings(data?.value));

      // Offer the same people the server will actually accept, so the dropdown
      // cannot be used to name an agent who would silently fall back to rotation.
      const { data: profiles } = await supabase.from('admin_profiles').select('name, email, permissions, status');
      if (!active) return;
      setAgents((profiles || [])
        .filter((profile) => profile.email && (profile.status || 'active') === 'active')
        .filter((profile) => Array.isArray(profile.permissions) && profile.permissions.includes('leads'))
        .sort((left, right) => String(left.name || left.email).localeCompare(String(right.name || right.email))));
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const changeSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const changeQuestion = (index, key, value) => setSettings((current) => {
    const questions = clone(current.questions);
    questions[index][key] = value;
    return { ...current, questions };
  });
  const changeOption = (questionIndex, optionIndex, key, value) => setSettings((current) => {
    const questions = clone(current.questions);
    questions[questionIndex].options[optionIndex][key] = value;
    return { ...current, questions };
  });
  const moveQuestion = (index, direction) => setSettings((current) => {
    const questions = clone(current.questions);
    const target = index + direction;
    if (target < 0 || target >= questions.length) return current;
    [questions[index], questions[target]] = [questions[target], questions[index]];
    return { ...current, questions };
  });
  const addQuestion = () => setSettings((current) => {
    const nextNumber = current.questions.length + 1;
    return {
      ...current,
      questions: [...current.questions, {
        id: `question-${Date.now()}`,
        titleEn: `Question ${nextNumber}`,
        titleEs: `Pregunta ${nextNumber}`,
        subtitleEn: '', subtitleEs: '',
        options: [{ id: `option-${Date.now()}`, labelEn: 'New option', labelEs: 'Nueva opción' }],
      }],
    };
  });
  const removeQuestion = (index) => setSettings((current) => ({ ...current, questions: current.questions.filter((_, itemIndex) => itemIndex !== index) }));
  const addOption = (questionIndex) => setSettings((current) => {
    const questions = clone(current.questions);
    questions[questionIndex].options.push({ id: `option-${Date.now()}`, labelEn: 'New option', labelEs: 'Nueva opción' });
    return { ...current, questions };
  });
  const removeOption = (questionIndex, optionIndex) => setSettings((current) => {
    const questions = clone(current.questions);
    if (questions[questionIndex].options.length <= 1) return current;
    questions[questionIndex].options.splice(optionIndex, 1);
    return { ...current, questions };
  });

  const save = async () => {
    if (!isSupabaseConfigured || !supabase) { setMessage('Supabase is not configured.'); return; }
    if (!settings.questions.length) { setMessage('Add at least one qualification question.'); return; }
    setSaving(true); setMessage('');
    const normalized = normalizeLandingLeadSettings(settings);
    const { error } = await supabase.from('site_settings').upsert({ id: LANDING_LEAD_SETTINGS_ID, value: normalized });
    if (error) setMessage(`Save failed: ${error.message}`);
    else { setSettings(normalized); setMessage('Lead form settings published. New visitors will receive these questions.'); }
    setSaving(false);
  };

  if (loading) return <div style={{ color: '#94a3b8', padding: 20 }}>Loading lead form settings…</div>;

  return (
    <section style={{ background: '#0e1626', border: '1px solid rgba(56,189,248,.2)', borderRadius: 14, padding: 22, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#38bdf8', textTransform: 'uppercase', fontSize: '.7rem', fontWeight: 800, letterSpacing: '.08em' }}>Lead capture system</div>
          <h3 style={{ color: '#f8fafc', margin: '5px 0', fontSize: '1.05rem' }}>Landing questionnaire, assignment and response SLA</h3>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: '.8rem', maxWidth: 760, lineHeight: 1.5 }}>Edit the bilingual questions shown at /landing. Answers appear as structured fields in Leads → Lead Profile. Choose below whether new leads rotate across the team or all go to one agent.</p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={save} disabled={saving}><Save size={15} /> {saving ? 'Publishing…' : 'Publish lead form'}</button>
      </div>

      {message && <div style={{ background: message.includes('failed') || message.includes('Could not') ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)', color: message.includes('failed') || message.includes('Could not') ? '#fca5a5' : '#86efac', borderRadius: 8, padding: '10px 12px', fontSize: '.8rem', marginBottom: 16 }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, background: '#172237', borderRadius: 10, padding: 15, marginBottom: 18 }}>
        <label style={{ color: '#cbd5e1', fontSize: '.76rem' }}>Response deadline (minutes)<input style={{ ...inputStyle, marginTop: 6 }} type="number" min="5" max="1440" value={settings.responseSlaMinutes} onChange={(event) => changeSetting('responseSlaMinutes', Number(event.target.value))} /></label>
        <label style={{ color: '#cbd5e1', fontSize: '.76rem' }}>Auto-open delay (milliseconds)<input style={{ ...inputStyle, marginTop: 6 }} type="number" min="0" max="60000" value={settings.timeTriggerMs} onChange={(event) => changeSetting('timeTriggerMs', Number(event.target.value))} /></label>
        <label style={{ color: '#cbd5e1', fontSize: '.76rem' }}>Scroll trigger (%)<input style={{ ...inputStyle, marginTop: 6 }} type="number" min="10" max="95" value={settings.scrollTriggerPct} onChange={(event) => changeSetting('scrollTriggerPct', Number(event.target.value))} /></label>
        <label style={{ color: '#cbd5e1', fontSize: '.76rem' }}>Consent version<input style={{ ...inputStyle, marginTop: 6 }} value={settings.consentVersion} onChange={(event) => changeSetting('consentVersion', event.target.value)} /></label>
        <label style={{ color: '#cbd5e1', fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={settings.autoOpenEnabled} onChange={(event) => changeSetting('autoOpenEnabled', event.target.checked)} /> Auto-open questionnaire</label>
        <label style={{ color: '#cbd5e1', fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={settings.exitIntentEnabled} onChange={(event) => changeSetting('exitIntentEnabled', event.target.checked)} /> Desktop exit-intent trigger</label>
      </div>

      <div style={{ background: '#172237', borderRadius: 10, padding: 15, marginBottom: 18 }}>
        <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '.86rem', marginBottom: 4 }}>Who gets new landing leads</div>
        <p style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: '.76rem', lineHeight: 1.5 }}>
          A contact an agent already owns always stays with that agent — this only decides where brand-new leads go.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
          <label style={{ color: '#cbd5e1', fontSize: '.76rem' }}>Assignment
            <select
              style={{ ...inputStyle, marginTop: 6 }}
              value={settings.assignmentMode}
              onChange={(event) => changeSetting('assignmentMode', event.target.value)}
            >
              <option value="round_robin">Round-robin across all agents</option>
              <option value="fixed">Always one agent</option>
            </select>
          </label>
          {settings.assignmentMode === 'fixed' && (
            <label style={{ color: '#cbd5e1', fontSize: '.76rem' }}>Send every lead to
              <select
                style={{ ...inputStyle, marginTop: 6 }}
                value={settings.assignedAgentEmail}
                onChange={(event) => changeSetting('assignedAgentEmail', event.target.value)}
              >
                <option value="">Choose an agent…</option>
                {agents.map((agent) => (
                  <option key={agent.email} value={String(agent.email).toLowerCase()}>
                    {agent.name || agent.email}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {settings.assignmentMode === 'fixed' && !settings.assignedAgentEmail && (
          <div style={{ color: '#fbbf24', fontSize: '.74rem', marginTop: 10 }}>
            No agent chosen yet — until one is picked, leads keep rotating across the team.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12, marginBottom: 18 }}>
        <label style={{ color: '#cbd5e1', fontSize: '.76rem' }}>Consent text EN<textarea style={{ ...inputStyle, marginTop: 6, minHeight: 86, resize: 'vertical' }} value={settings.consentEn} onChange={(event) => changeSetting('consentEn', event.target.value)} /></label>
        <label style={{ color: '#cbd5e1', fontSize: '.76rem' }}>Consent text ES<textarea style={{ ...inputStyle, marginTop: 6, minHeight: 86, resize: 'vertical' }} value={settings.consentEs} onChange={(event) => changeSetting('consentEs', event.target.value)} /></label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {settings.questions.map((question, questionIndex) => (
          <article key={question.id} style={{ background: '#172237', border: '1px solid rgba(255,255,255,.07)', borderRadius: 11, padding: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ color: '#f8fafc', fontSize: '.86rem' }}>Question {questionIndex + 1} <span style={{ color: '#64748b', fontFamily: 'monospace', fontWeight: 400 }}>({question.id})</span></strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={smallButton} onClick={() => moveQuestion(questionIndex, -1)} disabled={questionIndex === 0} aria-label="Move question up"><ArrowUp size={13} /></button>
                <button type="button" style={smallButton} onClick={() => moveQuestion(questionIndex, 1)} disabled={questionIndex === settings.questions.length - 1} aria-label="Move question down"><ArrowDown size={13} /></button>
                <button type="button" style={{ ...smallButton, color: '#f87171' }} onClick={() => removeQuestion(questionIndex)} disabled={settings.questions.length <= 1}><Trash2 size={13} /> Remove</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10 }}>
              {[['Title EN','titleEn'],['Título ES','titleEs'],['Subtitle EN','subtitleEn'],['Subtítulo ES','subtitleEs']].map(([label, key]) => <label key={key} style={{ color: '#94a3b8', fontSize: '.72rem' }}>{label}<input style={{ ...inputStyle, marginTop: 4 }} value={question[key]} onChange={(event) => changeQuestion(questionIndex, key, event.target.value)} /></label>)}
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {question.options.map((option, optionIndex) => (
                <div key={option.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <label style={{ color: '#94a3b8', fontSize: '.68rem' }}>Option EN<input style={{ ...inputStyle, marginTop: 3 }} value={option.labelEn} onChange={(event) => changeOption(questionIndex, optionIndex, 'labelEn', event.target.value)} /></label>
                  <label style={{ color: '#94a3b8', fontSize: '.68rem' }}>Opción ES<input style={{ ...inputStyle, marginTop: 3 }} value={option.labelEs} onChange={(event) => changeOption(questionIndex, optionIndex, 'labelEs', event.target.value)} /></label>
                  <button type="button" style={{ ...smallButton, color: '#f87171', height: 35 }} onClick={() => removeOption(questionIndex, optionIndex)} disabled={question.options.length <= 1} aria-label="Remove option"><Trash2 size={13} /></button>
                </div>
              ))}
              <button type="button" style={{ ...smallButton, alignSelf: 'flex-start', color: '#7dd3fc' }} onClick={() => addOption(questionIndex)}><Plus size={13} /> Add option</button>
            </div>
          </article>
        ))}
      </div>
      <button type="button" style={{ ...smallButton, marginTop: 14, color: '#7dd3fc' }} onClick={addQuestion}><Plus size={14} /> Add question</button>
    </section>
  );
}

