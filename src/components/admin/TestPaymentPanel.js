'use client';

import React, { useState } from 'react';
import { FlaskConical, Loader2, Trash2, Zap, CreditCard } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

// Superadmin-only sandbox payment tester. Every charge here goes to the Shield
// Hub Pay SANDBOX account — no real money moves. Orders are TEST- prefixed and
// payment_method 'card-test', and the burst button exists to demonstrate the
// atomic double-charge lock: 5 concurrent attempts must yield exactly 1 charge.

const panelStyle = { background: 'var(--admin-card-bg, rgba(255,255,255,0.04))', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '12px', padding: '20px', marginBottom: '16px' };
const labelStyle = { display: 'block', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', opacity: 0.7, marginBottom: '6px' };
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(0,0,0,0.15)', color: 'inherit', fontSize: '0.9rem' };
const btnStyle = { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(148,163,184,0.12)', color: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' };

export default function TestPaymentPanel() {
  const [amount, setAmount] = useState('1.00');
  const [card, setCard] = useState({ holder: 'Test Admin', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
  // Sandbox orders are USD, which would otherwise always produce the English
  // receipt. Most customers read the Spanish one, so it is the default here.
  const [receiptLang, setReceiptLang] = useState('es');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);

  const addLog = (entry) => setLog((prev) => [{ time: new Date().toLocaleTimeString(), ...entry }, ...prev].slice(0, 40));

  const createOrder = async () => {
    const res = await adminFetch('/api/admin/test-payment', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', amount: Number(amount) || 1 }),
    });
    const data = await res.json();
    if (!res.ok || !data.orderNumber) throw new Error(data.error || 'Could not create test order');
    return data.orderNumber;
  };

  const payOnce = async (orderNumber, { sendReceipt = true } = {}) => {
    const res = await adminFetch('/api/admin/test-payment', {
      method: 'POST',
      // The burst test is about the double-charge lock, not the receipt. Its
      // winning attempt would otherwise mail one on every run.
      body: JSON.stringify({ action: 'pay', orderNumber, card, lang: receiptLang, sendReceipt }),
    });
    const data = await res.json().catch(() => ({}));
    return { httpStatus: res.status, ...data };
  };

  const runSingle = async () => {
    setBusy(true);
    try {
      const orderNumber = await createOrder();
      addLog({ kind: 'info', text: `Created ${orderNumber} for $${Number(amount || 1).toFixed(2)}` });
      const r = await payOnce(orderNumber);
      addLog({
        kind: r.ok ? 'success' : 'fail',
        text: r.ok
          ? `APPROVED — ${orderNumber} (txn ${r.transactionId || '?'})`
          : `${r.status || 'DECLINED'} — ${orderNumber}: ${r.error || 'no detail'}`,
      });
      if (r.receipt) {
        addLog({
          kind: r.receipt.sent ? 'success' : 'fail',
          text: r.receipt.sent
            ? `Customer receipt sent to ${r.receipt.to} — check your inbox for what the buyer sees.`
            : `Customer receipt NOT sent: ${r.receipt.error || r.receipt.skipped || 'unknown reason'}`,
        });
      }
    } catch (err) {
      addLog({ kind: 'fail', text: `Error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const runBurst = async () => {
    setBusy(true);
    try {
      const orderNumber = await createOrder();
      addLog({ kind: 'info', text: `Created ${orderNumber} — firing 5 simultaneous payment attempts...` });
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => payOnce(orderNumber, { sendReceipt: false }).catch((e) => ({ error: e.message }))));
      const approved = results.filter((r) => r.ok).length;
      const blocked = results.filter((r) => r.blocked).length;
      const failed = results.length - approved - blocked;
      results.forEach((r, i) => addLog({
        kind: r.ok ? 'success' : r.blocked ? 'blocked' : 'fail',
        text: `Attempt ${i + 1}: ${r.ok ? 'APPROVED' : r.blocked ? `BLOCKED (${r.reason})` : (r.error || r.status || 'failed')}`,
      }));
      addLog({
        kind: approved <= 1 ? 'success' : 'fail',
        text: approved <= 1
          ? `LOCK VERIFIED: ${approved} charged, ${blocked} blocked, ${failed} failed — the card can never be charged twice.`
          : `LOCK FAILED: ${approved} attempts charged! Investigate immediately.`,
      });
    } catch (err) {
      addLog({ kind: 'fail', text: `Error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const cleanup = async () => {
    if (!confirm('Delete ALL test orders (TEST- prefix)?')) return;
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/test-payment', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cleanup failed');
      addLog({ kind: 'info', text: `Deleted ${data.deleted} test order${data.deleted === 1 ? '' : 's'}.` });
    } catch (err) {
      addLog({ kind: 'fail', text: `Error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const logColor = (kind) => kind === 'success' ? '#34d399' : kind === 'blocked' ? '#fbbf24' : kind === 'fail' ? '#f87171' : 'inherit';

  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ ...panelStyle, borderColor: 'rgba(52,211,153,0.35)' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, opacity: 0.85 }}>
          <FlaskConical size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
          Every payment here hits the Shield Hub Pay <strong>sandbox</strong> — no real money moves, and
          customers are unaffected. Test orders are marked <code>TEST-</code> and can be deleted below.
          Sandbox cards: <code>4242 4242 4242 4242</code> approves; use your gateway&apos;s decline cards
          (e.g. endings <code>4341</code>, <code>4846</code>) to test failures.
          {' '}Each single payment also emails <strong>you</strong> the receipt the customer would get
          for that outcome — approved or declined. Your team is not copied.</p>
        <p style={{ margin: '10px 0 0', fontSize: '0.85rem', lineHeight: 1.6, opacity: 0.85 }}>
          The burst test fires five attempts at once to prove the double-charge lock, and sends no mail.
        </p>
      </div>

      <div style={panelStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Receipt language</label>
            <select style={inputStyle} value={receiptLang} onChange={(e) => setReceiptLang(e.target.value)}>
              <option value="es">Spanish (most customers)</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Amount (USD)</label>
            <input style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label style={labelStyle}>Cardholder</label>
            <input style={inputStyle} value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Card number</label>
            <input style={inputStyle} value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} placeholder="4242 4242 4242 4242" />
          </div>
          <div>
            <label style={labelStyle}>Expiry</label>
            <input style={inputStyle} value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} placeholder="MM/YY" />
          </div>
          <div>
            <label style={labelStyle}>CVV</label>
            <input style={inputStyle} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} placeholder="123" />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button style={btnStyle} onClick={runSingle} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
            Single test payment
          </button>
          <button style={{ ...btnStyle, borderColor: 'rgba(251,191,36,0.4)' }} onClick={runBurst} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            Burst test ×5 (prove the lock)
          </button>
          <button style={{ ...btnStyle, borderColor: 'rgba(248,113,113,0.4)', marginLeft: 'auto' }} onClick={cleanup} disabled={busy}>
            <Trash2 size={15} />
            Delete test orders
          </button>
        </div>
      </div>

      <div style={panelStyle}>
        <label style={labelStyle}>Result log</label>
        {log.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.82rem', opacity: 0.5 }}>No tests run yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'monospace', fontSize: '0.78rem' }}>
            {log.map((entry, i) => (
              <div key={i} style={{ color: logColor(entry.kind) }}>
                <span style={{ opacity: 0.5, marginRight: '8px' }}>{entry.time}</span>
                {entry.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
