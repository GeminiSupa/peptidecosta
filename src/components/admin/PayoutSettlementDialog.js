'use client';

import React, { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/adminApi';

export default function PayoutSettlementDialog({ payout, endpoint, label, onClose, onSaved }) {
  const [form, setForm] = useState({
    status: 'Payment Initiated',
    paymentMethod: '',
    paymentReference: '',
    receiptUrl: '',
    note: '',
    failureReason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!payout) return;
    setForm({
      status: payout.status === 'Failed' ? 'Payment Initiated' : (payout.status === 'Payment Initiated' ? 'Paid' : 'Payment Initiated'),
      paymentMethod: payout.payment_method || '',
      paymentReference: payout.payment_reference || '',
      receiptUrl: payout.payment_receipt_url || '',
      note: payout.payment_note || '',
      failureReason: '',
    });
    setError('');
  }, [payout]);

  if (!payout) return null;

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await adminFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ payoutId: payout.id, ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save payment record');
      onSaved(data.payout);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    }
    setSaving(false);
  };

  return (
    <div className="modal active" onClick={onClose} style={{ zIndex: 260 }}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 520 }}>
        <button type="button" className="close-modal" onClick={onClose}>&times;</button>
        <h2 style={{ marginTop: 0 }}>Record payout settlement</h2>
        <p style={{ color: '#94a3b8', fontSize: '.82rem' }}>{label} · approved payout</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <select className="admin-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="Payment Initiated">Payment initiated</option>
            <option value="Paid">Paid</option>
            <option value="Failed">Payment failed</option>
          </select>
          {form.status !== 'Failed' && (
            <>
              <input className="admin-input" required placeholder="Payment method (bank transfer, SINPE, PayPal…)" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} />
              <input className="admin-input" required={form.status === 'Paid'} placeholder={form.status === 'Paid' ? 'Payment reference *' : 'Payment reference (when available)'} value={form.paymentReference} onChange={(event) => setForm({ ...form, paymentReference: event.target.value })} />
              <input className="admin-input" type="url" placeholder="Receipt URL (optional)" value={form.receiptUrl} onChange={(event) => setForm({ ...form, receiptUrl: event.target.value })} />
            </>
          )}
          {form.status === 'Failed' && (
            <textarea className="admin-input" required rows={3} placeholder="Failure reason *" value={form.failureReason} onChange={(event) => setForm({ ...form, failureReason: event.target.value })} />
          )}
          <textarea className="admin-input" rows={2} placeholder="Internal payment note (optional)" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          {error && <div style={{ color: '#f87171', fontSize: '.82rem' }}>{error}</div>}
          <button className="admin-btn admin-btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : `Save as ${form.status}`}
          </button>
        </form>
      </div>
    </div>
  );
}
