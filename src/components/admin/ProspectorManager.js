"use client";

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, ChevronRight,
  ExternalLink, Globe2, ListFilter, Loader2, Mail, MapPin, MapPinned,
  Phone, Plus, RefreshCw, Save, Search, ShieldCheck, Sparkles,
  Trash2, UserRoundCheck, X,
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import {
  CONTACT_PERMISSION_STATUSES,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
  scoreProspect,
} from '@/lib/prospects.mjs';

const EMPTY_FORM = {
  organization_name: '',
  category: '',
  phone: '',
  email: '',
  website_url: '',
  formatted_address: '',
  city: '',
  region: '',
  country: 'Costa Rica',
  latitude: '',
  longitude: '',
  notes: '',
  contact_permission_status: 'unknown',
};

const PERMISSION_LABELS = {
  unknown: 'Permission unknown',
  business_contact: 'Public business contact',
  consented: 'Marketing consent recorded',
  do_not_contact: 'Do not contact',
};

const CATEGORY_SUGGESTIONS = [
  'Gyms and personal trainers',
  'Wellness centers',
  'Nutrition practices',
  'Sports recovery clinics',
  'Aesthetic clinics',
  'Research laboratories',
];

function locationLabel(prospect) {
  return [prospect.city, prospect.region, prospect.country].filter(Boolean).join(', ')
    || prospect.formatted_address
    || 'Location not recorded';
}

function sourceLabel(source) {
  if (source === 'openstreetmap') return 'OpenStreetMap';
  if (source === 'google_places') return 'Google Places';
  if (source === 'manual') return 'Manual';
  return String(source || 'Manual').replaceAll('_', ' ');
}

function localInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function scoreTone(score) {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export default function ProspectorManager({ currentUserProfile }) {
  const [view, setView] = useState('discover');
  const [prospects, setProspects] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedSaved, setSelectedSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbSetupRequired, setDbSetupRequired] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('Gyms and personal trainers');
  const [location, setLocation] = useState('San José');
  const [savedSearch, setSavedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_FORM);
  const [notesDraft, setNotesDraft] = useState('');

  const currentEmail = currentUserProfile?.email || '';

  const loadProspects = async ({ preserveSelection = true } = {}) => {
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/prospects');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load prospects');
      const next = payload.prospects || [];
      setProspects(next);
      setDbSetupRequired(Boolean(payload.setupRequired));
      if (preserveSelection && selectedSaved && selected?.id) {
        const refreshed = next.find((item) => item.id === selected.id);
        if (refreshed) {
          setSelected(refreshed);
          setNotesDraft(refreshed.notes || '');
        }
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    adminFetch('/api/admin/prospects')
      .then(async (response) => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || 'Unable to load prospects');
        setProspects(payload.prospects || []);
        setDbSetupRequired(Boolean(payload.setupRequired));
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setNotesDraft(selectedSaved ? selected?.notes || '' : '');
  }, [selected, selectedSaved]);

  const stats = useMemo(() => ({
    saved: prospects.length,
    qualified: prospects.filter((item) => ['qualified', 'responded', 'partner', 'won'].includes(item.status)).length,
    due: prospects.filter((item) => item.next_follow_up_at && new Date(item.next_follow_up_at) <= new Date() && !['won', 'lost', 'do_not_contact'].includes(item.status)).length,
  }), [prospects]);

  const filteredSaved = useMemo(() => {
    const search = savedSearch.trim().toLowerCase();
    return prospects.filter((prospect) => {
      if (statusFilter === 'active' && ['won', 'lost', 'do_not_contact'].includes(prospect.status)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'active' && prospect.status !== statusFilter) return false;
      if (!search) return true;
      return [
        prospect.organization_name, prospect.category, prospect.city, prospect.region,
        prospect.phone, prospect.email, prospect.owner_email,
      ].filter(Boolean).join(' ').toLowerCase().includes(search);
    });
  }, [prospects, savedSearch, statusFilter]);

  const visibleResults = view === 'discover' ? searchResults : filteredSaved;

  const chooseProspect = (prospect, saved = false) => {
    setSelected(prospect);
    setSelectedSaved(saved);
    setError('');
  };

  const runSearch = async (event) => {
    event?.preventDefault();
    setSearching(true);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/prospects/search', {
        method: 'POST',
        body: JSON.stringify({ mode: 'search', query, location }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to search businesses');
      }
      const results = payload.prospects || [];
      setSearchResults(results);
      if (results[0]) chooseProspect(results[0], false);
      else setSelected(null);
      setSelectedSaved(false);
      setNotice(results.length ? `${results.length} businesses found` : 'No matching businesses found');
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setSearching(false);
    }
  };

  const saveProspect = async (prospect, extra = {}) => {
    if (dbSetupRequired) {
      setError('Run prospector-migration.sql before saving prospects.');
      return null;
    }
    setSaving(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/prospects', {
        method: 'POST',
        body: JSON.stringify({ ...prospect, ...extra }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.setupRequired) setDbSetupRequired(true);
        throw new Error(payload.error || 'Unable to save prospect');
      }
      setProspects((current) => [payload.prospect, ...current.filter((item) => item.id !== payload.prospect.id)]);
      setSelected(payload.prospect);
      setSelectedSaved(true);
      setNotice(`${payload.prospect.organization_name} saved to Prospector`);
      return payload.prospect;
    } catch (saveError) {
      setError(saveError.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateSelected = async (updates, successMessage = 'Prospect updated') => {
    if (!selectedSaved || !selected?.id) return;
    setSaving(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/prospects', {
        method: 'PATCH',
        body: JSON.stringify({ id: selected.id, ...updates }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update prospect');
      setSelected(payload.prospect);
      setProspects((current) => current.map((item) => item.id === payload.prospect.id ? payload.prospect : item));
      setNotice(successMessage);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setSaving(false);
    }
  };

  const enrichSelected = async () => {
    if (!selected?.website_url) return;
    setEnriching(true);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/prospects/enrich', {
        method: 'POST',
        body: JSON.stringify({ website_url: selected.website_url }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to scan the business website');
      if (!payload.email && !payload.phone) {
        setNotice(`No public email or phone found across ${payload.pagesScanned?.length || 1} website page(s).`);
        return;
      }
      const updates = {
        email: payload.email || selected.email || null,
        phone: payload.phone || selected.phone || null,
        contact_permission_status: payload.permissionStatus,
        contact_source_url: payload.sourceUrl,
        enriched_at: new Date().toISOString(),
      };
      if (selectedSaved) {
        await updateSelected(updates, `Found ${payload.emails.length} public email(s) and ${payload.phones.length} public phone(s)`);
      } else {
        setSelected((current) => {
          const enriched = { ...current, ...updates };
          const scored = scoreProspect(enriched);
          return { ...enriched, fit_score: scored.score, fit_reasons: scored.reasons };
        });
        setNotice(`Found ${payload.emails.length} public email(s) and ${payload.phones.length} public phone(s). Save the prospect to keep them.`);
      }
    } catch (enrichmentError) {
      setError(enrichmentError.message);
    } finally {
      setEnriching(false);
    }
  };

  const saveManualProspect = async (event) => {
    event.preventDefault();
    const saved = await saveProspect({ ...manualForm, source_provider: 'manual' });
    if (saved) {
      setManualForm(EMPTY_FORM);
      setManualOpen(false);
      setView('saved');
    }
  };

  const deleteSelected = async () => {
    if (!selectedSaved || !selected?.id) return;
    if (!confirm(`Delete ${selected.organization_name} from Prospector?`)) return;
    setSaving(true);
    try {
      const response = await adminFetch(`/api/admin/prospects?id=${encodeURIComponent(selected.id)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to delete prospect');
      setProspects((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setSelectedSaved(false);
      setNotice('Prospect deleted');
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  const mapQuery = selected
    ? selected.latitude != null && selected.longitude != null
      ? `${selected.latitude},${selected.longitude}`
      : selected.formatted_address || locationLabel(selected)
    : '';
  const hasCoordinates = selected && Number.isFinite(Number(selected.latitude)) && Number.isFinite(Number(selected.longitude));
  const mapSrc = hasCoordinates
    ? (() => {
        const latitude = Number(selected.latitude);
        const longitude = Number(selected.longitude);
        const delta = 0.018;
        const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(',');
        return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
      })()
    : '';

  return (
    <div className="admin-tab-panel prospector-shell">
      <style>{`
        .prospector-shell { color: #e5edf8; }
        .prospector-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
        .prospector-heading { display:flex; align-items:center; gap:12px; }
        .prospector-heading-icon { width:44px; height:44px; border-radius:13px; display:grid; place-items:center; background:linear-gradient(135deg,#2563eb,#0ea5e9); box-shadow:0 8px 24px rgba(14,165,233,.22); }
        .prospector-heading h2 { margin:0; font-size:1.25rem; }
        .prospector-heading p { margin:4px 0 0; color:#94a3b8; font-size:.86rem; }
        .prospector-header-actions { display:flex; flex-wrap:wrap; gap:8px; }
        .prospector-btn { min-height:38px; border-radius:9px; border:1px solid rgba(148,163,184,.2); padding:8px 13px; background:#111d30; color:#dce7f6; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:7px; }
        .prospector-btn:hover { border-color:rgba(56,189,248,.55); background:#14243a; }
        .prospector-btn.primary { background:linear-gradient(135deg,#2563eb,#0ea5e9); border-color:transparent; color:#fff; }
        .prospector-btn.danger { color:#fca5a5; border-color:rgba(248,113,113,.22); }
        .prospector-btn:disabled { opacity:.55; cursor:not-allowed; }
        .prospector-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:16px; }
        .prospector-stat { background:#0e1929; border:1px solid rgba(148,163,184,.12); border-radius:11px; padding:12px 14px; display:flex; align-items:center; gap:10px; }
        .prospector-stat svg { color:#38bdf8; }
        .prospector-stat strong { display:block; font-size:1.1rem; }
        .prospector-stat span { color:#94a3b8; font-size:.76rem; }
        .prospector-tabs { display:flex; gap:6px; margin-bottom:14px; border-bottom:1px solid rgba(148,163,184,.14); }
        .prospector-tab { border:0; background:transparent; color:#94a3b8; padding:10px 13px; cursor:pointer; display:inline-flex; gap:7px; align-items:center; font-weight:700; border-bottom:2px solid transparent; }
        .prospector-tab.active { color:#7dd3fc; border-bottom-color:#38bdf8; }
        .prospector-alert { display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:10px; margin-bottom:12px; background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.2); color:#fde68a; }
        .prospector-alert.error { background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.22); color:#fecaca; }
        .prospector-alert.success { background:rgba(34,197,94,.08); border-color:rgba(34,197,94,.2); color:#bbf7d0; }
        .prospector-searchbar { display:grid; grid-template-columns:minmax(220px,1.3fr) minmax(150px,.75fr) auto; gap:9px; margin-bottom:14px; }
        .prospector-input,.prospector-select,.prospector-textarea { width:100%; border:1px solid rgba(148,163,184,.18); background:#0d1727; color:#e5edf8; border-radius:9px; padding:9px 11px; outline:none; }
        .prospector-input:focus,.prospector-select:focus,.prospector-textarea:focus { border-color:#38bdf8; box-shadow:0 0 0 3px rgba(56,189,248,.1); }
        .prospector-workspace { display:grid; grid-template-columns:minmax(250px,.72fr) minmax(360px,1.25fr) minmax(290px,.82fr); min-height:520px; border:1px solid rgba(148,163,184,.14); border-radius:13px; overflow:hidden; background:#0b1524; }
        .prospector-results { border-right:1px solid rgba(148,163,184,.14); background:#0d1727; min-width:0; }
        .prospector-results-head { padding:13px 14px; border-bottom:1px solid rgba(148,163,184,.12); color:#94a3b8; font-size:.78rem; font-weight:800; display:flex; justify-content:space-between; }
        .prospector-result-list { max-height:474px; overflow:auto; }
        .prospector-result { width:100%; border:0; border-bottom:1px solid rgba(148,163,184,.1); background:transparent; color:#e2e8f0; padding:13px 14px; text-align:left; cursor:pointer; display:grid; grid-template-columns:1fr auto; gap:9px; }
        .prospector-result:hover,.prospector-result.active { background:rgba(37,99,235,.12); }
        .prospector-result.active { box-shadow:inset 3px 0 #38bdf8; }
        .prospector-result strong { display:block; font-size:.88rem; margin-bottom:4px; }
        .prospector-result small { color:#94a3b8; display:block; line-height:1.4; }
        .prospector-score { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; font-size:.78rem; font-weight:900; }
        .prospector-score.high { background:rgba(34,197,94,.12); color:#86efac; }
        .prospector-score.medium { background:rgba(245,158,11,.12); color:#fcd34d; }
        .prospector-score.low { background:rgba(148,163,184,.12); color:#cbd5e1; }
        .prospector-map { position:relative; min-height:520px; background:radial-gradient(circle at center,#1c3048,#0b1524 70%); }
        .prospector-map { position:relative; }
        .prospector-map iframe { width:100%; height:100%; min-height:520px; border:0; filter:saturate(.82) contrast(.95); }
        .prospector-map-attribution { position:absolute; right:7px; bottom:7px; padding:3px 6px; border-radius:5px; background:rgba(255,255,255,.9); color:#334155; font-size:.65rem; text-decoration:none; }
        .prospector-map-empty { position:absolute; inset:0; display:grid; place-items:center; text-align:center; padding:30px; color:#94a3b8; }
        .prospector-map-empty svg { margin:0 auto 10px; color:#334155; }
        .prospector-detail { padding:17px; background:#0e1929; overflow:auto; max-height:520px; }
        .prospector-detail h3 { margin:0; font-size:1.05rem; }
        .prospector-detail-sub { color:#94a3b8; font-size:.78rem; margin:5px 0 13px; }
        .prospector-badges { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
        .prospector-badge { border-radius:999px; padding:4px 8px; background:rgba(56,189,248,.1); color:#7dd3fc; font-size:.7rem; font-weight:800; text-transform:capitalize; }
        .prospector-badge.warning { background:rgba(245,158,11,.1); color:#fcd34d; }
        .prospector-badge.danger { background:rgba(239,68,68,.1); color:#fca5a5; }
        .prospector-detail-row { display:grid; grid-template-columns:21px 1fr; gap:8px; margin:10px 0; color:#cbd5e1; font-size:.82rem; }
        .prospector-detail-row svg { color:#64748b; margin-top:1px; }
        .prospector-detail-row a { color:#7dd3fc; text-decoration:none; overflow-wrap:anywhere; }
        .prospector-fit { margin:14px 0; padding:11px; border-left:3px solid #38bdf8; background:rgba(56,189,248,.06); }
        .prospector-fit-title { display:flex; justify-content:space-between; gap:8px; font-size:.78rem; font-weight:800; margin-bottom:6px; }
        .prospector-fit ul { margin:0; padding-left:17px; color:#a8b7ca; font-size:.76rem; line-height:1.55; }
        .prospector-detail label { display:grid; gap:5px; color:#94a3b8; font-size:.72rem; font-weight:800; margin-top:10px; }
        .prospector-detail-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:13px; }
        .prospector-empty { padding:36px 18px; text-align:center; color:#64748b; }
        .prospector-empty svg { margin-bottom:8px; }
        .prospector-modal-backdrop { position:fixed; inset:0; z-index:1200; background:rgba(2,6,23,.78); display:grid; place-items:center; padding:20px; }
        .prospector-modal { width:min(720px,100%); max-height:90vh; overflow:auto; background:#0e1929; border:1px solid rgba(148,163,184,.2); border-radius:15px; box-shadow:0 25px 70px rgba(0,0,0,.45); }
        .prospector-modal-head { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid rgba(148,163,184,.14); }
        .prospector-modal-head h3 { margin:0; }
        .prospector-modal-close { border:0; background:transparent; color:#94a3b8; cursor:pointer; }
        .prospector-form { padding:18px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .prospector-form label { display:grid; gap:5px; color:#94a3b8; font-size:.76rem; font-weight:800; }
        .prospector-form .full { grid-column:1/-1; }
        .prospector-form-actions { grid-column:1/-1; display:flex; justify-content:flex-end; gap:8px; padding-top:5px; }
        @media(max-width:1120px){ .prospector-workspace{grid-template-columns:minmax(240px,.75fr) minmax(360px,1.25fr)} .prospector-detail{grid-column:1/-1;max-height:none;border-top:1px solid rgba(148,163,184,.14)} }
        @media(max-width:760px){ .prospector-header{flex-direction:column}.prospector-stats{grid-template-columns:1fr}.prospector-searchbar{grid-template-columns:1fr}.prospector-workspace{display:block}.prospector-results{border-right:0}.prospector-result-list{max-height:330px}.prospector-map,.prospector-map iframe{min-height:340px}.prospector-detail{max-height:none}.prospector-form{grid-template-columns:1fr}.prospector-form .full,.prospector-form-actions{grid-column:1}.prospector-modal-backdrop{padding:10px} }
      `}</style>

      <div className="prospector-header">
        <div className="prospector-heading">
          <div className="prospector-heading-icon"><MapPinned size={22} /></div>
          <div><h2>Prospector</h2><p>Key-free business discovery, public contact enrichment, qualification, and follow-up.</p></div>
        </div>
        <div className="prospector-header-actions">
          <button type="button" className="prospector-btn" onClick={() => loadProspects()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'mkt-spin' : ''} /> Refresh
          </button>
          <button type="button" className="prospector-btn primary" onClick={() => setManualOpen(true)}>
            <Plus size={15} /> Add prospect
          </button>
        </div>
      </div>

      <div className="prospector-stats">
        <div className="prospector-stat"><Building2 size={19} /><div><strong>{stats.saved}</strong><span>Saved prospects</span></div></div>
        <div className="prospector-stat"><UserRoundCheck size={19} /><div><strong>{stats.qualified}</strong><span>Qualified or active</span></div></div>
        <div className="prospector-stat"><CalendarClock size={19} /><div><strong>{stats.due}</strong><span>Follow-ups due</span></div></div>
      </div>

      <div className="prospector-tabs" role="tablist" aria-label="Prospector views">
        <button type="button" role="tab" aria-selected={view === 'discover'} className={`prospector-tab${view === 'discover' ? ' active' : ''}`} onClick={() => { setView('discover'); setSelected(null); setSelectedSaved(false); }}>
          <Search size={15} /> Discover businesses
        </button>
        <button type="button" role="tab" aria-selected={view === 'saved'} className={`prospector-tab${view === 'saved' ? ' active' : ''}`} onClick={() => { setView('saved'); setSelected(null); setSelectedSaved(false); }}>
          <Save size={15} /> Saved pipeline <span>({prospects.length})</span>
        </button>
      </div>

      {dbSetupRequired && (
        <div className="prospector-alert"><AlertTriangle size={18} /><div><strong>Database setup required</strong><div>Run <code>prospector-migration.sql</code> in Supabase. Discovery can still be tested, but saving is disabled.</div></div></div>
      )}
      {error && <div className="prospector-alert error"><AlertTriangle size={18} /><div>{error}</div></div>}
      {notice && <div className="prospector-alert success"><CheckCircle2 size={18} /><div>{notice}</div></div>}

      {view === 'discover' ? (
        <form className="prospector-searchbar" onSubmit={runSearch}>
          <input className="prospector-input" list="prospector-category-suggestions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Business type or keyword" aria-label="Business type or keyword" />
          <datalist id="prospector-category-suggestions">{CATEGORY_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
          <input className="prospector-input" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, canton, or province" aria-label="City, canton, or province" />
          <button className="prospector-btn primary" type="submit" disabled={searching || query.trim().length < 2}>
            {searching ? <Loader2 size={15} className="mkt-spin" /> : <Search size={15} />} Search area
          </button>
        </form>
      ) : (
        <div className="prospector-searchbar">
          <input className="prospector-input" value={savedSearch} onChange={(event) => setSavedSearch(event.target.value)} placeholder="Search saved prospects…" aria-label="Search saved prospects" />
          <select className="prospector-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Prospect status filter">
            <option value="active">Active pipeline</option>
            <option value="all">All statuses</option>
            {PROSPECT_STATUSES.map((status) => <option key={status} value={status}>{PROSPECT_STATUS_LABELS[status]}</option>)}
          </select>
          <div />
        </div>
      )}

      <div className="prospector-workspace">
        <section className="prospector-results" aria-label={view === 'discover' ? 'Business search results' : 'Saved prospects'}>
          <div className="prospector-results-head"><span>{view === 'discover' ? 'Search results' : 'Saved pipeline'}</span><span>{visibleResults.length}</span></div>
          <div className="prospector-result-list">
            {loading && view === 'saved' ? (
              <div className="prospector-empty"><Loader2 size={28} className="mkt-spin" /><div>Loading prospects…</div></div>
            ) : visibleResults.length === 0 ? (
              <div className="prospector-empty"><ListFilter size={30} /><div>{view === 'discover' ? 'Search a business type and area to begin.' : 'No prospects match these filters.'}</div></div>
            ) : visibleResults.map((prospect) => (
              <button key={prospect.id || prospect.source_external_id} type="button" className={`prospector-result${selected && (selected.id || selected.source_external_id) === (prospect.id || prospect.source_external_id) ? ' active' : ''}`} onClick={() => chooseProspect(prospect, view === 'saved')}>
                <div><strong>{prospect.organization_name}</strong><small>{prospect.category || 'Business'} · {locationLabel(prospect)}</small>{view === 'saved' && <small>{PROSPECT_STATUS_LABELS[prospect.status] || prospect.status}</small>}</div>
                <span className={`prospector-score ${scoreTone(prospect.fit_score || 0)}`}>{prospect.fit_score || 0}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="prospector-map" aria-label="Selected prospect map">
          {mapSrc ? (
            <><iframe title={`Map for ${selected?.organization_name || 'selected prospect'}`} src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /><a className="prospector-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></>
          ) : (
            <div className="prospector-map-empty"><div><MapPin size={42} /><strong>Select a business to view its location</strong><p>The map follows the selected search result or saved prospect.</p></div></div>
          )}
        </section>

        <aside className="prospector-detail" aria-label="Prospect details">
          {!selected ? (
            <div className="prospector-empty"><Building2 size={34} /><div>Select a prospect to review contact data, fit, ownership, and follow-up.</div></div>
          ) : (
            <>
              <h3>{selected.organization_name}</h3>
              <div className="prospector-detail-sub">{selected.category || 'Business'} · {locationLabel(selected)}</div>
              <div className="prospector-badges">
                <span className="prospector-badge">{sourceLabel(selected.source_provider)}</span>
                {selectedSaved && <span className="prospector-badge">{PROSPECT_STATUS_LABELS[selected.status] || selected.status}</span>}
                <span className={`prospector-badge${selected.contact_permission_status === 'do_not_contact' ? ' danger' : selected.contact_permission_status === 'unknown' || !selected.contact_permission_status ? ' warning' : ''}`}>
                  {PERMISSION_LABELS[selected.contact_permission_status || 'unknown']}
                </span>
              </div>

              {enriching ? <div className="prospector-detail-row"><Loader2 size={15} className="mkt-spin" /><span>Scanning the public website and contact pages…</span></div> : null}
              <div className="prospector-detail-row"><Phone size={15} /><span>{selected.phone || 'No public business phone found'}</span></div>
              <div className="prospector-detail-row"><Mail size={15} /><span>{selected.email || 'No work email saved'}</span></div>
              <div className="prospector-detail-row"><Globe2 size={15} />{selected.website_url ? <a href={selected.website_url} target="_blank" rel="noopener noreferrer">{selected.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : <span>No website found</span>}</div>
              {selected.contact_source_url && <div className="prospector-detail-row"><ShieldCheck size={15} /><a href={selected.contact_source_url} target="_blank" rel="noopener noreferrer">Contact source</a></div>}
              <div className="prospector-detail-row"><MapPin size={15} /><span>{selected.formatted_address || locationLabel(selected)}</span></div>

              <div className="prospector-fit">
                <div className="prospector-fit-title"><span><Sparkles size={13} /> Fit score</span><span>{selected.fit_score || 0}/100</span></div>
                <ul>{(selected.fit_reasons || []).length ? selected.fit_reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>Complete business details to improve scoring.</li>}</ul>
              </div>

              {selectedSaved ? (
                <>
                  <label>Status
                    <select className="prospector-select" value={selected.status} onChange={(event) => updateSelected({ status: event.target.value }, `Moved to ${PROSPECT_STATUS_LABELS[event.target.value]}`)} disabled={saving}>
                      {PROSPECT_STATUSES.map((status) => <option key={status} value={status}>{PROSPECT_STATUS_LABELS[status]}</option>)}
                    </select>
                  </label>
                  <label>Contact permission
                    <select className="prospector-select" value={selected.contact_permission_status || 'unknown'} onChange={(event) => updateSelected({ contact_permission_status: event.target.value }, 'Contact permission updated')} disabled={saving}>
                      {CONTACT_PERMISSION_STATUSES.map((status) => <option key={status} value={status}>{PERMISSION_LABELS[status]}</option>)}
                    </select>
                  </label>
                  <label>Next follow-up
                    <input className="prospector-input" type="datetime-local" value={localInputDate(selected.next_follow_up_at)} onChange={(event) => updateSelected({ next_follow_up_at: event.target.value ? new Date(event.target.value).toISOString() : null }, 'Follow-up scheduled')} disabled={saving} />
                  </label>
                  <label>Notes
                    <textarea className="prospector-textarea" rows="4" value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Qualification notes, decision-maker, next step…" />
                  </label>
                  <div className="prospector-detail-actions">
                    <button type="button" className="prospector-btn primary" onClick={() => updateSelected({ notes: notesDraft }, 'Notes saved')} disabled={saving}><Save size={14} /> Save notes</button>
                    {currentEmail && selected.owner_email !== currentEmail && <button type="button" className="prospector-btn" onClick={() => updateSelected({ owner_email: currentEmail }, 'Prospect assigned to you')} disabled={saving}><UserRoundCheck size={14} /> Assign to me</button>}
                    <button type="button" className="prospector-btn" onClick={() => updateSelected({ status: 'contacted', last_contacted_at: new Date().toISOString() }, 'Contact logged')} disabled={saving || selected.contact_permission_status === 'do_not_contact'}><CheckCircle2 size={14} /> Mark contacted</button>
                    <button type="button" className="prospector-btn danger" onClick={deleteSelected} disabled={saving}><Trash2 size={14} /> Delete</button>
                  </div>
                </>
              ) : (
                <div className="prospector-detail-actions">
                  <button type="button" className="prospector-btn primary" onClick={() => saveProspect(selected)} disabled={saving || dbSetupRequired || enriching}>{saving ? <Loader2 size={14} className="mkt-spin" /> : <Save size={14} />} Save to Prospector</button>
                </div>
              )}

              <div className="prospector-detail-actions">
                {(selected.google_maps_url || mapQuery) && <a className="prospector-btn" href={selected.google_maps_url || `https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open source map</a>}
                {selected.website_url && <a className="prospector-btn" href={selected.website_url} target="_blank" rel="noopener noreferrer"><ChevronRight size={14} /> Visit website</a>}
                {selected.website_url && <button type="button" className="prospector-btn" onClick={enrichSelected} disabled={enriching || saving}>{enriching ? <Loader2 size={14} className="mkt-spin" /> : <Search size={14} />} Find public contacts</button>}
              </div>
              <div className="prospector-alert" style={{ marginTop: '14px', marginBottom: 0 }}><ShieldCheck size={16} /><small>Discovery uses OpenStreetMap. Contact enrichment only reads details published on the business website; it does not guess personal data or add anyone to marketing audiences.</small></div>
            </>
          )}
        </aside>
      </div>

      {manualOpen && (
        <div className="prospector-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManualOpen(false); }}>
          <div className="prospector-modal" role="dialog" aria-modal="true" aria-labelledby="prospector-manual-title">
            <div className="prospector-modal-head"><h3 id="prospector-manual-title">Add prospect manually</h3><button type="button" className="prospector-modal-close" onClick={() => setManualOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <form className="prospector-form" onSubmit={saveManualProspect}>
              <label>Organization name *<input className="prospector-input" value={manualForm.organization_name} onChange={(event) => setManualForm({ ...manualForm, organization_name: event.target.value })} required autoFocus /></label>
              <label>Business category<input className="prospector-input" value={manualForm.category} onChange={(event) => setManualForm({ ...manualForm, category: event.target.value })} /></label>
              <label>Public business phone<input className="prospector-input" type="tel" value={manualForm.phone} onChange={(event) => setManualForm({ ...manualForm, phone: event.target.value })} /></label>
              <label>Work email<input className="prospector-input" type="email" value={manualForm.email} onChange={(event) => setManualForm({ ...manualForm, email: event.target.value })} /></label>
              <label className="full">Website<input className="prospector-input" type="url" value={manualForm.website_url} onChange={(event) => setManualForm({ ...manualForm, website_url: event.target.value })} placeholder="https://…" /></label>
              <label className="full">Address<input className="prospector-input" value={manualForm.formatted_address} onChange={(event) => setManualForm({ ...manualForm, formatted_address: event.target.value })} /></label>
              <label>City or canton<input className="prospector-input" value={manualForm.city} onChange={(event) => setManualForm({ ...manualForm, city: event.target.value })} /></label>
              <label>Province<input className="prospector-input" value={manualForm.region} onChange={(event) => setManualForm({ ...manualForm, region: event.target.value })} /></label>
              <label>Latitude<input className="prospector-input" type="number" step="any" value={manualForm.latitude} onChange={(event) => setManualForm({ ...manualForm, latitude: event.target.value })} /></label>
              <label>Longitude<input className="prospector-input" type="number" step="any" value={manualForm.longitude} onChange={(event) => setManualForm({ ...manualForm, longitude: event.target.value })} /></label>
              <label className="full">Contact permission<select className="prospector-select" value={manualForm.contact_permission_status} onChange={(event) => setManualForm({ ...manualForm, contact_permission_status: event.target.value })}>{CONTACT_PERMISSION_STATUSES.map((status) => <option key={status} value={status}>{PERMISSION_LABELS[status]}</option>)}</select></label>
              <label className="full">Notes<textarea className="prospector-textarea" rows="4" value={manualForm.notes} onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })} /></label>
              <div className="prospector-form-actions"><button type="button" className="prospector-btn" onClick={() => setManualOpen(false)}>Cancel</button><button type="submit" className="prospector-btn primary" disabled={saving || dbSetupRequired}>{saving ? <Loader2 size={14} className="mkt-spin" /> : <Plus size={14} />} Add prospect</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
