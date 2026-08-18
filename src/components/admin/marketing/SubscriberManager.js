"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { adminFetch } from '@/lib/adminApi';
import {
  Users, Search, Plus, Download, UserPlus, Loader2,
  Edit2, Check, X, Upload, CheckCircle2, XCircle, RefreshCw, Tag,
} from 'lucide-react';
import { useMarketingFeedback } from './useMarketingFeedback';

function getInitials(sub) {
  const f = sub.first_name?.[0] || '';
  const l = sub.last_name?.[0]  || '';
  return (f + l).toUpperCase() || sub.email[0].toUpperCase();
}

export default function SubscriberManager() {
  const { notify, confirm, feedback } = useMarketingFeedback();
  const [subscribers, setSubscribers] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | subscribed | unsubscribed
  const [filterTag,    setFilterTag]    = useState('all'); // all | specific tag

  // Add modal
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [newSub,        setNewSub]        = useState({ email: '', first_name: '', last_name: '' });
  const [isSubmitting,  setIsSubmitting]  = useState(false);

  // Inline edit
  const [editingId,  setEditingId]  = useState(null);
  const [editForm,   setEditForm]   = useState({});

  useEffect(() => { fetchSubscribers(); }, []);

  const fetchSubscribers = async () => {
    try {
      setLoading(true);
      const res  = await adminFetch('/api/admin/subscribers');
      const data = await res.json();
      if (data.subscribers) setSubscribers(data.subscribers);
    } catch (err) {
      console.error('Failed to fetch subscribers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubscriber = async (e) => {
    e.preventDefault();
    if (!newSub.email) return;
    setIsSubmitting(true);
    try {
      const res  = await adminFetch('/api/admin/subscribers', {
        method: 'POST',
        body: JSON.stringify({ ...newSub, source: 'admin_manual' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to add subscriber');
      setShowAddModal(false);
      setNewSub({ email: '', first_name: '', last_name: '' });
      fetchSubscribers();
    } catch (err) {
      notify(`Failed to add subscriber: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (sub) => {
    setEditingId(sub.id);
    setEditForm({ ...sub, tags: sub.tags || [] });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    try {
      const res  = await adminFetch('/api/admin/subscribers', {
        method: 'PUT',
        body: JSON.stringify({
          id: editingId, email: editForm.email,
          first_name: editForm.first_name, last_name: editForm.last_name,
          status: editForm.status, tags: editForm.tags,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSubscribers(subscribers.map(s => s.id === editingId ? data.subscriber : s));
      setEditingId(null);
    } catch(err) { notify(err.message, 'error'); }
  };

  const deleteSubscriber = async (id) => {
    const confirmed = await confirm({
      title: 'Delete this subscriber?',
      message: 'They are removed from the list entirely.',
      detail: 'To stop mailing someone but keep the record, unsubscribe them instead.',
      confirmLabel: 'Delete subscriber',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const res = await adminFetch(`/api/admin/subscribers?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete subscriber');
      setSubscribers(subscribers.filter(s => s.id !== id));
      notify('Subscriber deleted.', 'success');
    } catch(err) { notify(err.message, 'error'); }
  };

  const handleBulkImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      const rows = text.split('\n').filter(r => r.trim() !== '');
      const startIdx = rows[0].toLowerCase().includes('email') ? 1 : 0;
      const parsed = [];
      for (let i = startIdx; i < rows.length; i++) {
        const cols = rows[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols[0]) parsed.push({ email: cols[0], first_name: cols[1] || '', last_name: cols[2] || '' });
      }
      if (parsed.length === 0) { notify('No valid rows found. Make sure the first column is email addresses.', 'warning'); return; }
      const confirmed = await confirm({
        title: `Import ${parsed.length.toLocaleString()} subscriber${parsed.length === 1 ? '' : 's'}?`,
        message: 'Existing addresses are skipped rather than duplicated.',
        confirmLabel: 'Import them',
      });
      if (!confirmed) { e.target.value = ''; return; }
      setLoading(true);
      try {
        const res  = await adminFetch('/api/admin/subscribers', { method: 'POST', body: JSON.stringify({ bulk: true, subscribers: parsed }) });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Bulk import failed');
        notify(`Imported ${(data.count || 0).toLocaleString()} subscriber${data.count === 1 ? '' : 's'}.`, 'success');
        fetchSubscribers();
      } catch (err) {
        notify(`Bulk import failed: ${err.message}`, 'error');
        setLoading(false);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const rows = [['Email', 'First Name', 'Last Name', 'Status', 'Tags', 'Added']];
    subscribers.forEach(s => rows.push([
      s.email, s.first_name || '', s.last_name || '', s.status,
      (s.tags || []).join(' | '), new Date(s.created_at).toLocaleDateString(),
    ]));
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'subscribers.csv' });
    a.click(); URL.revokeObjectURL(url);
  };

  // Stats
  const total       = subscribers.length;
  const active      = subscribers.filter(s => s.status === 'subscribed').length;
  const unsub       = subscribers.filter(s => s.status === 'unsubscribed').length;

  // Unique tags for filter
  const allTags = useMemo(() => {
    const tags = new Set();
    subscribers.forEach(s => (s.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [subscribers]);

  const filtered = useMemo(() => subscribers.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      s.email.toLowerCase().includes(q) ||
      (s.first_name || '').toLowerCase().includes(q) ||
      (s.last_name  || '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    const matchTag    = filterTag === 'all' || (s.tags || []).includes(filterTag);
    return matchSearch && matchStatus && matchTag;
  }), [subscribers, search, filterStatus, filterTag]);

  return (
    <div>
      {/* ── Stats row ── */}
      <div className="mkt-stats-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', marginBottom: '20px' }}>
        {[
          { label: 'Total', value: total,  color: '#fff',    icon: Users },
          { label: 'Active',  value: active, color: '#34d399', icon: CheckCircle2 },
          { label: 'Unsub',   value: unsub,  color: '#f87171', icon: XCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="mkt-stat-card">
            <div className="mkt-stat-icon" style={{ color, background: `${color}18`, borderColor: `${color}25` }}>
              <Icon size={17} />
            </div>
            <div>
              <div className="mkt-stat-value" style={{ color }}>{value}</div>
              <div className="mkt-stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px', maxWidth: '320px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
          <input
            type="search"
            placeholder="Search subscribers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mkt-input"
            style={{ paddingLeft: '36px' }}
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="mkt-input"
          style={{ flex: '0 0 auto', width: 'auto', minWidth: '130px' }}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>

        {/* Tag filter */}
        <select
          value={filterTag}
          onChange={e => setFilterTag(e.target.value)}
          className="mkt-input"
          style={{ flex: '0 0 auto', width: 'auto', minWidth: '130px' }}
          aria-label="Filter by tag"
        >
          <option value="all">All Tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
          <button className="mkt-btn" onClick={fetchSubscribers} disabled={loading} title="Refresh" aria-label="Refresh subscribers">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            <span className="mkt-hide-xs">Refresh</span>
          </button>
          <input type="file" accept=".csv" id="csv-upload-sub" style={{ display: 'none' }} onChange={handleBulkImport} />
          <label htmlFor="csv-upload-sub" className="mkt-btn" style={{ cursor: 'pointer' }}>
            <Upload size={15} /><span className="mkt-hide-xs">Import CSV</span>
          </label>
          <button className="mkt-btn" onClick={handleExport}>
            <Download size={15} /><span className="mkt-hide-xs">Export</span>
          </button>
          <button className="mkt-btn mkt-btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={15} /> Add Subscriber
          </button>
        </div>
      </div>

      {/* ── Result count ── */}
      {!loading && (
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.38)', marginBottom: '12px', margin: '0 0 12px' }}>
          Showing {filtered.length} of {total} subscribers
        </p>
      )}

      {/* ── Subscriber list ── */}
      {loading ? (
        <div className="mkt-loading-state">
          <Loader2 size={28} className="animate-spin" style={{ color: '#34d399' }} />
          <span>Loading subscribers…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mkt-empty-state">
          <Users size={40} />
          <h4>No subscribers found</h4>
          <p>{search ? 'Try a different search term.' : 'Add your first subscriber to get started.'}</p>
        </div>
      ) : (
        <div className="mkt-table-wrapper">
          <table className="mkt-table responsive-table">
            <thead>
              <tr>
                <th>Subscriber</th>
                <th>Status</th>
                <th>Tags</th>
                <th>Added</th>
                <th className="mkt-text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub) => (
                <tr key={sub.id}>
                  {editingId === sub.id ? (
                    /* ── Edit mode ── */
                    <td colSpan="5">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <input type="email" className="mkt-input" style={{ flex: '2 1 180px' }} value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="Email" />
                          <input type="text"  className="mkt-input" style={{ flex: '1 1 100px' }} value={editForm.first_name || ''} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} placeholder="First" />
                          <input type="text"  className="mkt-input" style={{ flex: '1 1 100px' }} value={editForm.last_name  || ''} onChange={e => setEditForm({ ...editForm, last_name:  e.target.value })} placeholder="Last" />
                          <select className="mkt-input" style={{ flex: '0 0 auto', width: 'auto' }} value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                            <option value="subscribed">Subscribed</option>
                            <option value="unsubscribed">Unsubscribed</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <div style={{ flex: '1 1 auto', display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {editForm.tags.map(t => (
                              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(96,165,250,0.15)', color: '#60a5fa', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>
                                {t}
                                <button onClick={() => setEditForm({ ...editForm, tags: editForm.tags.filter(tag => tag !== t) })} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={10} /></button>
                              </span>
                            ))}
                            <input 
                              type="text" 
                              placeholder={editForm.tags.length === 0 ? "Add tags (press Enter)..." : "Add more..."}
                              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '12px', outline: 'none', minWidth: '120px', flex: '1 1 auto' }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ',') {
                                  e.preventDefault();
                                  const val = e.target.value.trim().replace(/^,|,$/g, '');
                                  if (val && !editForm.tags.includes(val)) {
                                    setEditForm({ ...editForm, tags: [...editForm.tags, val] });
                                    e.target.value = '';
                                  }
                                }
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button onClick={cancelEdit} className="mkt-btn" aria-label="Cancel edit">Cancel</button>
                            <button onClick={saveEdit}   className="mkt-btn mkt-btn-primary" aria-label="Save changes">Save</button>
                          </div>
                        </div>
                      </div>
                    </td>
                  ) : (
                    /* ── View mode ── */
                    <>
                      <td data-label="Subscriber">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="mkt-sub-card-avatar" style={{ flexShrink: 0 }}>{getInitials(sub)}</div>
                          <div>
                            <div className="mkt-font-medium" style={{ fontSize: '13px' }}>{sub.email}</div>
                            {(sub.first_name || sub.last_name) && (
                              <div className="mkt-text-xs mkt-text-muted">{sub.first_name} {sub.last_name}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td data-label="Status">
                        <span className={`mkt-badge ${sub.status === 'subscribed' ? 'mkt-badge-success' : 'mkt-badge-warning'}`}>
                          {sub.status === 'subscribed' ? 'Active' : 'Unsub'}
                        </span>
                      </td>
                      <td data-label="Tags">
                        {sub.tags && sub.tags.length > 0 ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {sub.tags.map(t => (
                              <span key={t} style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.18)', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="mkt-text-xs mkt-text-muted">—</span>
                        )}
                      </td>
                      <td data-label="Added">
                        <span className="mkt-text-xs mkt-text-muted">{new Date(sub.created_at).toLocaleDateString()}</span>
                      </td>
                      <td data-label="Actions" className="mkt-text-right">
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => startEdit(sub)} className="mkt-btn" style={{ padding: '6px 12px', fontSize: '12px' }}>
                            Edit
                          </button>
                          <button onClick={() => deleteSubscriber(sub.id)} className="mkt-btn" style={{ padding: '6px 12px', fontSize: '12px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Subscriber Modal ── */}
      {showAddModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(6px)', padding: '0' }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{ background: '#111827', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '480px', padding: '28px 24px', paddingBottom: 'max(28px, env(safe-area-inset-bottom))', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', boxShadow: '0 -16px 48px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', margin: '0 auto 20px' }} />
            <h3 className="mkt-title" style={{ marginBottom: '20px', fontSize: '1.1rem' }}>
              <UserPlus size={19} /> Add Subscriber
            </h3>
            <form onSubmit={handleAddSubscriber}>
              <div className="mkt-input-group">
                <label className="mkt-label">Email Address *</label>
                <input type="email" required value={newSub.email} onChange={e => setNewSub({ ...newSub, email: e.target.value })} className="mkt-input" placeholder="name@example.com" />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="mkt-input-group mkt-flex-1">
                  <label className="mkt-label">First Name</label>
                  <input type="text" value={newSub.first_name} onChange={e => setNewSub({ ...newSub, first_name: e.target.value })} className="mkt-input" placeholder="Jose" />
                </div>
                <div className="mkt-input-group mkt-flex-1">
                  <label className="mkt-label">Last Name</label>
                  <input type="text" value={newSub.last_name} onChange={e => setNewSub({ ...newSub, last_name: e.target.value })} className="mkt-input" placeholder="Rodriguez" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="mkt-btn mkt-flex-1" disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="mkt-btn mkt-btn-primary mkt-flex-1" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <><UserPlus size={15} /> Save</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {feedback}
    </div>
  );
}
