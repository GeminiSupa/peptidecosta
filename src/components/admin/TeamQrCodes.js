'use client';

import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Printer, QrCode as QrIcon } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

/**
 * Every rep's referral QR in one place, for printing business cards.
 *
 * Owner-only, and rendered under the rep's own QR on the My QR & Scans tab so
 * there is a single place anyone goes for "where is my link".
 *
 * The PNG is generated at 1600px because these end up on a printer: a QR that
 * looks fine at screen size turns to mush at 300dpi on a card, and a print shop
 * cannot re-render one from a blurry image.
 */

const PRINT_PX = 1600;
const PREVIEW_PX = 420;

export default function TeamQrCodes({ defaultRate = 5 }) {
  const [reps, setReps] = useState([]);
  const [subUsers, setSubUsers] = useState([]);
  const [qrByName, setQrByName] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [rateDraft, setRateDraft] = useState({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/team-referrals');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Could not load the team');

      setReps(json.staff || []);
      setSubUsers(json.subUsers || []);

      const all = [...(json.staff || []), ...(json.subUsers || [])];
      const generated = {};
      await Promise.all(all.map(async (rep) => {
        generated[rep.name] = await QRCode.toDataURL(rep.link, {
          width: PREVIEW_PX,
          margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
      }));
      setQrByName(generated);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 3500);
  };

  const downloadPng = async (rep) => {
    // Re-rendered at print resolution rather than upscaling the preview.
    const dataUrl = await QRCode.toDataURL(rep.link, {
      width: PRINT_PX,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = rep.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const downloadAll = async (list) => {
    // Sequential, with a breath between each — browsers throttle or silently
    // drop a burst of simultaneous downloads.
    for (const rep of list) {
      await downloadPng(rep);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    flash(`Downloaded ${list.length} QR code${list.length === 1 ? '' : 's'}.`);
  };

  const copyLink = async (rep) => {
    try {
      await navigator.clipboard.writeText(rep.link);
      setCopiedId(rep.user_id || rep.name);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt(`Copy ${rep.name}'s referral link:`, rep.link);
    }
  };

  const saveRate = async (rep, value) => {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError('Commission must be between 0 and 100.');
      return;
    }
    setSavingId(rep.user_id);
    setError('');
    try {
      const res = await adminFetch('/api/admin/users/update', {
        method: 'PUT',
        body: JSON.stringify({ userId: rep.user_id, commission_rate: rate }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Could not save');
      setReps((current) => current.map((r) => (r.user_id === rep.user_id ? { ...r, commission_rate: rate } : r)));
      flash(`${rep.name} is now on ${rate}%.`);
    } catch (err) {
      setError(err.message);
    }
    setSavingId(null);
  };

  const setAllTo = async (list, rate) => {
    if (!window.confirm(`Set every one of these ${list.length} reps to ${rate}%? This changes what they are paid.`)) return;
    // Sequential on purpose: each is a separate write, and a failure part-way
    // should stop rather than fire the rest at a server that is already erroring.
    for (const rep of list) {
      await saveRate(rep, rate);
    }
  };

  if (loading) return <p className="dashboard-empty" style={{ padding: '24px 0' }}>Loading team QR codes…</p>;

  const card = (rep, { editable }) => (
    <div
      key={rep.user_id || rep.name}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 14,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: rep.active ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e7edf5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rep.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#93a2b6' }}>
            {rep.commission_rate}% commission{!rep.active ? ' · inactive' : ''}
          </div>
        </div>
      </div>

      {qrByName[rep.name] && (
        <img
          src={qrByName[rep.name]}
          alt={`Referral QR code for ${rep.name}`}
          style={{ width: '100%', borderRadius: 8, background: '#fff', padding: 6, display: 'block' }}
        />
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="admin-btn"
          style={{ flex: 1, padding: '9px', fontSize: '0.8rem', background: 'linear-gradient(135deg,#38bdf8,#2563eb)', color: '#04222e', fontWeight: 700 }}
          onClick={() => downloadPng(rep)}
        >
          <Download size={14} /> PNG
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          style={{ flex: 1, padding: '9px', fontSize: '0.8rem' }}
          onClick={() => copyLink(rep)}
        >
          {copiedId === (rep.user_id || rep.name) ? <Check size={14} /> : <Copy size={14} />}
          {copiedId === (rep.user_id || rep.name) ? 'Copied' : 'Link'}
        </button>
      </div>

      {editable && rep.user_id && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            aria-label={`Commission percent for ${rep.name}`}
            value={rateDraft[rep.user_id] ?? rep.commission_rate}
            onChange={(e) => setRateDraft((d) => ({ ...d, [rep.user_id]: e.target.value }))}
            style={{
              width: 68, padding: '7px 9px', borderRadius: 8, fontSize: '0.82rem',
              background: '#0c141f', border: '1px solid rgba(255,255,255,0.1)', color: '#e7edf5',
            }}
          />
          <span style={{ fontSize: '0.8rem', color: '#93a2b6' }}>%</span>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            style={{ flex: 1, padding: '7px', fontSize: '0.78rem' }}
            disabled={savingId === rep.user_id}
            onClick={() => saveRate(rep, rateDraft[rep.user_id] ?? rep.commission_rate)}
          >
            {savingId === rep.user_id ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );

  const grid = (list, opts) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
      gap: 12,
      marginTop: 12,
    }}>
      {list.map((rep) => card(rep, opts))}
    </div>
  );

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#e7edf5', display: 'flex', alignItems: 'center', gap: 8 }}>
            <QrIcon size={17} style={{ color: '#38bdf8' }} /> Team QR codes
          </h3>
          <p style={{ fontSize: '0.84rem', color: '#93a2b6', marginTop: 4, maxWidth: '58ch' }}>
            One QR per rep, for business cards. Downloads are {PRINT_PX}px so they stay sharp at print size.
            A scan is credited by the rep&apos;s <strong>name</strong>, so renaming someone breaks cards already printed.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={load}>Refresh</button>
          {reps.length > 0 && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => downloadAll(reps)}
            >
              <Printer size={15} /> Download all
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 9, fontSize: '0.85rem', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.28)', color: '#4ade80' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, padding: '10px 13px', borderRadius: 9, fontSize: '0.85rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {reps.length === 0 ? (
        <p className="dashboard-empty" style={{ marginTop: 12 }}>
          No team members with a name set yet.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#93a2b6', fontFamily: 'ui-monospace, monospace' }}>
              Staff · {reps.length}
            </span>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              style={{ padding: '5px 10px', fontSize: '0.76rem' }}
              onClick={() => setAllTo(reps, defaultRate)}
            >
              Set all to {defaultRate}%
            </button>
          </div>
          {grid(reps, { editable: true })}
        </>
      )}

      {subUsers.length > 0 && (
        <>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#93a2b6', marginTop: 24, fontFamily: 'ui-monospace, monospace' }}>
            Sub-users · {subUsers.length}
          </div>
          <p style={{ fontSize: '0.8rem', color: '#93a2b6', marginTop: 4 }}>
            Recruited by staff rather than hired. Their rate is set from My Team.
          </p>
          {grid(subUsers, { editable: false })}
        </>
      )}
    </section>
  );
}
