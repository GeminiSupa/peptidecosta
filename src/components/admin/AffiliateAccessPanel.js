'use client';

/**
 * Affiliate logins — who can sign in, and what they can reach.
 *
 * This screen exists because giving an affiliate a dashboard used to mean
 * creating them in Team, which is how outside partners ended up holding staff
 * access nobody meant to give them. Affiliates are created and given logins
 * here now; Team is for the team.
 *
 * It reports what it can verify and guesses at nothing. Whether a person is
 * "really" an agent or "really" an outsider is not written down anywhere
 * reliable — affiliate_kind was filled in by a bulk update, and logins were
 * handed out through the only door that existed. So the third column is blank
 * until somebody who knows sets it, and nobody's access changes on its own.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';

const STATE_STYLE = {
  no_login: { color: '#94a3b8', background: 'rgba(148,163,184,0.12)' },
  affiliate_only: { color: '#4ade80', background: 'rgba(74,222,128,0.12)' },
  team_member: { color: '#fbbf24', background: 'rgba(251,191,36,0.12)' },
  orphan_link: { color: '#f87171', background: 'rgba(248,113,113,0.12)' },
};

export default function AffiliateAccessPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [creatingFor, setCreatingFor] = useState(null);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('read');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/affiliates/access');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load affiliate logins.');
      setRows(body.affiliates || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (affiliateId, payload, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(affiliateId);
    setNotice('');
    setError('');
    try {
      const res = await adminFetch('/api/admin/affiliates/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliateId, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'That did not work.');
      setNotice(body.message || 'Saved.');
      setCreatingFor(null);
      setPassword('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p style={{ color: '#94a3b8' }}>Loading affiliate logins…</p>;

  return (
    <div style={{ color: '#f8fafc' }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Affiliate logins</h3>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.6 }}>
          An affiliate login opens one small dashboard — their link, their own orders, their own
          payouts and their own details. It reaches nothing else in the admin.
        </p>
      </div>

      {error && <Banner tone="#f87171">{error}</Banner>}
      {notice && <Banner tone="#4ade80">{notice}</Banner>}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((row) => {
          const style = STATE_STYLE[row.state] || STATE_STYLE.no_login;
          const busy = busyId === row.id;
          return (
            <div key={row.id} style={card}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 200 }}>
                  <strong style={{ fontSize: '0.95rem' }}>{row.name || '(no name)'}</strong>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{row.email || 'no email'}</div>
                </div>

                <span style={{ ...pill, ...style }}>{row.label}</span>

                <div style={{ flex: '1 1 240px', color: '#94a3b8', fontSize: '0.8rem' }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.68rem' }}>Can reach</span>
                  <div style={{ marginTop: 2 }}>{row.reaches.join(', ') || '—'}</div>
                </div>
              </div>

              {row.mismatch && (
                <p style={{ margin: '10px 0 0', color: '#fbbf24', fontSize: '0.8rem', lineHeight: 1.5 }}>
                  {row.mismatch}
                </p>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
                {row.state === 'no_login' && creatingFor !== row.id && (
                  <button style={primary} disabled={busy} onClick={() => { setCreatingFor(row.id); setMode('read'); }}>
                    Give them a login
                  </button>
                )}

                {row.state === 'no_login' && creatingFor === row.id && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', width: '100%' }}>
                    <input
                      type="text"
                      placeholder="Password for them (8+ characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={input}
                    />
                    <select value={mode} onChange={(e) => setMode(e.target.value)} style={input}>
                      <option value="read">View only</option>
                      <option value="read_write">View and edit their own details</option>
                    </select>
                    <button
                      style={primary}
                      disabled={busy || password.length < 8}
                      onClick={() => act(row.id, { action: 'create_login', password, mode })}
                    >
                      {busy ? 'Creating…' : 'Create login'}
                    </button>
                    <button style={ghost} onClick={() => { setCreatingFor(null); setPassword(''); }}>Cancel</button>
                  </div>
                )}

                {row.state === 'affiliate_only' && (
                  <>
                    <select
                      value={row.mode || 'read'}
                      disabled={busy}
                      onChange={(e) => act(row.id, { action: 'set_mode', mode: e.target.value })}
                      style={input}
                    >
                      <option value="read">View only</option>
                      <option value="read_write">View and edit their own details</option>
                    </select>
                    <button
                      style={danger}
                      disabled={busy}
                      onClick={() => act(row.id, { action: 'revoke_login' },
                        `Remove ${row.name || 'this affiliate'}'s login? They will not be able to sign in. Their orders and payouts are untouched.`)}
                    >
                      Remove login
                    </button>
                  </>
                )}

                {row.state === 'team_member' && !row.isSuperadmin && (
                  <button
                    style={danger}
                    disabled={busy}
                    onClick={() => act(row.id, { action: 'restrict' },
                      `Restrict ${row.name || 'this person'} to affiliate only?\n\nThey LOSE: ${row.reaches.join(', ')}\nThey KEEP: their link, their own orders, their own payouts, their own details.\n\nThis does not delete anything.`)}
                  >
                    Restrict to affiliate only
                  </button>
                )}

                {row.state === 'team_member' && row.isSuperadmin && (
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                    Superadmins are managed in Team.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Banner({ tone, children }) {
  return (
    <div style={{
      border: `1px solid ${tone}`, color: tone, background: 'rgba(255,255,255,0.02)',
      borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: '0.85rem',
    }}>
      {children}
    </div>
  );
}

const card = { background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14 };
const pill = { padding: '4px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' };
const input = { padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0b1220', color: '#f8fafc', fontSize: '0.85rem' };
const primary = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#0e1626', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' };
const ghost = { padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#f8fafc', cursor: 'pointer', fontSize: '0.85rem' };
const danger = { ...ghost, borderColor: 'rgba(248,113,113,0.5)', color: '#f87171' };
