'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight, Check, Clock, DollarSign, Pause, Play, Plus, Trash2, Users, X,
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

/**
 * My Team — the sub-user tier.
 *
 * Two audiences, one screen:
 *   - a staff member sees the people she recruited, and can invite more
 *   - the owner sees everyone's, and is the only one who can approve
 *
 * Mobile first throughout: the invite form is a bottom sheet with its submit
 * button in thumb reach, and the split is restated wherever money is decided so
 * nobody has to remember the deal.
 */

const money = (value) =>
  `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLES = {
  active: { label: 'Active', bg: 'rgba(74,222,128,0.14)', color: '#4ade80' },
  pending: { label: 'Pending', bg: 'rgba(251,191,36,0.14)', color: '#fbbf24' },
  suspended: { label: 'Off', bg: 'rgba(148,163,184,0.14)', color: '#94a3b8' },
};

function StatusPill({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.active;
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: '20px', whiteSpace: 'nowrap',
      background: style.bg, color: style.color,
    }}>
      {style.label}
    </span>
  );
}

function Avatar({ name, status, url }) {
  const gradient = status === 'pending'
    ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
    : status === 'suspended'
      ? 'linear-gradient(135deg, #94a3b8, #64748b)'
      : 'linear-gradient(135deg, #38bdf8, #3b82f6)';
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: gradient, color: '#04222e', fontWeight: 900, fontSize: '0.85rem',
    }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

export default function MyTeamManager({ currentUserProfile, onTeamChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formWhatsApp, setFormWhatsApp] = useState('');
  const [formParent, setFormParent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [approving, setApproving] = useState(null);
  const [approvePassword, setApprovePassword] = useState('');

  // Reassignment: who is being moved, where to, and the unpaid override the
  // outgoing staff member has earned that the owner needs to see first.
  const [moving, setMoving] = useState(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveWarning, setMoveWarning] = useState(null);

  const isOwner = Boolean(currentUserProfile?.is_superadmin);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/sub-users');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Could not load your team');
      setData(json);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const subUsers = useMemo(() => data?.subUsers || [], [data]);
  const pending = useMemo(() => subUsers.filter((s) => s.status === 'pending'), [subUsers]);
  const settled = useMemo(() => subUsers.filter((s) => s.status !== 'pending'), [subUsers]);

  const overrideRate = Number(data?.overrideRate ?? 2);
  const subRate = Number(data?.defaultSubUserRate ?? 8);
  const spotsUsed = Number(data?.spotsUsed ?? 0);
  const cap = Number(data?.cap ?? 5);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const submitInvite = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/sub-users', {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          whatsapp_number: formWhatsApp,
          ...(isOwner && formParent ? { parent_agent_id: formParent } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Could not send the invite');
      setSheetOpen(false);
      setFormName(''); setFormEmail(''); setFormWhatsApp(''); setFormParent('');
      flash(isOwner ? `${json.subUser.name} added — approve them below to switch on their link.` : 'Sent. The owner will approve them shortly.');
      await load();
      onTeamChanged?.();
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  const act = async (id, action, extra = {}) => {
    setBusyId(id);
    setError('');
    try {
      const res = await adminFetch('/api/admin/sub-users', {
        method: 'PATCH',
        body: JSON.stringify({ id, action, ...extra }),
      });
      const json = await res.json();

      // Reassigning someone with unpaid override: the API asks once before
      // moving money from the outgoing staff member to the incoming one.
      if (json.needsConfirmation) {
        setMoveWarning({ id, ...json });
        setBusyId(null);
        return;
      }

      if (!res.ok || json.error) throw new Error(json.error || 'That did not work');

      setApproving(null);
      setApprovePassword('');
      setMoving(null);
      setMoveTarget('');
      setMoveWarning(null);
      if (action === 'reassign') {
        flash(`${json.subUser?.name || 'They'} now report to ${json.movedTo}.`);
      }
      await load();
      onTeamChanged?.();
    } catch (err) {
      setError(err.message);
    }
    setBusyId(null);
  };

  /** Staff this person could be moved to — everyone except their current one. */
  const moveOptions = (person) =>
    (data?.staff || []).filter((member) => member.user_id !== person.parent_agent_id);

  if (loading) return <p className="dashboard-empty" style={{ padding: '32px 0' }}>Loading your team…</p>;

  const splitBanner = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '10px 14px', borderRadius: 10, fontSize: '0.82rem',
      background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.18)', color: '#93a2b6',
    }}>
      <span>They earn <strong style={{ color: '#38bdf8' }}>{subRate}%</strong> of an order they bring</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>you earn <strong style={{ color: '#4ade80' }}>{overrideRate}%</strong> of the same order</span>
    </div>
  );

  return (
    <div className="dashboard-home">
      <div className="dashboard-home-header">
        <div>
          <h2 className="dashboard-home-title">{isOwner ? 'Sub-Users' : 'My Team'}</h2>
          <p className="dashboard-home-subtitle">
            {isOwner
              ? `${settled.length} on the roster · ${pending.length} waiting for you`
              : `${spotsUsed} of ${cap} spots used`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={load}>Refresh</button>
        </div>
      </div>

      {notice && (
        <div style={{
          padding: '11px 14px', borderRadius: 10, marginBottom: 14, fontSize: '0.86rem',
          background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.28)', color: '#4ade80',
        }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{
          padding: '11px 14px', borderRadius: 10, marginBottom: 14, fontSize: '0.86rem',
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171',
        }}>
          {error}
        </div>
      )}

      {!isOwner && (
        <div className="dashboard-kpi-grid">
          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-icon" style={{ background: 'rgba(74,197,94,0.15)', color: '#4ade80' }}>
              <DollarSign size={20} />
            </div>
            <div>
              <div className="dashboard-kpi-value" style={{ fontSize: '1.1rem' }}>{overrideRate}%</div>
              <div className="dashboard-kpi-label">My cut of their orders</div>
              <div className="dashboard-mini-sub">Paid with your weekly report</div>
            </div>
          </div>
          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-icon" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
              <Users size={20} />
            </div>
            <div>
              <div className="dashboard-kpi-value" style={{ fontSize: '1.1rem' }}>{spotsUsed} / {cap}</div>
              <div className="dashboard-kpi-label">Spots used</div>
              <div className="dashboard-mini-sub">Only active people count</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>{splitBanner}</div>

      {pending.length > 0 && (
        <section className="dashboard-section" style={{ marginBottom: 18 }}>
          <h3 className="dashboard-section-title">
            <Clock size={15} style={{ verticalAlign: '-2px', marginRight: 6, color: '#fbbf24' }} />
            {isOwner ? 'Waiting for your approval' : 'Waiting for approval'}
          </h3>
          <div className="dashboard-mini-list">
            {pending.map((person) => (
              <div key={person.id} style={{
                padding: '12px 13px', borderRadius: 11, marginBottom: 8,
                background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.28)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={person.name} status="pending" url={person.avatar_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dashboard-mini-title">{person.name}</div>
                    <div className="dashboard-mini-sub">
                      {person.email}
                      {isOwner && person.parent_name ? ` · under ${person.parent_name}` : ''}
                    </div>
                  </div>
                  {!isOwner && <StatusPill status="pending" />}
                </div>

                {isOwner && approving === person.id && (
                  <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="dashboard-mini-sub" htmlFor={`pw-${person.id}`}>
                      Set the password they will log in with
                    </label>
                    <input
                      id={`pw-${person.id}`}
                      type="text"
                      autoComplete="off"
                      value={approvePassword}
                      onChange={(e) => setApprovePassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="admin-input"
                      style={{
                        padding: '10px 12px', borderRadius: 9, fontSize: '0.9rem',
                        background: '#0c141f', border: '1px solid rgba(255,255,255,0.1)', color: '#e7edf5',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 7 }}>
                      <button
                        type="button"
                        className="admin-btn"
                        style={{ flex: 1, background: 'linear-gradient(135deg,#4ade80,#16a34a)', color: '#04240f', fontWeight: 800 }}
                        disabled={busyId === person.id || approvePassword.length < 8}
                        onClick={() => act(person.id, 'approve', { password: approvePassword })}
                      >
                        <Check size={15} /> {busyId === person.id ? 'Approving…' : 'Approve & create login'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        onClick={() => { setApproving(null); setApprovePassword(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {isOwner && approving !== person.id && (
                  <>
                    <div style={{
                      marginTop: 10, padding: '8px 11px', borderRadius: 9, fontSize: '0.76rem',
                      fontFamily: 'ui-monospace, monospace',
                      background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.16)', color: '#93a2b6',
                    }}>
                      <strong style={{ color: '#38bdf8' }}>{subRate}%</strong> to {person.name}
                      {' · '}
                      <strong style={{ color: '#4ade80' }}>{overrideRate}%</strong> to {person.parent_name || 'their staff member'}
                      {' · '}
                      <strong style={{ color: '#f87171' }}>{subRate + overrideRate}% total</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                      <button
                        type="button"
                        className="admin-btn"
                        style={{ flex: 1, background: 'linear-gradient(135deg,#4ade80,#16a34a)', color: '#04240f', fontWeight: 800 }}
                        onClick={() => { setApproving(person.id); setApprovePassword(''); }}
                      >
                        <Check size={15} /> Approve
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        style={{ flex: 1 }}
                        disabled={busyId === person.id}
                        onClick={() => {
                          if (window.confirm(`Decline ${person.name}? The invite is removed and no login is created.`)) {
                            act(person.id, 'decline');
                          }
                        }}
                      >
                        <X size={15} /> Decline
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-section">
        <h3 className="dashboard-section-title">
          <Users size={15} style={{ verticalAlign: '-2px', marginRight: 6, color: '#38bdf8' }} />
          {isOwner ? `Roster · ${settled.length}` : `My people · ${settled.length}`}
        </h3>

        {settled.length === 0 ? (
          <p className="dashboard-empty">
            {isOwner
              ? 'No sub-users yet. Staff with the My Team tab can invite people here.'
              : 'Nobody yet. Invite someone and they start earning once the owner approves.'}
          </p>
        ) : (
          <div className="dashboard-mini-list">
            {settled.map((person) => (
              <div key={person.id} style={{ marginBottom: 8 }}>
                <div className="dashboard-mini-row" style={{ cursor: 'default', alignItems: 'center' }}>
                  <Avatar name={person.name} status={person.status} url={person.avatar_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dashboard-mini-title">{person.name}</div>
                    <div className="dashboard-mini-sub">
                      {Number(person.commission_rate ?? subRate)}% · {person.email}
                      {isOwner && person.parent_name ? ` · under ${person.parent_name}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <StatusPill status={person.status} />
                    {isOwner && (
                      <>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          title="Move to another staff member"
                          disabled={busyId === person.id}
                          style={{ padding: '6px 9px' }}
                          onClick={() => {
                            setMoving(moving === person.id ? null : person.id);
                            setMoveTarget('');
                            setMoveWarning(null);
                          }}
                        >
                          <ArrowLeftRight size={14} />
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          title={person.status === 'suspended' ? 'Switch back on' : 'Stop future commission'}
                          disabled={busyId === person.id}
                          style={{ padding: '6px 9px' }}
                          onClick={() => act(person.id, person.status === 'suspended' ? 'reactivate' : 'suspend')}
                        >
                          {person.status === 'suspended' ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          title="Remove completely"
                          disabled={busyId === person.id}
                          style={{ padding: '6px 9px', color: '#f87171' }}
                          onClick={() => {
                            if (window.confirm(`Remove ${person.name} for good? Approved payouts are kept, but their login stops working.`)) {
                              act(person.id, 'decline');
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isOwner && moving === person.id && (
                  <div style={{
                    marginTop: 6, padding: '12px 13px', borderRadius: 11,
                    background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.24)',
                    display: 'flex', flexDirection: 'column', gap: 9,
                  }}>
                    <div>
                      <div className="dashboard-mini-title">Move {person.name}</div>
                      <div className="dashboard-mini-sub">
                        They keep their {Number(person.commission_rate ?? subRate)}%, their link and their login.
                        Only who earns the {overrideRate}% changes.
                      </div>
                    </div>

                    {moveOptions(person).length === 0 ? (
                      <p className="dashboard-mini-sub">
                        There is no other staff member to move them to yet.
                      </p>
                    ) : (
                      <>
                        <select
                          aria-label={`New staff member for ${person.name}`}
                          value={moveTarget}
                          onChange={(e) => { setMoveTarget(e.target.value); setMoveWarning(null); }}
                          style={{
                            padding: '10px 12px', borderRadius: 9, fontSize: '0.9rem',
                            background: '#0c141f', border: '1px solid rgba(255,255,255,0.1)', color: '#e7edf5',
                          }}
                        >
                          <option value="">Choose a staff member…</option>
                          {moveOptions(person).map((member) => (
                            <option key={member.user_id} value={member.user_id} style={{ color: '#0f172a' }}>
                              {member.name || member.email}
                            </option>
                          ))}
                        </select>

                        {moveWarning?.id === person.id && (
                          <div style={{
                            padding: '11px 13px', borderRadius: 9, fontSize: '0.84rem',
                            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.34)', color: '#fbbf24',
                          }}>
                            <strong>{moveWarning.outstanding.parentName} has not been paid yet</strong>
                            <div style={{ marginTop: 5, color: '#e7edf5' }}>
                              {person.name} has {moveWarning.outstanding.ordersCount} completed order
                              {moveWarning.outstanding.ordersCount === 1 ? '' : 's'} worth{' '}
                              <strong>{money(moveWarning.outstanding.usd)}</strong> of override that no payout
                              has covered. Move them now and {moveWarning.newParentName} collects it instead.
                            </div>
                            <div style={{ marginTop: 7, color: '#93a2b6', fontSize: '0.8rem' }}>
                              Run the weekly payout scan and approve {moveWarning.outstanding.parentName}&apos;s
                              week first if that money is hers.
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 7 }}>
                          <button
                            type="button"
                            className="admin-btn"
                            disabled={!moveTarget || busyId === person.id}
                            style={{
                              flex: 1,
                              background: moveWarning?.id === person.id
                                ? 'linear-gradient(135deg,#fbbf24,#f59e0b)'
                                : 'linear-gradient(135deg,#38bdf8,#2563eb)',
                              color: moveWarning?.id === person.id ? '#2a1f05' : '#04222e',
                              fontWeight: 800,
                              opacity: !moveTarget ? 0.5 : 1,
                            }}
                            onClick={() => act(person.id, 'reassign', {
                              parent_agent_id: moveTarget,
                              ...(moveWarning?.id === person.id ? { confirm: true } : {}),
                            })}
                          >
                            {busyId === person.id
                              ? 'Moving…'
                              : moveWarning?.id === person.id
                                ? 'Move anyway'
                                : 'Move'}
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-secondary"
                            onClick={() => { setMoving(null); setMoveTarget(''); setMoveWarning(null); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isOwner && (
          <p className="dashboard-mini-sub" style={{ marginTop: 12, fontStyle: 'italic' }}>
            Suspending stops future commission. Payouts you have already approved are never touched.
          </p>
        )}
      </section>

      <button
        type="button"
        className="admin-btn"
        style={{
          marginTop: 18, width: '100%', padding: '13px',
          background: 'linear-gradient(135deg,#38bdf8,#2563eb)', color: '#04222e',
          fontWeight: 800, fontSize: '0.95rem',
        }}
        onClick={() => { setSheetOpen(true); setError(''); }}
      >
        <Plus size={17} /> Invite someone
      </button>

      {sheetOpen && (
        <>
          <div
            role="presentation"
            onClick={() => setSheetOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(5,9,17,0.6)', zIndex: 900 }}
          />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 901,
            background: '#0e1626', borderTop: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '20px 20px 0 0', padding: '12px 16px 20px',
            maxHeight: '88vh', overflowY: 'auto',
            boxShadow: '0 -18px 40px rgba(0,0,0,0.45)',
            maxWidth: 520, margin: '0 auto',
          }}>
            <div style={{ width: 38, height: 4, borderRadius: 3, background: '#2b3a4f', margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#e7edf5' }}>Invite someone</h3>
            <p className="dashboard-mini-sub" style={{ marginBottom: 14 }}>
              {isOwner
                ? 'Added straight to the roster — approve them to switch on their link.'
                : 'They start earning once the owner approves them.'}
            </p>

            <form onSubmit={submitInvite} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="dashboard-mini-sub" htmlFor="su-name">
                  THEIR NAME — commission is tracked by this, so it must be unique
                </label>
                <input
                  id="su-name" required value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="Diego Ruiz"
                  style={{ padding: '11px 12px', borderRadius: 9, fontSize: '0.95rem', background: '#0c141f', border: '1px solid rgba(255,255,255,0.1)', color: '#e7edf5' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="dashboard-mini-sub" htmlFor="su-email">EMAIL — THEY LOG IN WITH THIS</label>
                <input
                  id="su-email" type="email" required value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="diego@example.com"
                  style={{ padding: '11px 12px', borderRadius: 9, fontSize: '0.95rem', background: '#0c141f', border: '1px solid rgba(255,255,255,0.1)', color: '#e7edf5' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="dashboard-mini-sub" htmlFor="su-wa">WHATSAPP (OPTIONAL)</label>
                <input
                  id="su-wa" value={formWhatsApp} onChange={(e) => setFormWhatsApp(e.target.value)}
                  placeholder="+506 8812 4490"
                  style={{ padding: '11px 12px', borderRadius: 9, fontSize: '0.95rem', background: '#0c141f', border: '1px solid rgba(255,255,255,0.1)', color: '#e7edf5' }}
                />
              </div>

              {isOwner && (data?.staff?.length || 0) > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="dashboard-mini-sub" htmlFor="su-parent">WHOSE TEAM?</label>
                  <select
                    id="su-parent" required value={formParent} onChange={(e) => setFormParent(e.target.value)}
                    style={{ padding: '11px 12px', borderRadius: 9, fontSize: '0.95rem', background: '#0c141f', border: '1px solid rgba(255,255,255,0.1)', color: '#e7edf5' }}
                  >
                    <option value="">Choose a staff member…</option>
                    {data.staff.map((member) => (
                      <option key={member.user_id} value={member.user_id} style={{ color: '#0f172a' }}>
                        {member.name || member.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 9,
                fontSize: '0.82rem', background: 'rgba(74,222,128,0.07)',
                border: '1px solid rgba(74,222,128,0.2)', color: '#93a2b6',
              }}>
                {formName || 'They'} get <strong style={{ color: '#4ade80' }}>{subRate}%</strong>
                {' · '}
                {isOwner ? 'their staff member gets' : 'you get'} <strong style={{ color: '#4ade80' }}>{overrideRate}%</strong>
              </div>

              {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="admin-btn"
                style={{
                  padding: '13px', background: 'linear-gradient(135deg,#38bdf8,#2563eb)',
                  color: '#04222e', fontWeight: 800, fontSize: '0.95rem',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Sending…' : isOwner ? 'Add to roster' : 'Send for approval'}
              </button>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setSheetOpen(false)}>
                Cancel
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
