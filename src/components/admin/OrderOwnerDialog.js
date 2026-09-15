'use client';

import React, { useEffect, useState } from 'react';
import { OWNER_REASON_MAX, OWNER_REASON_MIN } from '@/lib/orderOwnership.mjs';

/**
 * Pick a new owner and say why.
 *
 * mode 'request' — staff asking a superadmin to move an order.
 * mode 'assign'  — a superadmin replacing an owner who is already set, which
 *                  needs a reason on the record.
 *
 * onSubmit resolves to { ok, error }; an error stays on screen in the dialog.
 */
export default function OrderOwnerDialog({
  order,
  mode = 'request',
  agents = [],
  initialTarget = '',
  onClose,
  onSubmit,
}) {
  const [target, setTarget] = useState(initialTarget);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTarget(initialTarget);
    setReason('');
    setError('');
  }, [order?.id, initialTarget]);

  if (!order) return null;

  const current = String(order.sales_agent || '').trim();
  const options = agents
    .map((agent) => String(agent || '').trim())
    .filter(Boolean)
    .filter((name) => name.toLowerCase() !== current.toLowerCase());
  const isAssign = mode === 'assign';

  const submit = async (event) => {
    event.preventDefault();
    if (!isAssign && !target) {
      setError('Choose who the order should move to.');
      return;
    }
    if (reason.trim().length < OWNER_REASON_MIN) {
      setError('Write a short reason — a few words is enough.');
      return;
    }
    setSaving(true);
    setError('');
    const result = await onSubmit({ salesAgent: target, reason: reason.trim() });
    setSaving(false);
    if (result?.ok) onClose();
    else setError(result?.error || 'Could not save. Try again.');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-owner-dialog-title"
      onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2, 6, 23, 0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: '440px', background: '#0f172a', color: '#e2e8f0',
          border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '12px', padding: '20px',
          display: 'grid', gap: '12px',
        }}
      >
        <h3 id="order-owner-dialog-title" style={{ margin: 0, fontSize: '1.05rem' }}>
          {isAssign ? 'Change order owner' : 'Request owner change'}
        </h3>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.45 }}>
          Order #{order.order_number || String(order.id).slice(0, 8)} belongs to{' '}
          <strong style={{ color: '#e2e8f0' }}>{current || 'nobody yet'}</strong>.{' '}
          {isAssign
            ? 'Your reason is saved in the order timeline.'
            : 'A superadmin will approve or reject this. Nothing changes until then.'}
        </p>

        <label style={{ display: 'grid', gap: '4px', fontSize: '0.8rem', color: '#cbd5e1' }}>
          Move it to
          <select
            className="admin-select"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={saving}
          >
            <option value="">{isAssign ? 'Unassigned' : 'Choose a person…'}</option>
            {options.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>

        <label style={{ display: 'grid', gap: '4px', fontSize: '0.8rem', color: '#cbd5e1' }}>
          Reason
          <textarea
            className="admin-input"
            rows={3}
            maxLength={OWNER_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={saving}
            placeholder="e.g. I spoke with this customer on WhatsApp before the order was placed"
            style={{ resize: 'vertical' }}
          />
        </label>

        {error && (
          <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: '0.85rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isAssign ? 'Change owner' : 'Send request'}
          </button>
        </div>
      </form>
    </div>
  );
}
