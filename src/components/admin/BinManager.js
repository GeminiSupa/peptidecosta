'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Search, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { confirmBulkDelete, confirmDelete } from '@/lib/confirmDelete.mjs';

const TYPE_LABELS = {
  order: 'Orders',
  lead: 'Leads',
  cart: 'Carts',
  inquiry: 'Inquiries',
};

function formatWhen(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function BinManager({ isSuperadmin = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selected, setSelected] = useState([]);

  const loadBin = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/bin');
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && data.needsMigration) {
        setNeedsMigration(true);
        setItems([]);
        setError(data.error || 'Run add-admin-bin.sql in Supabase to enable the Bin.');
        return;
      }
      if (!res.ok) throw new Error(data.error || `Could not load the bin (${res.status})`);
      setNeedsMigration(false);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || 'Could not load the bin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBin(); }, [loadBin]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.entity_type !== typeFilter) return false;
      if (!query) return true;
      const haystack = [item.summary, item.deleted_by, item.entity_type, item.entity_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [items, typeFilter, search]);

  const runAction = async (ids, { restore }) => {
    const key = ids.join(',');
    setBusyId(key);
    try {
      const res = await adminFetch('/api/admin/bin', {
        method: restore ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'The bin action failed');
      if (data.failed?.length && !data.restored?.length) {
        throw new Error(data.failed[0].error || 'Restore failed');
      }
      const restoredIds = new Set((data.restored || []).map((row) => row.id));
      const removed = restore ? restoredIds : new Set(ids);
      setItems((prev) => prev.filter((item) => !removed.has(item.id)));
      setSelected((prev) => prev.filter((id) => !removed.has(id)));
      if (data.failed?.length) {
        setError(data.failed.map((row) => row.error).join(' '));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const restoreItem = async (item) => {
    if (!window.confirm(`Restore this ${item.entity_type}?\n\n  • ${item.summary || item.entity_id}\n\nIt will go back to its original list.`)) return;
    await runAction([item.id], { restore: true });
  };

  const purgeItem = async (item) => {
    if (!confirmDelete(item.entity_type, [item.summary], { recoverable: false })) return;
    await runAction([item.id], { restore: false });
  };

  const restoreSelected = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Restore ${selected.length} item${selected.length === 1 ? '' : 's'} from the Bin?`)) return;
    await runAction(selected, { restore: true });
  };

  const purgeSelected = async () => {
    if (!selected.length) return;
    if (!confirmBulkDelete(selected.length, 'bin item')) return;
    await runAction(selected, { restore: false });
  };

  const emptyBin = async () => {
    if (!isSuperadmin) return;
    if (!window.confirm('Permanently empty the entire Bin? This cannot be undone.')) return;
    setBusyId('all');
    try {
      const res = await adminFetch('/api/admin/bin', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Could not empty the bin');
      setItems([]);
      setSelected([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const toggleSelected = (id, checked) => {
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((entry) => entry !== id)));
  };

  return (
    <div className="admin-bin">
      <div className="admin-bin-toolbar">
        <div className="admin-bin-search">
          <Search size={14} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search deleted items"
            aria-label="Search the bin"
          />
        </div>
        <div className="admin-bin-filters">
          <button type="button" className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>All</button>
          {Object.entries(TYPE_LABELS).map(([id, label]) => (
            <button key={id} type="button" className={typeFilter === id ? 'active' : ''} onClick={() => setTypeFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="admin-btn" onClick={loadBin} disabled={loading}>Refresh</button>
      </div>

      {selected.length > 0 && (
        <div className="admin-bin-bulk">
          <span>{selected.length} selected</span>
          <button type="button" className="admin-btn" onClick={restoreSelected} disabled={Boolean(busyId)}>
            <RotateCcw size={13} /> Restore
          </button>
          <button type="button" className="admin-btn admin-bin-danger" onClick={purgeSelected} disabled={Boolean(busyId)}>
            <Trash2 size={13} /> Delete forever
          </button>
        </div>
      )}

      {error && <div className="admin-bin-error" role="alert">{error}</div>}
      {needsMigration && (
        <p className="admin-bin-hint">Nothing is lost from older deletes until this table exists — new deletes will land here after the SQL is applied.</p>
      )}

      {loading ? (
        <div className="admin-bin-empty"><Loader2 className="spin" size={22} /> Loading the bin…</div>
      ) : visible.length === 0 ? (
        <div className="admin-bin-empty">
          <Trash2 size={28} />
          <strong>The bin is empty</strong>
          <span>Deleted orders, leads, carts, and inquiries appear here so they can be restored.</span>
        </div>
      ) : (
        <div className="admin-bin-list">
          {visible.map((item) => (
            <div key={item.id} className="admin-bin-row">
              <label className="admin-bin-check">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={(event) => toggleSelected(item.id, event.target.checked)}
                />
              </label>
              <div className="admin-bin-body">
                <div className="admin-bin-title">{item.summary || item.entity_id}</div>
                <div className="admin-bin-meta">
                  <span className="admin-bin-type">{TYPE_LABELS[item.entity_type] || item.entity_type}</span>
                  <span>{formatWhen(item.deleted_at)}</span>
                  {item.deleted_by && <span>{item.deleted_by}</span>}
                </div>
              </div>
              <div className="admin-bin-actions">
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => restoreItem(item)}
                  disabled={Boolean(busyId)}
                >
                  <RotateCcw size={13} /> Restore
                </button>
                <button
                  type="button"
                  className="admin-btn admin-bin-danger"
                  onClick={() => purgeItem(item)}
                  disabled={Boolean(busyId)}
                >
                  <Trash2 size={13} /> Delete forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isSuperadmin && items.length > 0 && (
        <div className="admin-bin-footer">
          <button type="button" className="admin-btn admin-bin-danger" onClick={emptyBin} disabled={Boolean(busyId)}>
            Empty bin
          </button>
        </div>
      )}
    </div>
  );
}
