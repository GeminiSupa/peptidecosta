'use client';

/**
 * The affiliate dashboard.
 *
 * Deliberately its own page rather than four more tabs inside /admin. An
 * affiliate is an outside partner, and /admin is 8,000 lines of staff tooling
 * — loading all of it to show somebody their own commission would put the
 * whole thing one bug away from being reachable. Nothing here imports an admin
 * component.
 *
 * Every number on this screen comes from /api/affiliate/*, which works out who
 * the caller is from their login. This page never sends an affiliate id, so
 * there is nothing here to tamper with.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { formatCrDate } from '@/lib/crTime.mjs';

const TABS = [
  { id: 'my_links', label: 'My Link & QR' },
  { id: 'my_sales', label: 'My Orders' },
  { id: 'my_payouts', label: 'My Payouts' },
  { id: 'my_account', label: 'My Details' },
];

const COLORS = {
  bg: '#0f172a',
  panel: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#38bdf8',
  good: '#4ade80',
  warn: '#fbbf24',
  bad: '#f87171',
};

const money = (value, currency) => {
  const amount = Number(value || 0);
  if (!amount) return currency === 'CRC' ? '₡0' : '$0';
  return currency === 'CRC'
    ? `₡${Math.round(amount).toLocaleString('en-US')}`
    : `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** An order shows in whichever currency it was actually taken in. */
const orderTotal = (order) => (String(order.currency || '').toUpperCase() === 'CRC'
  ? money(order.total_crc, 'CRC')
  : money(order.total_usd, 'USD'));

const itemsText = (items) => {
  if (!items) return '—';
  const list = Array.isArray(items) ? items : (() => {
    try { return JSON.parse(items); } catch { return null; }
  })();
  if (!Array.isArray(list) || list.length === 0) return '—';
  return list
    .map((item) => {
      const name = item?.name || item?.product || item?.title || 'Item';
      const qty = Number(item?.qty || item?.quantity || 0);
      return qty > 1 ? `${name} ×${qty}` : name;
    })
    .join(', ');
};

const statusColor = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'approved' || value === 'paid') return COLORS.good;
  if (value === 'rejected') return COLORS.bad;
  return COLORS.warn;
};

export default function AffiliateDashboard() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [me, setMe] = useState(null);
  const [orders, setOrders] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState('my_links');
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setCheckingSession(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session || null);
      setCheckingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next || null);
    });
    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [meRes, ordersRes, payoutsRes] = await Promise.all([
        adminFetch('/api/affiliate/me'),
        adminFetch('/api/affiliate/orders'),
        adminFetch('/api/affiliate/payouts'),
      ]);

      if (meRes.status === 403) {
        const body = await meRes.json().catch(() => ({}));
        setLoadError(body.error || 'This login cannot open the affiliate dashboard.');
        return;
      }
      if (!meRes.ok) throw new Error('Could not load your account');

      setMe(await meRes.json());
      setOrders(ordersRes.ok ? (await ordersRes.json()).orders || [] : []);
      setPayouts(payoutsRes.ok ? (await payoutsRes.json()).payouts || [] : []);
    } catch (err) {
      setLoadError(err.message || 'Something went wrong loading your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  useEffect(() => {
    if (!me?.link) { setQr(''); return; }
    QRCode.toDataURL(me.link, { width: 640, margin: 1 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [me?.link]);

  const totals = useMemo(() => {
    let pendingUsd = 0;
    let approvedUsd = 0;
    for (const payout of payouts) {
      if (String(payout.status).toLowerCase() === 'pending') pendingUsd += Number(payout.usdCommission || 0);
      else if (String(payout.status).toLowerCase() === 'approved') approvedUsd += Number(payout.usdCommission || 0);
    }
    return { pendingUsd, approvedUsd, orderCount: orders.length };
  }, [payouts, orders]);

  if (checkingSession) return <Shell><p style={{ color: COLORS.muted }}>Loading…</p></Shell>;
  if (!session) return <SignIn onDone={setSession} />;

  if (loadError) {
    return (
      <Shell>
        <div style={panel}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>We could not open your dashboard</h2>
          <p style={{ color: COLORS.muted, margin: '0 0 16px', lineHeight: 1.6 }}>{loadError}</p>
          <button style={ghostButton} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem' }}>{me?.affiliate?.name || 'My affiliate account'}</h1>
          <p style={{ margin: '4px 0 0', color: COLORS.muted, fontSize: '0.85rem' }}>
            {me ? `${Math.round(Number(me.affiliate.commissionRate || 0) * 100)}% commission` : ''}
            {me?.access === 'read' ? ' · view only' : ''}
          </p>
        </div>
        <button style={ghostButton} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Stat label="Orders with your code" value={totals.orderCount} />
        <Stat label="Waiting for approval" value={money(totals.pendingUsd, 'USD')} tone={COLORS.warn} />
        <Stat label="Approved" value={money(totals.approvedUsd, 'USD')} tone={COLORS.good} />
      </div>

      <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              ...ghostButton,
              background: tab === item.id ? COLORS.accent : 'transparent',
              color: tab === item.id ? '#0f172a' : COLORS.text,
              borderColor: tab === item.id ? COLORS.accent : COLORS.border,
              fontWeight: tab === item.id ? 700 : 500,
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading && <p style={{ color: COLORS.muted }}>Loading…</p>}

      {tab === 'my_links' && <LinksTab me={me} qr={qr} />}
      {tab === 'my_sales' && <OrdersTab orders={orders} />}
      {tab === 'my_payouts' && <PayoutsTab payouts={payouts} />}
      {tab === 'my_account' && <AccountTab me={me} onSaved={load} />}
    </Shell>
  );
}

/* ---------------------------------------------------------------- tabs -- */

function LinksTab({ me, qr }) {
  const [copied, setCopied] = useState(false);
  if (!me) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(me.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy your link:', me.link);
    }
  };

  const active = (me.codes || []).filter((code) => code.is_active);

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <div style={panel}>
        <h3 style={h3}>Your link</h3>
        <p style={{ ...muted, wordBreak: 'break-all', marginBottom: 12 }}>{me.link}</p>
        <button style={primaryButton} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
        <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>
          Share this anywhere. Orders placed through it are credited to you automatically.
        </p>
      </div>

      <div style={panel}>
        <h3 style={h3}>Your QR code</h3>
        {qr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Your referral QR code" style={{ width: '100%', maxWidth: 220, background: '#fff', padding: 8, borderRadius: 8 }} />
            <a href={qr} download="my-affiliate-qr.png" style={{ ...primaryButton, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
              Download QR
            </a>
          </>
        ) : <p style={muted}>Preparing your QR code…</p>}
      </div>

      <div style={panel}>
        <h3 style={h3}>Your discount code{active.length === 1 ? '' : 's'}</h3>
        {active.length === 0 ? (
          <p style={muted}>You do not have a discount code yet. Your link still credits you for every order.</p>
        ) : active.map((code) => (
          <div key={code.code} style={{ marginBottom: 10 }}>
            <strong style={{ fontSize: '1.1rem', letterSpacing: 1 }}>{code.code}</strong>
            <span style={{ ...muted, marginLeft: 8 }}>{Number(code.discount_pct || 0)}% off for your customer</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrdersTab({ orders }) {
  if (orders.length === 0) {
    return <div style={panel}><p style={muted}>No orders have been placed with your code yet.</p></div>;
  }
  return (
    <div style={{ ...panel, overflowX: 'auto' }}>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Order</th>
            <th style={th}>Date</th>
            <th style={th}>Customer</th>
            <th style={th}>Products</th>
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
            <th style={{ ...th, textAlign: 'right' }}>Your commission</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td style={td}>{order.order_number || '—'}</td>
              <td style={td}>{order.created_at ? formatCrDate(order.created_at) : '—'}</td>
              <td style={td}>{order.customer_name || '—'}</td>
              <td style={{ ...td, color: COLORS.muted, maxWidth: 260 }}>{itemsText(order.items)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{orderTotal(order)}</td>
              <td style={{ ...td, textAlign: 'right', color: COLORS.good }}>
                {Number(order.affiliate_commission_usd) > 0
                  ? money(order.affiliate_commission_usd, 'USD')
                  : money(order.affiliate_commission_crc, 'CRC')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayoutsTab({ payouts }) {
  if (payouts.length === 0) {
    return <div style={panel}><p style={muted}>You have no payouts yet. They appear here once a period is worked out.</p></div>;
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {payouts.map((payout) => (
        <div key={payout.id} style={panel}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <strong>{formatCrDate(payout.startDate)} – {formatCrDate(payout.endDate)}</strong>
              <span style={{ ...muted, marginLeft: 10, color: statusColor(payout.status) }}>{payout.status}</span>
            </div>
            <strong style={{ fontSize: '1.15rem', color: COLORS.good }}>
              {Number(payout.usdCommission) > 0
                ? money(payout.usdCommission, 'USD')
                : money(payout.crcCommission, 'CRC')}
            </strong>
          </div>
          {payout.orders.length > 0 && (
            <table style={{ ...table, marginTop: 12 }}>
              <thead>
                <tr>
                  <th style={th}>Order</th>
                  <th style={th}>Customer</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {payout.orders.map((order, index) => (
                  <tr key={`${payout.id}-${order.orderNumber || index}`}>
                    <td style={td}>{order.orderNumber || '—'}</td>
                    <td style={td}>{order.customerName || '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {String(order.currency || '').toUpperCase() === 'CRC'
                        ? money(order.totalCrc, 'CRC')
                        : money(order.totalUsd, 'USD')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

function AccountTab({ me, onSaved }) {
  const [whatsapp, setWhatsapp] = useState(me?.affiliate?.whatsapp || '');
  const [email, setEmail] = useState(me?.affiliate?.email || '');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWhatsapp(me?.affiliate?.whatsapp || '');
    setEmail(me?.affiliate?.email || '');
  }, [me]);

  if (!me) return null;
  const readOnly = me.access !== 'read_write';
  const pendingEmail = (me.pendingChanges || []).find((row) => row.field === 'email');

  const save = async () => {
    setSaving(true);
    setStatus('');
    try {
      const res = await adminFetch('/api/affiliate/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp, email }),
      });
      const body = await res.json().catch(() => ({}));
      setStatus(res.ok ? (body.message || 'Saved.') : (body.error || 'Could not save.'));
      if (res.ok) onSaved();
    } catch {
      setStatus('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...panel, maxWidth: 520 }}>
      <h3 style={h3}>Your details</h3>

      <label style={label}>WhatsApp number</label>
      <input style={input} value={whatsapp} disabled={readOnly} onChange={(e) => setWhatsapp(e.target.value)} />

      <label style={{ ...label, marginTop: 14 }}>Email</label>
      <input style={input} value={email} disabled={readOnly} onChange={(e) => setEmail(e.target.value)} />
      <p style={{ ...muted, marginTop: 6 }}>
        Your email is how you sign in and where payout notices go, so a change has to be approved by us first.
        Your current address keeps working until then.
      </p>
      {pendingEmail && (
        <p style={{ ...muted, color: COLORS.warn }}>
          Waiting for approval: {pendingEmail.requested_value}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={label}>Commission rate</label>
        <p style={{ ...muted, margin: '4px 0 0' }}>
          {Math.round(Number(me.affiliate.commissionRate || 0) * 100)}% — set by us. Talk to us if you think it is wrong.
        </p>
      </div>

      {readOnly ? (
        <p style={{ ...muted, marginTop: 16 }}>Your account is view-only. Message us and we will update your details.</p>
      ) : (
        <button style={{ ...primaryButton, marginTop: 18 }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
      {status && <p style={{ ...muted, marginTop: 10, color: COLORS.text }}>{status}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- sign in -- */

function SignIn({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError('That email and password did not match. Try again.');
      setBusy(false);
      return;
    }
    onDone(data.session);
  };

  return (
    <Shell>
      <form onSubmit={submit} style={{ ...panel, maxWidth: 380, margin: '8vh auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.2rem' }}>Affiliate sign in</h1>
        <p style={{ ...muted, marginTop: 0 }}>Your link, your orders and your payouts.</p>

        <label style={label}>Email</label>
        <input style={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label style={{ ...label, marginTop: 12 }}>Password</label>
        <input style={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p style={{ color: COLORS.bad, fontSize: '0.85rem', marginTop: 10 }}>{error}</p>}

        <button style={{ ...primaryButton, marginTop: 16, width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Shell>
  );
}

/* ---------------------------------------------------------------- bits -- */

function Shell({ children }) {
  return (
    <main style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, padding: '24px 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
    </main>
  );
}

function Stat({ label: text, value, tone }) {
  return (
    <div style={{ ...panel, padding: 14 }}>
      <div style={{ ...muted, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.6 }}>{text}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4, color: tone || COLORS.text }}>{value}</div>
    </div>
  );
}

const panel = { background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 18 };
const h3 = { margin: '0 0 12px', fontSize: '0.95rem', color: COLORS.accent };
const muted = { color: COLORS.muted, fontSize: '0.85rem', lineHeight: 1.6 };
const label = { display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.6, color: COLORS.muted, marginBottom: 6 };
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: '#0b1220', color: COLORS.text, fontSize: '0.95rem' };
const primaryButton = { padding: '10px 16px', borderRadius: 8, border: 'none', background: COLORS.accent, color: '#0f172a', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' };
const ghostButton = { padding: '8px 14px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: 'transparent', color: COLORS.text, cursor: 'pointer', fontSize: '0.85rem' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${COLORS.border}`, color: COLORS.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: '10px', borderBottom: `1px solid ${COLORS.border}` };
