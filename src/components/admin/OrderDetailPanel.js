'use client';

import React, { useState } from 'react';
import { formatActivityType } from '@/lib/orderActivity';
import { adminFetch } from '@/lib/adminApi';

export default function OrderDetailPanel({
  order,
  onClose,
  onUpdated,
  onStatusChange,
  onTrackingChange,
}) {
  const [notes, setNotes] = useState(order.internal_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shippingCrc, setShippingCrc] = useState(order.shipping_cost_crc ?? '');
  const [shippingUsd, setShippingUsd] = useState(order.shipping_cost_usd ?? '');

  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const activity = Array.isArray(order.activity_log) ? order.activity_log : [];
  const itemsSubtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);

  const patchOrder = async (updates, activityEntry) => {
    const res = await adminFetch('/api/admin/orders/update', {
      method: 'PATCH',
      body: JSON.stringify({ orderId: order.id, updates, activity: activityEntry }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');
    onUpdated(data.order);
    return data.order;
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await patchOrder({ internal_notes: notes }, { type: 'note', message: 'Internal notes updated' });
    } catch (err) {
      alert(err.message);
    }
    setSavingNotes(false);
  };

  const saveShipping = async () => {
    try {
      await patchOrder({
        shipping_cost_crc: Number(shippingCrc) || 0,
        shipping_cost_usd: Number(shippingUsd) || 0,
      }, { type: 'shipping_cost', message: `Shipping: ₡${shippingCrc} / $${shippingUsd}` });
    } catch (err) {
      alert(err.message);
    }
  };

  const uploadProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('orderId', order.id);
      const res = await adminFetch('/api/admin/orders/upload-proof', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      await patchOrder({ payment_proof_url: data.url }, { type: 'payment_proof', message: 'Payment proof uploaded' });
    } catch (err) {
      alert(err.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="modal active" onClick={onClose} style={{ zIndex: 210 }}>
      <div className="modal-content order-detail-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close-modal" onClick={onClose}>&times;</button>

        <div className="order-detail-header">
          <div style={{ padding: '10px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '12px', fontSize: '1.5rem' }}>📦</div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>Order Details</h2>
            <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 'bold' }}>
              #{order.order_number || order.id}
            </span>
            {order.source === 'admin_manual' && (
              <span className="order-detail-badge">Manual entry</span>
            )}
          </div>
        </div>

        <div className="order-detail-section">
          <h3>Customer</h3>
          <div className="order-detail-grid">
            <div><label>Name</label><span>{order.customer_name}</span></div>
            <div><label>Phone</label><span style={{ color: '#4ade80' }}>{order.customer_phone}</span></div>
            <div><label>Email</label><span>{order.customer_email || '—'}</span></div>
            <div><label>Ordered</label><span>{new Date(order.created_at).toLocaleString()}</span></div>
          </div>
          {order.shipping_address && (
            <div style={{ marginTop: '10px' }}><label>Address</label><p className="order-detail-address">{order.shipping_address}</p></div>
          )}
        </div>

        <div className="order-detail-section">
          <h3>Transaction</h3>
          <div className="order-detail-grid">
            <div><label>Payment</label><span>{order.payment_method}</span></div>
            <div>
              <label>Status</label>
              <select
                className="admin-select"
                value={order.status || 'Pending'}
                onChange={(e) => onStatusChange(order.id, e.target.value)}
                style={{ width: '100%', marginTop: '4px' }}
              >
                <option value="Pending">Pending</option>
                <option value="Payment Pending">Payment Pending</option>
                <option value="Paid">Paid</option>
                <option value="Processing">Processing</option>
                <option value="Order Complete">Order Complete</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label>Tracking</label>
              <input
                className="admin-input"
                defaultValue={order.tracking_number || ''}
                placeholder="Correos tracking #"
                onBlur={(e) => onTrackingChange(order.id, e.target.value)}
              />
            </div>
            {order.promo_code && (
              <div><label>Promo</label><span style={{ color: '#38bdf8' }}>{order.promo_code}</span></div>
            )}
          </div>
        </div>

        <div className="order-detail-section">
          <h3>Items &amp; Totals</h3>
          {items.map((item, idx) => (
            <div key={idx} className="order-detail-item-row">
              <span>{item.product} ×{item.qty}</span>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                {order.currency === 'USD'
                  ? `$${((item.price || 0) * item.qty).toFixed(2)}`
                  : `₡${((item.price || 0) * item.qty).toLocaleString()}`}
              </span>
            </div>
          ))}
          <div className="order-detail-totals">
            <div><span>Items subtotal</span><span>{order.currency === 'USD' ? `$${itemsSubtotal.toFixed(2)}` : `₡${itemsSubtotal.toLocaleString()}`}</span></div>
            {(order.shipping_cost_crc > 0 || order.shipping_cost_usd > 0) && (
              <div><span>Shipping</span><span>₡{order.shipping_cost_crc || 0} / ${order.shipping_cost_usd || 0}</span></div>
            )}
            <div className="order-detail-total-line">
              <span>Total</span>
              <span>{order.currency === 'USD' ? `$${order.total_usd}` : `₡${Number(order.total_crc || 0).toLocaleString()}`}</span>
            </div>
          </div>

          <div className="order-detail-shipping-edit" style={{ marginTop: '12px' }}>
            <label>Shipping cost</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <input className="admin-input" type="number" placeholder="CRC" value={shippingCrc} onChange={(e) => setShippingCrc(e.target.value)} />
              <input className="admin-input" type="number" step="0.01" placeholder="USD" value={shippingUsd} onChange={(e) => setShippingUsd(e.target.value)} />
              <button type="button" className="admin-btn admin-btn-secondary" onClick={saveShipping}>Save</button>
            </div>
          </div>
        </div>

        <div className="order-detail-section">
          <h3>Payment Proof</h3>
          {order.payment_proof_url ? (
            <a href={order.payment_proof_url} target="_blank" rel="noopener noreferrer" className="order-proof-link">
              View uploaded proof
            </a>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 8px' }}>No proof uploaded yet.</p>
          )}
          <label className="admin-btn admin-btn-secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
            {uploading ? 'Uploading…' : 'Upload proof'}
            <input type="file" accept="image/*,.pdf" onChange={uploadProof} style={{ display: 'none' }} disabled={uploading} />
          </label>
        </div>

        <div className="order-detail-section">
          <h3>Internal Notes</h3>
          <textarea
            className="admin-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Private notes for your team…"
          />
          <button type="button" className="admin-btn admin-btn-primary" onClick={saveNotes} disabled={savingNotes} style={{ marginTop: '8px' }}>
            {savingNotes ? 'Saving…' : 'Save notes'}
          </button>
        </div>

        <div className="order-detail-section">
          <h3>Timeline</h3>
          {activity.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Order created {new Date(order.created_at).toLocaleString()}</p>
          ) : (
            <ul className="order-timeline">
              {activity.map((entry, idx) => (
                <li key={idx}>
                  <div className="order-timeline-type">{formatActivityType(entry.type)}</div>
                  {entry.message && <div className="order-timeline-msg">{entry.message}</div>}
                  <div className="order-timeline-meta">
                    {entry.by && <span>{entry.by}</span>}
                    {entry.at && <span>{new Date(entry.at).toLocaleString()}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
