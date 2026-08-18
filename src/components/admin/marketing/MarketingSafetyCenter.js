"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { useMarketingFeedback } from './useMarketingFeedback';

export default function MarketingSafetyCenter() {
  const { notify, confirm, feedback } = useMarketingFeedback();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [form, setForm] = useState({ identity: '', channel: 'email', reason: 'manual' });
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/marketing-safety');
      const payload = await response.json();
      if (!response.ok) {
        setSetupRequired(Boolean(payload.setupRequired));
        throw new Error(payload.error || 'Unable to load safety data');
      }
      setData(payload);
      setSetupRequired(false);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/admin/marketing-safety')
      .then(async response => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (!response.ok) {
          setSetupRequired(Boolean(payload.setupRequired));
          setError(payload.error || 'Unable to load safety data');
          return;
        }
        setData(payload);
      })
      .catch(initialError => { if (!cancelled) setError(initialError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const addSuppression = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/marketing-safety', { method: 'POST', body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to suppress contact');
      setForm(current => ({ ...current, identity: '' }));
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const removeSuppression = async item => {
    const confirmed = await confirm({
      title: 'Allow marketing again?',
      message: item.identity,
      detail: 'They were suppressed for a reason — a bounce, a complaint or an unsubscribe. Re-mailing a complainer costs sender reputation.',
      confirmLabel: 'Remove suppression',
      tone: 'danger',
    });
    if (!confirmed) return;
    const response = await adminFetch(`/api/admin/marketing-safety?id=${item.id}`, { method: 'DELETE' });
    if (response.ok) await load();
  };

  const suppressions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.suppressions || []).filter(item => !query || `${item.identity} ${item.reason} ${item.channel}`.toLowerCase().includes(query));
  }, [data, search]);

  if (loading && !data) return <div className="mkt-loading-state"><RefreshCw className="mkt-spin" size={22} /> Loading delivery safety…</div>;

  const summary = data?.summary || {};
  return (
    <div className="mkt-safety-center mkt-fade-in">
      <div className="mkt-section-header">
        <div><div className="mkt-panel-kicker">Deliverability controls</div><h3 className="mkt-section-title">Marketing Safety Center</h3><p className="mkt-section-description">Global opt-outs, blocked recipients, delivery health, and retry visibility.</p></div>
        <button className="mkt-btn" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'mkt-spin' : ''} /> Refresh</button>
      </div>

      {setupRequired && <div className="mkt-setup-card"><AlertTriangle size={20} /><div><strong>Database setup required</strong><p>Run <code>marketing-safety-migration.sql</code> in Supabase, then refresh.</p></div></div>}
      {error && <div className="mkt-warning-strip" style={{ marginBottom: 12 }}><AlertTriangle size={15} /> {error}</div>}

      {!setupRequired && data && <>
        {!summary.webhookConfigured && <div className="mkt-warning-strip" style={{ marginBottom: 12 }}><AlertTriangle size={15} /> Set DELIVERY_WEBHOOK_SECRET to accept authenticated bounce and complaint callbacks.</div>}
        <div className="mkt-stats-grid mkt-mb-4">
          {[
            ['Active suppressions', summary.suppressed, Ban, '#f87171'],
            ['Delivered · 24h', summary.delivered24h, CheckCircle2, '#34d399'],
            ['Failed · 24h', summary.failed24h, AlertTriangle, '#fbbf24'],
            ['Bounces / complaints', (summary.bounced24h || 0) + (summary.complained24h || 0), Ban, '#fb7185'],
            ['Retries · 24h', summary.retries24h, RotateCcw, '#60a5fa'],
          ].map(([label, value, Icon, color]) => <div className="mkt-stat-card" key={label}><div className="mkt-stat-icon" style={{ color, background: `${color}18` }}><Icon size={17} /></div><div><div className="mkt-stat-value">{value || 0}</div><div className="mkt-stat-label">{label}</div></div></div>)}
        </div>

        <div className="mkt-safety-grid">
          <form className="mkt-panel" onSubmit={addSuppression}>
            <div className="mkt-panel-header"><div><div className="mkt-panel-kicker">Do not contact</div><h4 className="mkt-panel-title">Add suppression</h4></div><ShieldCheck size={20} /></div>
            <label className="mkt-editor-label"><span>Email or phone</span><input className="mkt-input" value={form.identity} onChange={event => setForm({ ...form, identity: event.target.value })} placeholder={form.channel === 'email' ? 'customer@example.com' : '50688888888'} required /></label>
            <label className="mkt-editor-label"><span>Channel</span><select className="mkt-select" value={form.channel} onChange={event => setForm({ ...form, channel: event.target.value })}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="all">All marketing</option></select></label>
            <label className="mkt-editor-label"><span>Reason</span><select className="mkt-select" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })}><option value="manual">Manual block</option><option value="customer_request">Customer request</option><option value="complaint">Complaint</option><option value="hard_bounce">Hard bounce</option></select></label>
            <button className="mkt-btn mkt-btn-danger mkt-w-full mkt-mt-4" disabled={saving}>{saving ? 'Saving…' : 'Suppress contact'}</button>
          </form>

          <div className="mkt-panel">
            <div className="mkt-panel-header"><div><div className="mkt-panel-kicker">Enforced globally</div><h4 className="mkt-panel-title">Suppression list</h4></div><span className="mkt-badge mkt-badge-danger">{suppressions.length}</span></div>
            <div className="mkt-search-wrap mkt-w-full"><Search size={15} /><input className="mkt-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search suppressions…" /></div>
            <div className="mkt-suppression-list">
              {suppressions.length === 0 ? <div className="mkt-empty-compact"><ShieldCheck size={24} /><span>No matching suppressions</span></div> : suppressions.map(item => <div className="mkt-suppression-row" key={item.id}><div><strong>{item.identity}</strong><span>{item.channel} · {item.reason.replaceAll('_', ' ')}</span></div><button className="mkt-btn mkt-btn-icon" onClick={() => removeSuppression(item)} title="Remove suppression"><Trash2 size={13} /></button></div>)}
            </div>
          </div>
        </div>
      </>}
      {feedback}
    </div>
  );
}
