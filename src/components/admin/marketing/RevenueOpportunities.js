"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Flame, RefreshCw, Search, Target, TrendingUp, Users } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import CustomerTimelineModal from './CustomerTimelineModal';

const TEMPERATURE_BADGES = {
  hot: 'mkt-badge-danger',
  warm: 'mkt-badge-warning',
  cold: 'mkt-badge-neutral',
};

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function relativeDate(value) {
  if (!value) return 'No activity date';
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export default function RevenueOpportunities() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [segment, setSegment] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch('/api/admin/marketing-intelligence');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load opportunities');
      setData(payload);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    adminFetch('/api/admin/marketing-intelligence')
      .then(async response => ({ response, payload: await response.json() }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (!response.ok) throw new Error(payload.error || 'Could not load opportunities');
        setData(payload);
      })
      .catch(initialError => { if (!cancelled) setError(initialError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.leads || []).filter(lead => {
      const matchesSegment = segment === 'all' || lead.segments.includes(segment);
      const haystack = [lead.name, lead.email, lead.phone, ...lead.topProducts].filter(Boolean).join(' ').toLowerCase();
      return matchesSegment && (!query || haystack.includes(query));
    });
  }, [data, search, segment]);

  if (loading && !data) {
    return <div className="mkt-loading-state"><RefreshCw size={22} className="mkt-spin" /><span>Calculating customer intent…</span></div>;
  }

  if (error && !data) {
    return (
      <div className="mkt-empty-state">
        <AlertTriangle size={34} />
        <h4>Could not calculate opportunities</h4>
        <p>{error}</p>
        <button className="mkt-btn" onClick={load}>Try again</button>
      </div>
    );
  }

  const cards = [
    { label: 'Known contacts', value: data.summary.contacts, icon: Users, color: '#60a5fa' },
    { label: 'Hot opportunities', value: data.summary.hot, icon: Flame, color: '#f87171' },
    { label: 'Warm opportunities', value: data.summary.warm, icon: TrendingUp, color: '#fbbf24' },
    { label: 'Reorder value', value: money(data.summary.revenueAtRisk), icon: Target, color: '#34d399' },
  ];

  return (
    <div className="mkt-intelligence mkt-fade-in">
      <div className="mkt-section-header">
        <div>
          <div className="mkt-panel-kicker">First-party intent</div>
          <h3 className="mkt-section-title">Revenue Opportunities</h3>
          <p className="mkt-section-description">Live scores from carts, catalog activity, campaign engagement, and order history.</p>
        </div>
        <button className="mkt-btn" onClick={load} disabled={loading} aria-label="Refresh revenue opportunities">
          <RefreshCw size={14} className={loading ? 'mkt-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="mkt-stats-grid">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ background: `${color}18`, color }}><Icon size={18} /></div>
            <div><div className="mkt-stat-value">{value}</div><div className="mkt-stat-label">{label}</div></div>
          </div>
        ))}
      </div>

      <div className="mkt-segment-grid" aria-label="Smart segments">
        <button className={`mkt-segment-card ${segment === 'all' ? 'active' : ''}`} onClick={() => setSegment('all')}>
          <span>All contacts</span><strong>{data.summary.contacts}</strong>
        </button>
        {data.segments.map(item => (
          <button key={item.id} className={`mkt-segment-card ${segment === item.id ? 'active' : ''}`} onClick={() => setSegment(item.id)} title={item.description}>
            <span>{item.label}</span><strong>{item.count}</strong>
          </button>
        ))}
      </div>

      {data.warnings.length > 0 && (
        <div className="mkt-warning-strip"><AlertTriangle size={15} /> Some signals are unavailable: {data.warnings.join(', ')}.</div>
      )}
      {data.truncated && (
        <div className="mkt-warning-strip">
          <AlertTriangle size={15} /> There is more campaign engagement than this scores on, so a few contacts may rank lower than they should.
        </div>
      )}

      <div className="mkt-toolbar" style={{ marginTop: 16 }}>
        <div className="mkt-search-wrap">
          <Search size={15} />
          <input className="mkt-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, contact, or product…" />
        </div>
        <span className="mkt-muted">{filteredLeads.length} matching contacts</span>
      </div>

      <div className="mkt-table-wrapper">
        <table className="mkt-table responsive-table">
          <thead><tr><th>Contact</th><th>Intent</th><th>Why now</th><th>Customer value</th><th>Last activity</th><th></th></tr></thead>
          <tbody>
            {filteredLeads.length === 0 ? (
              <tr><td colSpan="6"><div className="mkt-empty-state"><Activity size={30} /><h4>No matching opportunities</h4><p>Try another segment or search term.</p></div></td></tr>
            ) : filteredLeads.map(lead => (
              <tr key={lead.id}>
                <td data-label="Contact">
                  <div className="mkt-font-medium">{lead.name}</div>
                  <div className="mkt-muted">{lead.email || lead.phone}</div>
                  {lead.topProducts.length > 0 && <div className="mkt-product-hint">Interested in {lead.topProducts.join(', ')}</div>}
                </td>
                <td data-label="Intent">
                  <div className="mkt-score"><strong>{lead.score}</strong><span>/100</span></div>
                  <span className={`mkt-badge ${TEMPERATURE_BADGES[lead.temperature]}`}>{lead.temperature}</span>
                </td>
                <td data-label="Why now">
                  <ul className="mkt-reason-list">{lead.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                </td>
                <td data-label="Customer value">
                  <div className="mkt-font-medium">{money(lead.totalRevenue)}</div>
                  <div className="mkt-muted">{lead.orderCount} order{lead.orderCount === 1 ? '' : 's'}</div>
                </td>
                <td data-label="Last activity"><span className="mkt-muted">{relativeDate(lead.lastActivityAt)}</span></td>
                <td data-label="Profile"><button className="mkt-btn" style={{ padding: '6px 10px', fontSize: 11 }} onClick={() => setSelectedContact(lead)}>View profile</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedContact && <CustomerTimelineModal contact={selectedContact} onClose={() => setSelectedContact(null)} />}
    </div>
  );
}
