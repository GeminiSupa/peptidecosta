'use client';

/**
 * The one refund confirmation.
 *
 * Refunding is reached from two places — picking "Refunded" in the orders list,
 * and the button on the order's own panel — and both open this. An earlier pass
 * had the dropdown write the status directly while a separate box did the real
 * work, which meant two ways to refund an order and only one of them worked.
 *
 * A status cannot be a refund on its own: the amount has to be checked against
 * what the customer actually paid, four people have to be told, and the agent's
 * commission has to follow the money. So the dropdown opens this instead of
 * saving, and this calls the refund route. The server re-checks every number
 * here; nothing below is the authority.
 *
 * Full or partial is asked FIRST, before anything else, because the two are not
 * the same job. A full refund reverses the order and every bottle goes back on
 * the shelf. A partial one leaves the customer holding most of what they
 * bought, so it has to ask how much came off and which bottles — if any —
 * actually came back. Offering one form for both is what previously returned
 * five bottles to stock when one had been sent back.
 */

import { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { formatAmount, refundEmailMessage, refundableRemaining } from '@/lib/orderRefund.mjs';
import { restockableRemaining } from '@/lib/inventoryRestore.mjs';
import { normalizeAdminOrderCurrency } from '@/lib/adminOrderTotals.mjs';

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 4000, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: '16px',
  background: 'rgba(2, 6, 23, 0.72)',
};
const panelStyle = {
  width: '100%', maxWidth: '440px', background: '#0f172a',
  border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '14px',
  padding: '20px', color: '#e2e8f0', maxHeight: '90vh', overflowY: 'auto',
};
const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: '8px',
  border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.9)',
  color: '#e2e8f0', fontSize: '0.9rem',
};
const labelStyle = {
  display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px',
};

export default function RefundDialog({ order, onClose, onRefunded }) {
  const currency = normalizeAdminOrderCurrency(order?.currency);
  const remaining = order ? refundableRemaining(order) : { usd: 0, crc: 0 };
  const maxRefund = currency === 'CRC' ? remaining.crc : remaining.usd;
  const alreadyRefunded = currency === 'CRC'
    ? Number(order?.refunded_amount_crc || 0)
    : Number(order?.refunded_amount_usd || 0);

  // null until the first question is answered, so neither form can be filled
  // in before it is clear which one applies.
  const [kind, setKind] = useState(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [restoreStock, setRestoreStock] = useState(true);
  // product -> quantity coming back, as typed. Empty means none.
  const [restock, setRestock] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // What this order can still give back: the quantities bought, minus anything
  // an earlier partial refund already returned.
  const returnable = useMemo(() => (order ? restockableRemaining(order) : []), [order]);

  useEffect(() => {
    setKind(null);
    setAmount('');
    setReason('');
    setRestoreStock(true);
    setRestock({});
    setError('');
  }, [order?.id]);

  if (!order) return null;

  const isFull = kind === 'full';
  const value = isFull ? maxRefund : Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= maxRefund + 0.01;

  const restockLines = Object.entries(restock)
    .map(([product, qty]) => ({ product, qty: Math.floor(Number(qty)) }))
    .filter((line) => Number.isFinite(line.qty) && line.qty > 0);

  const setRestockQty = (product, raw, max) => {
    const qty = Math.max(0, Math.min(Math.floor(Number(raw) || 0), max));
    setRestock((current) => ({ ...current, [product]: qty ? String(qty) : '' }));
  };

  const submit = async () => {
    if (!valid) {
      setError(`Enter an amount between 0 and ${formatAmount(maxRefund, currency)}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/orders/refund', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          amount: value,
          reason,
          // Whole-order restore belongs to a full refund only.
          restoreStock: isFull && restoreStock,
          // Named bottles belong to a partial one only.
          restockItems: isFull ? [] : restockLines,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not record the refund');

      // Built in the shared lib so "nobody to email" cannot be reported as a
      // failure — the customer having no address is a phone call to make, not a
      // fault to chase.
      onRefunded?.(data, refundEmailMessage(data.emails));
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <>
      <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem', color: '#fca5a5' }}>
        Refund order {order.order_number}
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: '#94a3b8' }}>
        {order.customer_name || 'Customer'} paid{' '}
        {formatAmount(currency === 'CRC' ? order.total_crc : order.total_usd, currency)}.
        {alreadyRefunded > 0 && ` ${formatAmount(alreadyRefunded, currency)} has already been refunded, leaving ${formatAmount(maxRefund, currency)}.`}
      </p>
    </>
  );

  // ---- question one: which kind of refund is this? -------------------------
  if (kind === null) {
    return (
      <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
          {header}

          <button
            type="button"
            onClick={() => { setKind('full'); setAmount(String(maxRefund || '')); }}
            style={{
              width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: '10px',
              borderRadius: '10px', border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.10)', color: '#e2e8f0', cursor: 'pointer',
            }}
          >
            <strong style={{ display: 'block', fontSize: '0.92rem' }}>Full refund</strong>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Give back all {formatAmount(maxRefund, currency)}. The whole order can go back into stock.
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setKind('partial'); setAmount(''); }}
            style={{
              width: '100%', textAlign: 'left', padding: '12px 14px',
              borderRadius: '10px', border: '1px solid rgba(148,163,184,0.3)',
              background: 'rgba(15,23,42,0.9)', color: '#e2e8f0', cursor: 'pointer',
            }}
          >
            <strong style={{ display: 'block', fontSize: '0.92rem' }}>Partial refund</strong>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              Give back part of it. You choose the amount, and which bottles came back.
            </span>
          </button>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- the form for whichever kind was chosen ------------------------------
  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose?.(); }}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {header}

        <div style={{
          fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '14px',
          padding: '8px 10px', borderRadius: '8px', background: 'rgba(148,163,184,0.10)',
        }}>
          {isFull ? 'Full refund' : 'Partial refund'}
          {' — '}
          <button
            type="button"
            onClick={() => setKind(null)}
            disabled={saving}
            style={{ background: 'none', border: 'none', padding: 0, color: '#7dd3fc', cursor: 'pointer', fontSize: '0.78rem' }}
          >
            change
          </button>
        </div>

        <label style={labelStyle}>Amount to refund ({currency})</label>
        {isFull ? (
          <div style={{ ...inputStyle, background: 'rgba(148,163,184,0.10)' }}>
            {formatAmount(maxRefund, currency)}
          </div>
        ) : (
          <input
            type="number" step="0.01" min="0" max={maxRefund} style={inputStyle}
            value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
            placeholder={`Up to ${formatAmount(maxRefund, currency)}`}
          />
        )}
        {!isFull && (
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '6px 0 14px' }}>
            Most you can refund: {formatAmount(maxRefund, currency)}.
            {valid && ` The customer keeps ${formatAmount(maxRefund - value, currency)}.`}
          </div>
        )}

        <label style={{ ...labelStyle, marginTop: isFull ? '14px' : 0 }}>Reason</label>
        <input
          type="text" style={inputStyle} maxLength={200} value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Shown to the team and the accountant"
        />

        {/* Stock. A full refund reverses the order, so the whole thing goes
            back at once. A partial one has to name what actually came back —
            returning everything would put bottles on the shelf that the
            customer is still holding. */}
        {isFull ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0', fontSize: '0.8rem', color: '#cbd5e1' }}>
            <input type="checkbox" checked={restoreStock} onChange={(e) => setRestoreStock(e.target.checked)} />
            Put the stock back (untick if the customer keeps the product)
          </label>
        ) : (
          <div style={{ margin: '14px 0' }}>
            <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '6px' }}>
              Which bottles came back? <span style={{ color: '#64748b' }}>(optional — leave at 0 if the customer keeps them)</span>
            </div>
            {returnable.length === 0 ? (
              <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                Nothing left on this order can go back into stock.
              </div>
            ) : returnable.map((line) => (
              <div key={line.product} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ flex: 1, fontSize: '0.78rem', color: '#e2e8f0' }}>
                  {line.product}
                  <span style={{ color: '#64748b' }}> · {line.qty} bought</span>
                </span>
                <input
                  type="number" min="0" max={line.qty} step="1"
                  value={restock[line.product] || ''}
                  onChange={(e) => setRestockQty(line.product, e.target.value, line.qty)}
                  placeholder="0"
                  style={{ ...inputStyle, width: '72px', padding: '5px 8px', textAlign: 'center' }}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '8px', padding: '10px 12px', fontSize: '0.78rem', color: '#fca5a5',
          marginBottom: '14px',
        }}>
          This emails the customer, the team, the assigned agent and the accountant,
          and adjusts the agent&apos;s commission. <strong>You still have to send the
          money back yourself in Shield Hub Pay.</strong>
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '12px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button" className="admin-btn" onClick={submit} disabled={saving || !valid}
            style={{ background: '#dc2626', borderColor: '#dc2626', opacity: (saving || !valid) ? 0.6 : 1 }}
          >
            {saving ? 'Recording...' : `Refund ${valid ? formatAmount(value, currency) : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
