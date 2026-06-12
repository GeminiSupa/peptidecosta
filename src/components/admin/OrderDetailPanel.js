'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatActivityType } from '@/lib/orderActivity';
import { adminFetch } from '@/lib/adminApi';

const FALLBACK_EXCHANGE_RATE = 454.48;

const formatCustomerIdType = (idType) => {
  if (!idType) return '';
  const types = {
    '1': 'Cédula',
    '2': 'Cédula jurídica',
    '5': 'Passport',
    '6': 'DIMEX',
  };
  return types[String(idType)] || idType;
};

const parseProductPrice = (product, currency) => {
  if (currency === 'USD') {
    return parseFloat(String(product.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
  }
  return parseFloat(String(product.priceCrc || '0').replace(/[^0-9.]/g, '')) || 0;
};

export default function OrderDetailPanel({
  order,
  products = [],
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

  const [customerName, setCustomerName] = useState(order.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(order.customer_phone || '');
  const [customerEmail, setCustomerEmail] = useState(order.customer_email || '');
  const [shippingAddress, setShippingAddress] = useState(order.shipping_address || '');
  const [editItems, setEditItems] = useState([]);
  const [addProduct, setAddProduct] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');

  useEffect(() => {
    setNotes(order.internal_notes || '');
    setShippingCrc(order.shipping_cost_crc ?? '');
    setShippingUsd(order.shipping_cost_usd ?? '');
    setCustomerName(order.customer_name || '');
    setCustomerPhone(order.customer_phone || '');
    setCustomerEmail(order.customer_email || '');
    setShippingAddress(order.shipping_address || '');
    setEditItems(Array.isArray(order.items) ? order.items.map((i) => ({ ...i })) : []);
    setOrderError('');
  }, [order]);

  if (!order) return null;

  const activity = Array.isArray(order.activity_log) ? order.activity_log : [];
  const shipping = order.currency === 'USD'
    ? Number(shippingUsd) || 0
    : Number(shippingCrc) || 0;
  const itemsSubtotal = editItems.reduce(
    (s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1),
    0
  );
  const orderTotal = itemsSubtotal + shipping;

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

  const updateItemQty = (idx, qty) => {
    const next = [...editItems];
    next[idx] = { ...next[idx], qty: Math.max(1, Number(qty) || 1) };
    setEditItems(next);
  };

  const updateItemPrice = (idx, price) => {
    const next = [...editItems];
    next[idx] = { ...next[idx], price: Number(price) || 0 };
    setEditItems(next);
  };

  const removeItem = (idx) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
  };

  const handleAddProduct = () => {
    if (!addProduct) return;
    const product = products.find((p) => p.product === addProduct);
    if (!product) return;
    if (editItems.some((i) => i.product === product.product)) {
      setOrderError('Product already on this order — change quantity instead.');
      return;
    }
    setEditItems([
      ...editItems,
      {
        product: product.product,
        qty: 1,
        price: parseProductPrice(product, order.currency),
      },
    ]);
    setAddProduct('');
    setOrderError('');
  };

  const saveOrderEdits = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      setOrderError('Name and phone are required.');
      return;
    }
    if (editItems.length === 0) {
      setOrderError('Order must have at least one item.');
      return;
    }

    setSavingOrder(true);
    setOrderError('');

    const normalizedItems = editItems.map((i) => ({
      product: i.product,
      qty: Number(i.qty) || 1,
      price: Number(i.price) || 0,
    }));

    const subtotal = normalizedItems.reduce((s, i) => s + i.price * i.qty, 0);
    const ship = order.currency === 'USD'
      ? Number(shippingUsd) || 0
      : Number(shippingCrc) || 0;
    const total = subtotal + ship;
    const totalUsd = order.currency === 'USD' ? total : Math.round(total / FALLBACK_EXCHANGE_RATE);
    const totalCrc = order.currency === 'CRC' ? Math.round(total) : Math.round(total * FALLBACK_EXCHANGE_RATE);

    try {
      await patchOrder(
        {
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim() || null,
          shipping_address: shippingAddress.trim() || null,
          items: normalizedItems,
          total_usd: totalUsd,
          total_crc: totalCrc,
        },
        {
          type: 'items_updated',
          message: 'Customer contact and/or order items updated by admin',
        }
      );
    } catch (err) {
      setOrderError(err.message);
    }
    setSavingOrder(false);
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

        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 12px' }}>
          Fix contact typos or adjust line items after speaking with the customer — no need to re-checkout.
        </p>

        <div className="order-detail-section">
          <h3>Customer</h3>
          <div className="order-detail-grid">
            <div>
              <label>Name</label>
              <input className="admin-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label>Phone</label>
              <input className="admin-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div>
              <label>Email</label>
              <input className="admin-input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label>ID Number</label>
              <span style={{ fontFamily: 'monospace' }}>
                {order.customer_id_number
                  ? `${order.customer_id_number}${order.customer_id_type ? ` (${formatCustomerIdType(order.customer_id_type)})` : ''}`
                  : '—'}
              </span>
            </div>
            <div><label>Ordered</label><span>{new Date(order.created_at).toLocaleString()}</span></div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <label>Address</label>
            <textarea
              className="admin-input"
              rows={2}
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              placeholder="Shipping address"
            />
          </div>
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
          {editItems.map((item, idx) => (
            <div key={`${item.product}-${idx}`} className="manual-order-item-row" style={{ marginBottom: '8px' }}>
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{item.product}</span>
              <input
                className="admin-input"
                type="number"
                min="1"
                value={item.qty}
                onChange={(e) => updateItemQty(idx, e.target.value)}
                style={{ width: '64px' }}
              />
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                value={item.price}
                onChange={(e) => updateItemPrice(idx, e.target.value)}
                style={{ width: '90px' }}
              />
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => removeItem(idx)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <select className="admin-select" value={addProduct} onChange={(e) => setAddProduct(e.target.value)} style={{ flex: 1, minWidth: '160px' }}>
              <option value="">Add product…</option>
              {products.map((p) => (
                <option key={p.id || p.product} value={p.product}>{p.product}</option>
              ))}
            </select>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={handleAddProduct}>
              <Plus size={14} /> Add
            </button>
          </div>

          <div className="order-detail-totals">
            <div><span>Items subtotal</span><span>{order.currency === 'USD' ? `$${itemsSubtotal.toFixed(2)}` : `₡${itemsSubtotal.toLocaleString()}`}</span></div>
            {(Number(shippingCrc) > 0 || Number(shippingUsd) > 0) && (
              <div><span>Shipping</span><span>₡{shippingCrc || 0} / ${shippingUsd || 0}</span></div>
            )}
            <div className="order-detail-total-line">
              <span>Total (preview)</span>
              <span>{order.currency === 'USD' ? `$${orderTotal.toFixed(2)}` : `₡${Math.round(orderTotal).toLocaleString()}`}</span>
            </div>
          </div>

          <div className="order-detail-shipping-edit" style={{ marginTop: '12px' }}>
            <label>Shipping cost</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <input className="admin-input" type="number" placeholder="CRC" value={shippingCrc} onChange={(e) => setShippingCrc(e.target.value)} />
              <input className="admin-input" type="number" step="0.01" placeholder="USD" value={shippingUsd} onChange={(e) => setShippingUsd(e.target.value)} />
              <button type="button" className="admin-btn admin-btn-secondary" onClick={saveShipping}>Save shipping</button>
            </div>
          </div>

          {orderError && <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '8px' }}>{orderError}</p>}

          <button type="button" className="admin-btn admin-btn-primary" onClick={saveOrderEdits} disabled={savingOrder} style={{ width: '100%', marginTop: '12px' }}>
            {savingOrder ? 'Saving…' : 'Save contact & items'}
          </button>
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
