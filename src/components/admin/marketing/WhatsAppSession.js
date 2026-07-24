"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import {
  CheckCircle2, AlertTriangle, Loader2, LogOut,
  RefreshCw, Smartphone, Wifi, WifiOff, MessageCircle,
} from 'lucide-react';

const POLL_INTERVAL_MS = 2500;

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ state }) {
  const MAP = {
    connected:    { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.25)',  icon: CheckCircle2, label: 'Connected'    },
    qr:           { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  icon: Smartphone,   label: 'Scan QR'      },
    connecting:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  icon: Loader2,      label: 'Connecting…'  },
    disconnected: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', icon: WifiOff,      label: 'Disconnected' },
  };
  const cfg   = MAP[state] || MAP.disconnected;
  const Icon  = cfg.icon;
  const spin  = state === 'connecting';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      borderRadius: '20px', padding: '4px 12px',
      fontSize: '12px', fontWeight: '700',
    }}>
      <Icon size={13} className={spin ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WhatsAppSessionTab() {
  const [status,     setStatus]     = useState({ state: 'disconnected', qrDataUrl: null, number: null, error: null });
  const [loading,    setLoading]    = useState(true);
  const [testPhone,  setTestPhone]  = useState('');
  const [testMsg,    setTestMsg]    = useState('');
  const [sending,    setSending]    = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, text }
  const [allowCold,  setAllowCold]  = useState(false);
  const pollRef = useRef(null);

  // ── Polling ──────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res  = await adminFetch('/api/admin/whatsapp-session');
      const data = await res.json();
      setStatus(data);
    } catch (_) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchStatus]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setLoading(true);
    await adminFetch('/api/admin/whatsapp-session', { method: 'POST' });
    await fetchStatus();
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect and wipe saved credentials?')) return;
    setLoading(true);
    await adminFetch('/api/admin/whatsapp-session', { method: 'DELETE' });
    setStatus({ state: 'disconnected', qrDataUrl: null, number: null, error: null });
    setLoading(false);
  };

  const handleTestSend = async (e) => {
    e.preventDefault();
    if (!testPhone || !testMsg) return;
    setSending(true);
    setTestResult(null);
    try {
      const res  = await adminFetch('/api/admin/whatsapp-session/send', {
        method: 'POST',
        body: JSON.stringify({ phone: testPhone, message: testMsg, allowColdSend: allowCold }),
      });
      const data = await res.json();
      setTestResult({ ok: res.ok && !data.error, text: data.error || data.text || 'Message sent!' });
    } catch (err) {
      setTestResult({ ok: false, text: err.message });
    } finally {
      setSending(false);
    }
  };

  const { state, qrDataUrl, number, error } = status;
  const isConnected   = state === 'connected';
  const isQR          = state === 'qr';
  const isConnecting  = state === 'connecting';
  const isDisconnected = state === 'disconnected';

  return (
    <div className="mkt-fade-in" style={{ maxWidth: '680px', margin: '0 auto' }}>

      {/* ── Header card ── */}
      <div className="mkt-panel" style={{ marginBottom: '16px' }}>
        <div className="mkt-panel-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="mkt-panel-kicker">WhatsApp connection</div>
            <h3 className="mkt-panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageCircle size={17} style={{ color: '#34d399' }} />
              WhatsApp Device
            </h3>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: '4px 0 0', lineHeight: '1.5' }}>
              Connect a WhatsApp number by scanning a QR code once.
              The device connection stays alive on the server after setup.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <StatusBadge state={state} />
            {number && (
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                +{number}
              </span>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', padding: '10px 14px', marginTop: '12px', fontSize: '13px', color: '#fca5a5' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
          {(isDisconnected || error) && (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="mkt-btn mkt-btn-primary"
              style={{ flex: '1 1 auto' }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
              Connect &amp; Get QR
            </button>
          )}

          {(isConnecting || isQR) && (
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="mkt-btn"
              style={{ flex: '1 1 auto' }}
            >
              <RefreshCw size={14} />
              Refresh Status
            </button>
          )}

          {isConnected && (
            <button
              onClick={handleDisconnect}
              className="mkt-btn mkt-btn-danger"
              style={{ flex: '1 1 auto' }}
            >
              <LogOut size={14} />
              Disconnect
            </button>
          )}

          {!isDisconnected && !isConnected && (
            <button
              onClick={handleDisconnect}
              className="mkt-btn"
              style={{ flex: '0 0 auto', opacity: 0.6 }}
            >
              <LogOut size={14} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── QR Code panel ── */}
      {isQR && qrDataUrl && (
        <div className="mkt-panel" style={{ marginBottom: '16px', textAlign: 'center' }}>
          <div className="mkt-panel-kicker" style={{ marginBottom: '6px' }}>Scan with WhatsApp</div>
          <h3 className="mkt-panel-title" style={{ marginBottom: '4px' }}>
            Open WhatsApp → Linked Devices → Link a Device
          </h3>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>
            Point your camera at the QR below. It refreshes automatically.
          </p>

          {/* QR frame */}
          <div style={{
            display: 'inline-block',
            background: '#fff',
            borderRadius: '16px',
            padding: '16px',
            boxShadow: '0 0 40px rgba(52,211,153,0.15)',
            border: '2px solid rgba(52,211,153,0.3)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="WhatsApp QR Code"
              style={{ display: 'block', width: '260px', height: '260px', borderRadius: '8px' }}
            />
          </div>

          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '14px' }}>
            QR code auto-refreshes every ~20 seconds
          </p>
        </div>
      )}

      {/* ── Connecting state ── */}
      {isConnecting && !isQR && (
        <div className="mkt-panel" style={{ marginBottom: '16px', textAlign: 'center', padding: '32px 20px' }}>
          <Loader2 size={36} className="animate-spin" style={{ color: '#34d399', marginBottom: '12px' }} />
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', margin: 0 }}>
            Initialising connection... QR code will appear shortly.
          </p>
        </div>
      )}

      {/* ── Connected — test message ── */}
      {isConnected && (
        <div className="mkt-panel">
          <div className="mkt-panel-kicker">Test the connection</div>
          <h3 className="mkt-panel-title" style={{ marginBottom: '12px' }}>Send a Test Message</h3>

          <form onSubmit={handleTestSend} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="mkt-input-group" style={{ marginBottom: 0 }}>
              <label className="mkt-label">WhatsApp Number</label>
              <input
                type="tel"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="50688001234 (no + or spaces)"
                className="mkt-input"
              />
            </div>
            <div className="mkt-input-group" style={{ marginBottom: 0 }}>
              <label className="mkt-label">Message</label>
              <textarea
                value={testMsg}
                onChange={e => setTestMsg(e.target.value)}
                placeholder="Hello from Costa Peptides admin…"
                className="mkt-input"
                rows={3}
                style={{ resize: 'vertical', lineHeight: '1.5' }}
              />
            </div>

            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              fontSize: '12px', color: 'rgba(255,255,255,0.55)',
              cursor: 'pointer', lineHeight: '1.5',
            }}>
              <input
                type="checkbox"
                checked={allowCold}
                onChange={e => setAllowCold(e.target.checked)}
                style={{ marginTop: '2px', accentColor: '#fbbf24' }}
              />
              <span>
                <strong style={{ color: '#fbbf24' }}>Allow new number</strong> — this contact has never
                messaged us. The safer flow is to ask them to open WhatsApp from the website and send
                any message first. No numeric code is needed.
              </span>
            </label>

            {testResult && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: testResult.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
                border: `1px solid ${testResult.ok ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '13px', color: testResult.ok ? '#6ee7b7' : '#fca5a5',
              }}>
                {testResult.ok
                  ? <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                  : <AlertTriangle size={14} style={{ flexShrink: 0 }} />}
                {testResult.text}
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !testPhone || !testMsg}
              className="mkt-btn mkt-btn-primary"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
              Send Test Message
            </button>
          </form>
        </div>
      )}

      {/* ── Info when disconnected ── */}
      {isDisconnected && !error && !loading && (
        <div className="mkt-empty-state" style={{ marginTop: 0 }}>
          <MessageCircle size={36} />
          <h4>No WhatsApp device connected</h4>
          <p>Click <strong>Connect &amp; Get QR</strong> above, then scan<br />with any WhatsApp number to get started.</p>
        </div>
      )}
    </div>
  );
}
