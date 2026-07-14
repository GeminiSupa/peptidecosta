'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const EMPTY_ITEM = { product: '', qty: 1, price: '' };

export default function ManualOrderModal({ open, onClose, products = [], onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_id_number: '',
    shipping_address: '',
    currency: 'CRC',
    payment_method: 'whatsapp',
    status: 'Pending',
    promo_code: '',
    shipping_cost_crc: 0,
    shipping_cost_usd: 0,
    items: [{ ...EMPTY_ITEM }],
  });

  if (!open) return null;

  const updateItem = (idx, field, val) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    setForm({ ...form, items });
  };

  const addItem = () => setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] });

  const removeItem = (idx) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });
  };

  const pickProduct = (idx, name) => {
    const p = products.find((x) => x.product === name);
    if (!p) return;
    const price = form.currency === 'USD'
      ? parseFloat(String(p.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0
      : parseFloat(String(p.priceCrc || '0').replace(/[^0-9.]/g, '')) || 0;
    const items = [...form.items];
    items[idx] = { ...items[idx], product: name, price: price };
    setForm({ ...form, items });
  };

  const itemsSubtotal = form.items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
  const vialCount = form.items.reduce((s, i) => s + (Number(i.qty) || 1), 0);
  let discountPct = 0;
  if (vialCount >= 10) discountPct = 20;
  else if (vialCount >= 5) discountPct = 15;
  const discountedSubtotal = discountPct > 0 ? itemsSubtotal * (1 - discountPct / 100) : itemsSubtotal;

  const shipping = form.currency === 'USD' ? Number(form.shipping_cost_usd) || 0 : Number(form.shipping_cost_crc) || 0;
  const total = discountedSubtotal + shipping;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const orderItems = form.items
      .filter((i) => i.product && Number(i.price) > 0)
      .map((i) => ({ product: i.product, qty: Number(i.qty) || 1, price: Number(i.price) }));

    if (orderItems.length === 0) {
      setError('Add at least one item with a price.');
      setSaving(false);
      return;
    }

    const totalUsd = form.currency === 'USD' ? total : Math.round(total / 454.48);
    const totalCrc = form.currency === 'CRC' ? total : Math.round(total * 454.48);

    try {
      const res = await adminFetch('/api/admin/orders/create', {
        method: 'POST',
        body: JSON.stringify({
          order: {
            customer_name: form.customer_name.trim(),
            customer_phone: form.customer_phone.trim(),
            customer_email: form.customer_email.trim() || null,
            customer_id_number: form.customer_id_number.trim() || null,
            shipping_address: form.shipping_address.trim() || null,
            items: orderItems,
            total_usd: totalUsd,
            total_crc: totalCrc,
            currency: form.currency,
            payment_method: form.payment_method,
            status: form.status,
            promo_code: form.promo_code.trim() || null,
            shipping_cost_usd: form.currency === 'USD' ? shipping : parseFloat((shipping / 454.48).toFixed(2)),
            shipping_cost_crc: form.currency === 'CRC' ? shipping : Math.round(shipping * 454.48),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create order');
      onCreated(data.order);
      onClose();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="modal active" onClick={onClose} style={{ zIndex: 220 }}>
      <div className="modal-content manual-order-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close-modal" onClick={onClose}>&times;</button>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 800 }}>Create Manual Order</h2>
        <p style={{ margin: '0 0 20px', fontSize: '0.8rem', color: '#94a3b8' }}>
          For phone/WhatsApp orders or recovering failed checkouts.
        </p>

        <form onSubmit={handleSubmit} className="manual-order-form">
          <div className="manual-order-grid">
            <input className="admin-input" placeholder="Customer name *" required value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            <input className="admin-input" placeholder="Phone *" required value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
            <input className="admin-input" placeholder="Email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            <input className="admin-input" placeholder="ID number" value={form.customer_id_number} onChange={(e) => setForm({ ...form, customer_id_number: e.target.value })} />
          </div>
          <textarea className="admin-input" placeholder="Shipping address" rows={2} value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} />

          <div className="manual-order-grid">
            <select className="admin-select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="CRC">CRC (₡)</option>
              <option value="USD">USD ($)</option>
            </select>
            <select className="admin-select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="whatsapp">WhatsApp</option>
              <option value="paypal">PayPal</option>
              <option value="sinpe">SINPE</option>
              <option value="card">Card</option>
            </select>
            <select className="admin-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
              <option value="Processing">Processing</option>
              <option value="Order Complete">Order Complete</option>
            </select>
            <input className="admin-input" placeholder="Promo code (optional)" value={form.promo_code} onChange={(e) => setForm({ ...form, promo_code: e.target.value })} />
          </div>

          <h4 style={{ margin: '16px 0 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Items</h4>
          {form.items.map((item, idx) => (
            <div key={idx} className="manual-order-item-row">
              <select className="admin-select" value={item.product} onChange={(e) => pickProduct(idx, e.target.value)}>
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id || p.product} value={p.product}>{p.product}</option>
                ))}
              </select>
              <input className="admin-input" type="number" min="1" placeholder="Qty" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} style={{ width: '70px' }} />
              <input className="admin-input" type="number" min="0" step="0.01" placeholder="Price" value={item.price} onChange={(e) => updateItem(idx, 'price', e.target.value)} style={{ width: '100px' }} />
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => removeItem(idx)} disabled={form.items.length <= 1}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="admin-btn admin-btn-secondary" onClick={addItem} style={{ marginBottom: '12px' }}>
            <Plus size={14} /> Add item
          </button>

          <div className="manual-order-grid">
            <input
              className="admin-input"
              type="number"
              min="0"
              placeholder={form.currency === 'USD' ? 'Shipping cost USD' : 'Shipping cost CRC'}
              value={form.currency === 'USD' ? form.shipping_cost_usd : form.shipping_cost_crc}
              onChange={(e) => setForm({
                ...form,
                [form.currency === 'USD' ? 'shipping_cost_usd' : 'shipping_cost_crc']: e.target.value,
              })}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontWeight: 800, fontSize: '1.1rem', color: '#38bdf8' }}>
              {discountPct > 0 && (
                <div style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 'bold' }}>
                  Volume discount: {discountPct}% off
                </div>
              )}
              Total: {form.currency === 'USD' ? `$${total.toFixed(2)}` : `₡${Math.round(total).toLocaleString()}`}
            </div>
          </div>

          {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}

          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving} style={{ width: '100%', marginTop: '12px' }}>
            {saving ? 'Saving…' : 'Create Order'}
          </button>
        </form>
      </div>
    </div>
  );
}
