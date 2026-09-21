'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search, Trash2, TriangleAlert } from 'lucide-react';

import { adminFetch } from '@/lib/adminApi';
import { formatCrInstant } from '@/lib/crTime.mjs';
import { RETENTION_CHOICES } from '@/lib/recycleBin.mjs';

/**
 * The Bin: everything deleted from the admin, and the button to put it back.
 *
 * The list only ever holds what this person could already see — the server
 * filters by the module each item came from — so there is no "you may not view
 * this" state to render here.
 */
export default function RecycleBin() {
  const [entries, setEntries] = useState([]);
  const [types, setTypes] = useState([]);
  const [retention, setRetention] = useState(null);
  const [canChangeRetention, setCanChangeRetention] = useState(false);

  const [tableFilter, setTableFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showRestored, setShowRestored] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [savingRetention, setSavingRetention] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (tableFilter) params.set('table', tableFilter);
      if (search.trim()) params.set('q', search.trim());
      if (showRestored) params.set('restored', '1');

      const response = await adminFetch(`/api/admin/recycle-bin?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load the Bin.');

      setEntries(data.entries || []);
      setTypes(data.types || []);
      setRetention(data.retention || null);
      setCanChangeRetention(Boolean(data.canChangeRetention));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableFilter, search, showRestored]);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a request per key.
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const restore = async (entry) => {
    setBusyId(entry.id);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/recycle-bin', {
        method: 'POST',
        body: JSON.stringify({ entryId: entry.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not restore that item.');

      const warning = data.warnings?.length
        ? ` Some attached records could not be put back: ${data.warnings.join('; ')}`
        : '';
      setNotice(`${entry.record_type} "${entry.label}" is back.${warning}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const eraseOne = async (entry) => {
    const sure = window.confirm(
      `Erase "${entry.label}" for good?\n\n`
      + 'This cannot be undone. It will not be in the Bin afterwards and cannot be restored.',
    );
    if (!sure) return;

    setBusyId(entry.id);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/recycle-bin', {
        method: 'DELETE',
        body: JSON.stringify({ entryId: entry.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not erase that item.');
      setNotice(`"${entry.label}" was erased for good.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const emptyBin = async () => {
    const pending = entries.filter((entry) => !entry.restored_at).length;
    const sure = window.confirm(
      `Empty the Bin now?\n\nThis erases everything in it for good — ${pending} item`
      + `${pending === 1 ? '' : 's'} shown here and anything else waiting.\n\n`
      + 'Nothing can be restored afterwards. This cannot be undone.',
    );
    if (!sure) return;
    if (!window.confirm('Last check: erase the whole Bin permanently?')) return;

    setSavingRetention(true);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/recycle-bin', {
        method: 'DELETE',
        body: JSON.stringify({ emptyAll: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not empty the Bin.');
      setNotice(`The Bin is empty. ${data.purged} item${data.purged === 1 ? '' : 's'} erased.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRetention(false);
    }
  };

  /**
   * Changing how long things are kept.
   *
   * Shortening it is the destructive direction — anything already past the new
   * date goes on the next nightly run — so the warning says which way it is
   * moving and roughly what that costs, rather than a generic "are you sure".
   */
  const changeRetention = async (raw) => {
    const neverPurge = raw === 'never';
    const days = neverPurge ? null : Number(raw);
    const current = retention?.neverPurge ? null : retention?.days;

    let message;
    if (neverPurge) {
      message = 'Keep deleted items forever?\n\nNothing in the Bin will ever be erased '
        + 'automatically. It will keep growing until someone empties it by hand.';
    } else if (current === null) {
      message = `Start erasing deleted items after ${days} days?\n\n`
        + `Anything already in the Bin that was deleted more than ${days} days ago `
        + 'will be erased on the next nightly run, and cannot be restored.';
    } else if (days < current) {
      const atRisk = entries.filter(
        (entry) => !entry.restored_at && typeof entry.days_left === 'number'
          && (current - entry.days_left) >= days,
      ).length;
      message = `Shorten how long the Bin keeps things, from ${current} days to ${days}?\n\n`
        + `This is the destructive direction. ${atRisk} item${atRisk === 1 ? '' : 's'} shown `
        + 'here would be erased on the next nightly run, and could not be restored.';
    } else {
      message = `Keep deleted items for ${days} days instead of ${current}?\n\n`
        + 'Nothing is erased by this change — items already in the Bin get the longer window too.';
    }

    if (!window.confirm(message)) return;

    setSavingRetention(true);
    setError('');
    setNotice('');
    try {
      const response = await adminFetch('/api/admin/recycle-bin/settings', {
        method: 'POST',
        body: JSON.stringify({ retentionDays: days, neverPurge }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the retention period.');
      setRetention(data.retention);
      setNotice(
        neverPurge
          ? 'Saved. The Bin will never erase anything on its own.'
          : `Saved. Deleted items are kept for ${data.retention.days} days.`,
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRetention(false);
    }
  };

  const retentionValue = useMemo(() => {
    if (!retention) return '';
    return retention.neverPurge ? 'never' : String(retention.days);
  }, [retention]);

  const pendingCount = entries.filter((entry) => !entry.restored_at).length;

  return (
    <div className="recycle-bin">
      <header className="recycle-bin__head">
        <div>
          <h2>
            <Trash2 size={20} aria-hidden="true" /> Bin
          </h2>
          <p className="recycle-bin__lede">
            Anything deleted from the dashboard lands here first, so it can be put back.
          </p>
        </div>

        <div className="recycle-bin__retention">
          <label htmlFor="recycle-bin-retention">Keep deleted items for</label>
          <select
            id="recycle-bin-retention"
            value={retentionValue}
            disabled={!canChangeRetention || savingRetention || loading}
            onChange={(event) => changeRetention(event.target.value)}
          >
            {RETENTION_CHOICES.map((days) => (
              <option key={days} value={String(days)}>{days} days</option>
            ))}
            <option value="never">Forever (never erase)</option>
          </select>

          {canChangeRetention ? (
            <button
              type="button"
              className="recycle-bin__empty"
              onClick={emptyBin}
              disabled={savingRetention || loading || pendingCount === 0}
            >
              Empty the Bin now
            </button>
          ) : (
            <span className="recycle-bin__locked">Only a superadmin can change this.</span>
          )}

          {retention?.updatedBy ? (
            <span className="recycle-bin__meta">
              Last changed by {retention.updatedBy}
              {retention.updatedAt ? ` on ${formatCrInstant(retention.updatedAt)}` : ''}
            </span>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="recycle-bin__error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" /> {error}
        </p>
      ) : null}
      {notice ? <p className="recycle-bin__notice" role="status">{notice}</p> : null}

      <div className="recycle-bin__filters">
        <div className="recycle-bin__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="Search deleted items"
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search deleted items"
          />
        </div>

        <select
          value={tableFilter}
          onChange={(event) => setTableFilter(event.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {types.map((entry) => (
            <option key={entry.table} value={entry.table}>{entry.type}</option>
          ))}
        </select>

        <label className="recycle-bin__toggle">
          <input
            type="checkbox"
            checked={showRestored}
            onChange={(event) => setShowRestored(event.target.checked)}
          />
          Show items already restored
        </label>
      </div>

      {loading ? (
        <p className="recycle-bin__empty-state">Loading the Bin…</p>
      ) : entries.length === 0 ? (
        <p className="recycle-bin__empty-state">
          {search || tableFilter
            ? 'Nothing in the Bin matches that.'
            : 'The Bin is empty. Nothing has been deleted.'}
        </p>
      ) : (
        <div className="recycle-bin__table-wrap">
          {/* responsive-table is the shared rule that turns rows into cards on
              a phone, driven by the data-label on each cell. */}
          <table className="recycle-bin__table responsive-table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Item</th>
                <th scope="col">Deleted</th>
                <th scope="col">By</th>
                <th scope="col">Erased in</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className={entry.restored_at ? 'is-restored' : ''}>
                  <td data-label="Type">{entry.record_type}</td>
                  <td data-label="Item">
                    {entry.label}
                    {entry.delete_reason ? (
                      <span className="recycle-bin__reason">{entry.delete_reason}</span>
                    ) : null}
                  </td>
                  <td data-label="Deleted">{formatCrInstant(entry.deleted_at)}</td>
                  <td data-label="By">{entry.deleted_by_name || '—'}</td>
                  <td data-label="Erased in">
                    {entry.restored_at
                      ? <span className="recycle-bin__restored">Restored by {entry.restored_by_name || 'someone'}</span>
                      : entry.days_left === null
                        ? 'Never'
                        : entry.expired
                          ? <span className="recycle-bin__urgent">On the next nightly run</span>
                          : `${entry.days_left} day${entry.days_left === 1 ? '' : 's'}`}
                  </td>
                  <td data-label="Actions" className="recycle-bin__actions">
                    {entry.restored_at ? null : (
                      <>
                        <button
                          type="button"
                          onClick={() => restore(entry)}
                          disabled={busyId === entry.id}
                        >
                          <RotateCcw size={14} aria-hidden="true" />
                          {busyId === entry.id ? 'Restoring…' : 'Restore'}
                        </button>
                        {canChangeRetention ? (
                          <button
                            type="button"
                            className="recycle-bin__erase"
                            onClick={() => eraseOne(entry)}
                            disabled={busyId === entry.id}
                          >
                            Erase
                          </button>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
