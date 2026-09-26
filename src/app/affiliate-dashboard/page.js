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

/**
 * Near-monochrome on purpose. Colour is reserved for the two things a partner
 * is actually here to read — money that is settled (green) and money that is
 * still waiting (amber). Everything else is greys, so those two stand out.
 */
const COLORS = {
  bg: '#0b1120',
  panel: '#151d2e',
  panelRaised: '#1c2438',
  border: '#2a3348',
  text: '#e8ecf4',
  muted: '#93a0b5',
  good: '#4ade80',
  warn: '#f0b429',
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
          <button className="aff-press" style={ghostButton} onClick={() => supabase.auth.signOut()}>Sign out</button>
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
        <button className="aff-press" style={ghostButton} onClick={() => supabase.auth.signOut()}>Sign out</button>
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
            className="aff-press"
            onClick={() => setTab(item.id)}
            style={{
              ...ghostButton,
              background: tab === item.id ? COLORS.panelRaised : 'transparent',
              color: tab === item.id ? COLORS.text : COLORS.muted,
              borderColor: tab === item.id ? COLORS.text : COLORS.border,
              fontWeight: tab === item.id ? 700 : 500,
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Only before there is anything to show. A refresh after the first load
          used to print "Loading…" above content that was already on screen. */}
      {loading && !me && <p style={{ color: COLORS.muted }}>Loading…</p>}

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

  // The short one is what they hand out. The long one is kept visible but out
  // of the way, because a partner who has printed the old link on something
  // needs to be able to see it is the same link.
  const shareLink = me.shortLink || me.link;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy your link:', shareLink);
    }
  };

  const active = (me.codes || []).filter((code) => code.is_active);

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <div style={panel}>
        <h3 style={h3}>Your link</h3>
        <p style={{
          margin: '0 0 12px', fontSize: '1rem', fontWeight: 600, wordBreak: 'break-all',
          padding: '10px 12px', borderRadius: 8, background: COLORS.panelRaised,
          border: `1px solid ${COLORS.border}`,
        }}>
          {shareLink}
        </p>
        <button className="aff-press" style={primaryButton} onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>
          Share this anywhere. Orders placed through it are credited to you automatically.
        </p>
        {me.shortLink && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ ...muted, cursor: 'pointer' }}>The full version of this link</summary>
            <p style={{ ...muted, wordBreak: 'break-all', marginTop: 8, marginBottom: 0 }}>{me.link}</p>
          </details>
        )}
      </div>

      <div style={panel}>
        <h3 style={h3}>Your QR code</h3>
        {qr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Your referral QR code" style={{ width: '100%', maxWidth: 220, background: '#fff', padding: 8, borderRadius: 8 }} />
            <a className="aff-press" href={qr} download="my-affiliate-qr.png" style={{ ...primaryButton, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
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
  const [confirming, setConfirming] = useState(null);

  useEffect(() => {
    setWhatsapp(me?.affiliate?.whatsapp || '');
    setEmail(me?.affiliate?.email || '');
  }, [me]);

  if (!me) return null;
  const readOnly = me.access !== 'read_write';
  const pendingEmail = (me.pendingChanges || []).find((row) => row.field === 'email');

  const emailChanged = email.trim().toLowerCase() !== String(me.affiliate.email || '').trim().toLowerCase();

  const send = async (payload, method = 'PATCH') => {
    setSaving(true);
    setStatus('');
    try {
      const res = await adminFetch('/api/affiliate/account', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      setStatus(res.ok ? (body.message || 'Saved.') : (body.error || 'Could not save.'));
      if (res.ok) onSaved();
    } catch {
      setStatus('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
      setConfirming(null);
    }
  };

  // An email change is the one action here with a consequence worth stopping
  // for, so it asks first. Changing only the WhatsApp number does not.
  const save = () => {
    if (emailChanged) { setConfirming('email'); return; }
    send({ whatsapp });
  };

  return (
    <div style={{ ...panel, maxWidth: 520 }}>
      <h3 style={h3}>Your details</h3>

      <label style={label}>WhatsApp number</label>
      <input style={input} value={whatsapp} disabled={readOnly} onChange={(e) => setWhatsapp(e.target.value)} />

      <label style={{ ...label, marginTop: 14 }}>Email</label>
      <input style={input} value={email} disabled={readOnly} onChange={(e) => setEmail(e.target.value)} />
      <p style={{ ...muted, marginTop: 6 }}>
        This is the address you sign in with, and the one Peptides Costa Rica sends your
        payout notices to. Changing it has to be checked by Peptides Costa Rica first.
      </p>

      {/* The old version of this said only "Waiting for approval: x@y.com", which
          answered none of the three questions somebody actually has: what did I
          ask for, what is happening now, and which address am I using meanwhile. */}
      {pendingEmail && (
        <div style={pendingBox}>
          <strong style={{ display: 'block', marginBottom: 6, color: COLORS.warn, fontSize: '0.85rem' }}>
            Your email change has not happened yet
          </strong>
          <p style={{ margin: '0 0 6px', fontSize: '0.85rem', lineHeight: 1.6 }}>
            You asked to change it to <strong>{pendingEmail.requested_value}</strong>.
            Peptides Costa Rica has to approve that before it takes effect, because your
            payouts are announced to this address.
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6 }}>
            Until then nothing has changed — keep signing in with{' '}
            <strong>{me.affiliate.email}</strong>.
          </p>
          {!readOnly && (
            <button
              className="aff-press"
              style={{ ...ghostButton, marginTop: 12, borderColor: `${COLORS.warn}88`, color: COLORS.warn }}
              disabled={saving}
              onClick={() => setConfirming('withdraw')}
            >
              Withdraw this request
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={label}>Commission rate</label>
        <p style={{ ...muted, margin: '4px 0 0' }}>
          {Math.round(Number(me.affiliate.commissionRate || 0) * 100)}% — set by Peptides Costa Rica.
          Get in touch if you think it is wrong.
        </p>
      </div>

      {readOnly ? (
        <p style={{ ...muted, marginTop: 16 }}>
          Your account is view-only, so these cannot be edited here. Contact Peptides Costa
          Rica and they will update them for you.
        </p>
      ) : (
        <button className="aff-press" style={{ ...primaryButton, marginTop: 18 }} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
      {status && <p style={{ ...muted, marginTop: 10, color: COLORS.text }}>{status}</p>}

      <Modal
        open={confirming === 'email'}
        title="Ask to change your email?"
        confirmLabel="Send the request"
        busy={saving}
        onCancel={() => setConfirming(null)}
        onConfirm={() => send({ whatsapp, email })}
      >
        <p style={{ margin: '0 0 10px' }}>
          You are asking to move from <strong>{me.affiliate.email}</strong> to{' '}
          <strong>{email.trim()}</strong>.
        </p>
        <p style={{ margin: 0 }}>
          Nothing changes today. Peptides Costa Rica has to approve it first, because this is
          the address your payouts are announced to. Keep signing in with your current address
          until they do.
        </p>
      </Modal>

      <Modal
        open={confirming === 'withdraw'}
        title="Withdraw your email change?"
        confirmLabel="Yes, withdraw it"
        confirmTone={COLORS.warn}
        busy={saving}
        onCancel={() => setConfirming(null)}
        onConfirm={() => send(null, 'DELETE')}
      >
        <p style={{ margin: 0 }}>
          Your request to change to <strong>{pendingEmail?.requested_value}</strong> will be
          taken back, and Peptides Costa Rica will not see it. Your email stays as it is. You
          can ask again whenever you like.
        </p>
      </Modal>
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

        <button className="aff-press" style={{ ...primaryButton, marginTop: 16, width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Shell>
  );
}

/* ---------------------------------------------------------------- bits -- */

/**
 * A real dialog, not window.confirm.
 *
 * The browser's own box cannot be styled, says "localhost:3000 says", and on a
 * phone looks like a scam warning — not what you want on the screen where
 * somebody is changing the address their money is announced to. This one
 * closes on Escape and on a click outside, and traps nothing it does not need
 * to.
 */
function Modal({ open, title, children, confirmLabel, confirmTone, onConfirm, onCancel, busy }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(3,7,18,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'affFade 140ms ease-out',
      }}
    >
      <div style={{
        ...panel, maxWidth: 430, width: '100%', background: COLORS.panelRaised,
        animation: 'affRise 160ms cubic-bezier(0.2, 0.8, 0.3, 1)',
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
        <div style={{ ...muted, color: COLORS.text }}>{children}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="aff-press" style={ghostButton} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="aff-press"
            style={{
              ...primaryButton,
              borderColor: confirmTone || COLORS.text,
              color: confirmTone || COLORS.text,
            }}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <main style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, padding: '24px 16px', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <style>{`
        @keyframes affFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes affRise { from { opacity: 0; transform: translateY(10px) scale(0.98) } to { opacity: 1; transform: none } }
        /* The press itself, so a tap feels answered even before the request
           comes back. Disabled while busy so it cannot look clickable twice. */
        .aff-press { transition: transform 90ms ease, filter 90ms ease; }
        .aff-press:hover:not(:disabled) { filter: brightness(1.15); }
        .aff-press:active:not(:disabled) { transform: scale(0.96); }
        .aff-press:disabled { opacity: 0.55; cursor: default; }
        @media (prefers-reduced-motion: reduce) {
          .aff-press { transition: none }
          .aff-press:active:not(:disabled) { transform: none }
        }
      `}</style>
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
const h3 = { margin: '0 0 12px', fontSize: '0.95rem', color: COLORS.text, fontWeight: 700 };
const muted = { color: COLORS.muted, fontSize: '0.85rem', lineHeight: 1.6 };
const label = { display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.6, color: COLORS.muted, marginBottom: 6 };
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: '#0b1220', color: COLORS.text, fontSize: '0.95rem' };
const primaryButton = { padding: '10px 16px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: COLORS.panelRaised, color: COLORS.text, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' };
const ghostButton = { padding: '8px 14px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: 'transparent', color: COLORS.text, cursor: 'pointer', fontSize: '0.85rem' };
const pendingBox = { marginTop: 10, padding: '12px 14px', borderRadius: 8, border: `1px solid ${COLORS.warn}55`, background: 'rgba(240,180,41,0.07)', color: COLORS.text };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${COLORS.border}`, color: COLORS.muted, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 };
const td = { padding: '10px', borderBottom: `1px solid ${COLORS.border}` };
