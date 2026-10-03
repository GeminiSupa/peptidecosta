import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, ShieldAlert } from 'lucide-react';

import { adminFetch } from '@/lib/adminApi';
import { formatCrInstant } from '@/lib/crTime.mjs';

/**
 * Activity Log — what every account has done, for the owner.
 *
 * Reads the route's own `summary` for each line rather than wording actions
 * here: the log and the rest of the app must not describe the same action two
 * different ways, and a panel that invents its own phrasing is how that starts.
 *
 * Times are Costa Rica, through formatCrInstant. The reader is eleven hours
 * ahead and these are business records — a sign-in at 2am local is a sign-in at
 * 3pm here, and the one that matters is here.
 */

const SUBJECT_LABELS = {
  account: 'Logins',
  notification_recipient: 'Alert list',
  order: 'Orders',
  customer: 'Customers',
  product: 'Products',
  deal: 'Deals',
  promo: 'Promo codes',
  payout: 'Payouts',
  session: 'Sign-ins',
};

/** The colour a row's dot takes: red for anything that removes or widens reach. */
function toneFor(action) {
  if (/deleted|removed|revoked|restricted/.test(action)) return '#f87171';
  if (/permissions_changed|created|approved|launched/.test(action)) return '#fbbf24';
  if (action.startsWith('session.')) return '#60a5fa';
  return '#4ade80';
}

export default function ActivityLogPanel({ adminProfile }) {
  const [entries, setEntries] = useState([]);
  const [available, setAvailable] = useState(true);
  const [notice, setNotice] = useState('');
  const [retentionDays, setRetentionDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (actorFilter) params.set('actor', actorFilter);
      if (subjectFilter) params.set('subjectType', subjectFilter);
      const res = await adminFetch(`/api/admin/activity-log?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not load the activity log');
      setEntries(json.entries || []);
      setAvailable(json.available !== false);
      setNotice(json.message || '');
      setRetentionDays(json.retentionDays || 90);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, actorFilter, subjectFilter]);

  useEffect(() => { load(); }, [load]);

  // Built from what is actually in the log, not from the list of accounts: the
  // point is often somebody who has since been deleted.
  const actors = useMemo(() => {
    const seen = new Map();
    for (const row of entries) {
      if (!row.actor_email) continue;
      if (!seen.has(row.actor_email)) seen.set(row.actor_email, row.actor_name || row.actor_email);
    }
    return [...seen.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [entries]);

  if (!adminProfile?.is_superadmin) {
    return (
      <div style={{ padding: '2rem', color: '#94a3b8' }}>
        <ShieldAlert size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
        The activity log is for the owner only.
      </div>
    );
  }

  const selectStyle = {
    background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
    borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.85rem',
  };

  return (
    <div style={{ padding: '1rem 0' }}>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 1rem', maxWidth: '62ch', lineHeight: 1.5 }}>
        Everything each login has done — team and affiliates. Kept for {retentionDays} days,
        then deleted automatically. Times are Costa Rica.
        <br />
        This records <strong>actions</strong>, not typing: no keystrokes, no passwords, and no
        customer details are stored here.
      </p>

      {!available && (
        <div style={{
          background: '#422006', border: '1px solid #a16207', color: '#fde68a',
          padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1rem', fontSize: '0.85rem',
        }}>
          {notice || 'The activity log is not switched on yet.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#64748b' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a person or what they touched"
            style={{ ...selectStyle, width: '100%', paddingLeft: 32 }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              style={{ position: 'absolute', right: 6, top: 7, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} style={selectStyle}>
          <option value="">Everybody</option>
          {actors.map(([email, name]) => <option key={email} value={email}>{name}</option>)}
        </select>

        <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} style={selectStyle}>
          <option value="">Everything</option>
          {Object.entries(SUBJECT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <button
          onClick={load}
          disabled={loading}
          style={{
            ...selectStyle, cursor: loading ? 'default' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: '#450a0a', border: '1px solid #b91c1c', color: '#fecaca', padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {loading && entries.length === 0 && <p style={{ color: '#64748b' }}>Loading…</p>}

      {!loading && entries.length === 0 && available && !error && (
        <p style={{ color: '#64748b' }}>
          Nothing recorded yet{search || actorFilter || subjectFilter ? ' for that' : ''}.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {entries.map((row) => (
          <div
            key={row.id}
            style={{
              display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
              background: '#111827', border: '1px solid #1f2937',
              borderRadius: 10, padding: '0.7rem 0.9rem',
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
              background: toneFor(String(row.action || '')),
            }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontSize: '0.88rem', lineHeight: 1.45 }}>
                {row.summary || row.action}
              </div>
              {row.detail && Object.keys(row.detail).length > 0 && (
                <div style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: 3, lineHeight: 1.5 }}>
                  {Object.entries(row.detail).map(([field, change]) => {
                    const from = change && typeof change === 'object' ? change.from : '';
                    const to = change && typeof change === 'object' ? change.to : String(change);
                    return (
                      <span key={field} style={{ marginRight: 12 }}>
                        <span style={{ color: '#64748b' }}>{field.replace(/_/g, ' ')}:</span>{' '}
                        {from ? <><s style={{ color: '#64748b' }}>{from}</s> → </> : null}{to}
                      </span>
                    );
                  })}
                </div>
              )}
              <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 4 }}>
                {formatCrInstant(row.at)}
                {row.actor_tier && row.actor_tier !== 'staff' ? ` · ${row.actor_tier}` : ''}
                {row.ip ? ` · ${row.ip}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
        <p style={{ color: '#475569', fontSize: '0.75rem', marginTop: '1rem' }}>
          Showing the {entries.length} most recent. Narrow it with the filters above.
        </p>
      )}
    </div>
  );
}
