'use client';

import React, { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  QrCode, Download, Copy, Check, RefreshCw, Loader,
  Smartphone, Monitor, Tablet, AlertTriangle,
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const CARD = {
  background: 'rgba(15,23,42,0.6)',
  border: '1px solid rgba(148,163,184,0.15)',
  borderRadius: '12px',
  padding: '16px',
};

const DEVICE_ICON = { mobile: Smartphone, desktop: Monitor, tablet: Tablet };

function StatCard({ label, value, sub, color = '#38bdf8' }) {
  return (
    <div style={{ ...CARD, minWidth: 0 }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color, lineHeight: 1.15, wordBreak: 'break-word' }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>{label}</div>
      {sub ? <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

export default function MyReferralQr() {
  const [data, setData] = useState(null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch(`/api/agent/referral?days=${days}`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || 'Could not load your QR code.');
        setData(null);
        setQr('');
      } else {
        setData(json);
        const dataUrl = await QRCode.toDataURL(json.link, {
          width: 720,
          margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        setQr(dataUrl);
      }
    } catch (err) {
      console.error(err);
      setError('Could not load your QR code. Please try again.');
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const copyLink = async () => {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy your referral link:', data.link);
    }
  };

  const download = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `${String(data?.name || 'my').replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    a.click();
  };

  if (loading) {
    return (
      <p style={{ padding: '32px 0', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Loader size={16} className="spin" /> Loading your QR code…
      </p>
    );
  }

  if (error) {
    return (
      <div style={{ ...CARD, borderColor: 'rgba(248,113,113,0.4)', color: '#fca5a5', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle size={18} />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{error}</div>
          <button className="admin-btn admin-btn-secondary" onClick={load} style={{ marginTop: 8 }}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const s = data.stats || {};

  return (
    <div style={{ padding: '20px 0', display: 'grid', gap: 20, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <QrCode size={20} color="#22d3ee" />
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#e2e8f0' }}>
          {data.name}&apos;s referral QR
        </h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Last</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="admin-input"
            style={{ padding: '4px 8px' }}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
        </div>
      </div>

      {data.migrationRequired ? (
        <div style={{ ...CARD, borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24', display: 'flex', gap: 10, alignItems: 'center' }}>
          <AlertTriangle size={16} />
          <span>Scan tracking isn&apos;t switched on yet, so scan counts show zero. Your QR and link still work.</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* QR + actions */}
        <div style={{ ...CARD, textAlign: 'center', flex: '0 0 auto', width: 280, maxWidth: '100%' }}>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Your referral QR code" style={{ width: '100%', maxWidth: 240, borderRadius: 8, background: '#fff', padding: 8 }} />
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
            <button className="admin-btn admin-btn-primary" onClick={download}>
              <Download size={14} /> Download QR
            </button>
            <button className="admin-btn admin-btn-secondary" onClick={copyLink}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: '0.72rem', color: '#64748b', wordBreak: 'break-all', textAlign: 'left' }}>
            {data.link}
          </div>
        </div>

        {/* Stats */}
        <div style={{ flex: '1 1 280px', minWidth: 0, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <StatCard label="Scans" value={s.scans ?? 0} color="#22d3ee" />
            <StatCard label="Orders" value={s.orders ?? 0} color="#4ade80" />
            <StatCard
              label="Conversion"
              value={s.conversionRate === null || s.conversionRate === undefined ? '—' : `${s.conversionRate}%`}
              color="#a78bfa"
            />
            <StatCard
              label="Revenue"
              value={`$${Number(s.revenueUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              color="#fb923c"
            />
          </div>

          <div style={CARD}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: 8 }}>Scans by device</div>
            {Object.keys(s.byDevice || {}).length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No scans yet in this period.</div>
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {Object.entries(s.byDevice).map(([device, count]) => {
                  const Icon = DEVICE_ICON[device] || Monitor;
                  return (
                    <div key={device} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: '0.9rem' }}>
                      <Icon size={16} color="#38bdf8" />
                      <span style={{ textTransform: 'capitalize' }}>{device}</span>
                      <strong>{count}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
            Print or share this QR. When someone scans it and buys, the sale is credited to you automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
