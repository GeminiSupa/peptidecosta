'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

const productToCartItem = (product) => ({
  product: product.product,
  category: product.category,
  priceUsd: product.priceUsd,
  priceCrc: product.priceCrc,
  imageUrl: product.imageUrl,
  status: product.status,
  qty: 1,
});

export default function AbandonedCartEditPanel({ cart, products = [], onClose, onSaved, onDeleted }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [items, setItems] = useState([]);
  const [addProduct, setAddProduct] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cart) return;
    setName(cart.customer_name || '');
    setPhone(cart.customer_phone || '');
    setEmail(cart.customer_email || '');
    setItems(Array.isArray(cart.cart_data) ? cart.cart_data.map((i) => ({ ...i })) : []);
    setError('');
  }, [cart]);

  if (!cart) return null;

  const updateQty = (idx, qty) => {
    const next = [...items];
    next[idx] = { ...next[idx], qty: Math.max(1, Number(qty) || 1) };
    setItems(next);
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleAddProduct = () => {
    if (!addProduct) return;
    const product = products.find((p) => p.product === addProduct);
    if (!product) return;
    if (items.some((i) => i.product === product.product)) {
      setError('That product is already in the cart — adjust quantity instead.');
      return;
    }
    setItems([...items, productToCartItem(product)]);
    setAddProduct('');
    setError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/abandoned-carts/update', {
        method: 'PATCH',
        body: JSON.stringify({
          sessionId: cart.session_id,
          updates: {
            customer_name: name.trim() || null,
            customer_phone: phone.trim() || null,
            customer_email: email.trim() || null,
            cart_data: items,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      if (data.deleted) {
        onDeleted?.(cart.session_id);
        onClose();
        return;
      }

      onSaved?.(data.cart);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const recoveryLink = `https://catalog.peptidescostarica.net/catalog?recover_session=${cart.session_id}`;

  return (
    <div className="modal active" onClick={onClose} style={{ zIndex: 210 }}>
      <div className="modal-content order-detail-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close-modal" onClick={onClose}>&times;</button>

        <div className="order-detail-header">
          <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '12px', fontSize: '1.5rem' }}>🛒</div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>Edit Abandoned Cart</h2>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Session: {cart.session_id.slice(0, 12)}…
            </span>
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 16px' }}>
          Fix typos in contact info or adjust items after talking with the customer. Changes save to their recovery cart.
        </p>

        <div className="order-detail-section">
          <h3>Customer</h3>
          <div className="order-detail-grid">
            <div>
              <label>Name</label>
              <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <label>Phone</label>
              <input className="admin-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp / phone" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Email</label>
              <input className="admin-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" />
            </div>
          </div>
        </div>

        <div className="order-detail-section">
          <h3>Cart Items</h3>
          {items.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No items — saving will remove this cart entry.</p>
          ) : (
            items.map((item, idx) => (
              <div key={`${item.product}-${idx}`} className="order-detail-item-row" style={{ gap: '8px' }}>
                <span style={{ flex: 1 }}>{item.product}</span>
                <input
                  className="admin-input"
                  type="number"
                  min="1"
                  value={item.qty}
                  onChange={(e) => updateQty(idx, e.target.value)}
                  style={{ width: '64px' }}
                />
                <button type="button" className="admin-btn admin-btn-danger" onClick={() => removeItem(idx)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <select className="admin-select" value={addProduct} onChange={(e) => setAddProduct(e.target.value)} style={{ flex: 1, minWidth: '180px' }}>
              <option value="">Add product…</option>
              {products.map((p) => (
                <option key={p.id || p.product} value={p.product}>{p.product}</option>
              ))}
            </select>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={handleAddProduct}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        <div className="order-detail-section">
          <h3>Recovery Link</h3>
          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 8px' }}>
            Send this after edits so the customer sees the updated cart at checkout.
          </p>
          <input className="admin-input" readOnly value={recoveryLink} onFocus={(e) => e.target.select()} />
        </div>

        {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}

        <button type="button" className="admin-btn admin-btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
