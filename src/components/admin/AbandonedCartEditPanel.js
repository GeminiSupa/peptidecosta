'use client';

import React, { useEffect, useState } from 'react';
import { MessageCircle, Plus, Send, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import {
  buildCartRecoveryLink,
  buildCartRecoveryWhatsAppMessage,
  buildWhatsAppDeepLink,
  formatPhoneForWhatsApp,
} from '@/lib/whatsappRecovery';

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
  const [sendingBusinessWa, setSendingBusinessWa] = useState(false);
  const [waSuccess, setWaSuccess] = useState('');
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

  const persistCart = async () => {
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
      return null;
    }

    onSaved?.(data.cart);
    return data.cart;
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setWaSuccess('');
    try {
      await persistCart();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const recoveryLink = buildCartRecoveryLink(cart.session_id);

  const markRecoverySent = () => {
    const updated = {
      ...cart,
      customer_name: name.trim() || null,
      customer_phone: phone.trim() || null,
      customer_email: email.trim() || null,
      cart_data: items,
      recovery_whatsapp_sent: true,
      recovery_whatsapp_sent_at: new Date().toISOString(),
    };
    onSaved?.(updated);
  };

  const handleSendBusinessWhatsApp = async () => {
    const waPhone = formatPhoneForWhatsApp(phone);
    if (!waPhone || waPhone.length < 8) {
      setError('Add a valid customer phone number before sending via Business WhatsApp.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one cart item before sending recovery WhatsApp.');
      return;
    }

    setSendingBusinessWa(true);
    setError('');
    setWaSuccess('');

    try {
      const saved = await persistCart();
      if (!saved) return;

      const message = buildCartRecoveryWhatsAppMessage({
        name,
        items,
        recoveryLink,
        updated: true,
      });

      // Try free-form message first (works within Meta's 24h customer service window)
      const customRes = await adminFetch('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({
          to: phone.trim(),
          message,
          customerName: name.trim() || 'Cliente',
          sessionId: cart.session_id,
        }),
      });
      const customData = await customRes.json();

      if (customRes.ok && customData.success) {
        markRecoverySent();
        setWaSuccess('Custom recovery message sent from your business WhatsApp number.');
        return;
      }

      // Outside 24h window — fall back to approved template (same as bulk Send WA)
      const templateRes = await fetch('/api/abandoned-cart-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: cart.session_id,
          customer_name: name.trim() || cart.customer_name,
          customer_phone: phone.trim(),
          lang: cart.lang || 'es',
        }),
      });
      const templateData = await templateRes.json();

      if (templateRes.ok && templateData.success) {
        markRecoverySent();
        setWaSuccess('Recovery template sent from your business WhatsApp number.');
        return;
      }

      throw new Error(
        templateData.error ||
          customData.error ||
          'Business WhatsApp delivery failed. Try personal WhatsApp below.'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingBusinessWa(false);
    }
  };

  const openWhatsAppRecovery = () => {
    const waPhone = formatPhoneForWhatsApp(phone);
    if (!waPhone || waPhone.length < 8) {
      setError('Add a valid customer phone number before opening WhatsApp.');
      return;
    }
    const message = buildCartRecoveryWhatsAppMessage({
      name,
      items,
      recoveryLink,
      updated: true,
    });
    const link = buildWhatsAppDeepLink(phone, message);
    if (!link) {
      setError('Could not build WhatsApp link — check the phone number.');
      return;
    }
    setError('');
    window.open(link, '_blank', 'noopener,noreferrer');
  };

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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              className="admin-input"
              readOnly
              value={recoveryLink}
              onFocus={(e) => e.target.select()}
              style={{ flex: 1, minWidth: '200px' }}
            />
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => navigator.clipboard?.writeText(recoveryLink)}
              style={{ whiteSpace: 'nowrap' }}
            >
              Copy link
            </button>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={handleSendBusinessWhatsApp}
            disabled={sendingBusinessWa || !phone.trim() || items.length === 0}
            style={{
              width: '100%',
              marginTop: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Send size={16} />
            {sendingBusinessWa ? 'Sending via Business WhatsApp…' : 'Send via Business WhatsApp'}
          </button>
          <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '8px 0 0' }}>
            Saves your edits first, then sends from your business number. Uses a custom message when the customer is in the 24h chat window; otherwise sends the approved recovery template (same as bulk Send WA).
          </p>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={openWhatsAppRecovery}
            disabled={!phone.trim() || items.length === 0}
            style={{
              width: '100%',
              marginTop: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <MessageCircle size={16} />
            Open personal WhatsApp (fallback)
          </button>
          {(!phone.trim() || items.length === 0) && (
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '8px 0 0' }}>
              Add a phone number and at least one cart item to enable WhatsApp.
            </p>
          )}
          {cart.recovery_whatsapp_sent && (
            <p style={{ fontSize: '0.72rem', color: '#4ade80', margin: '8px 0 0' }}>
              Recovery WhatsApp previously sent
              {cart.recovery_whatsapp_sent_at
                ? ` (${new Date(cart.recovery_whatsapp_sent_at).toLocaleString()})`
                : ''}.
            </p>
          )}
        </div>

        {waSuccess && <p style={{ color: '#4ade80', fontSize: '0.85rem' }}>{waSuccess}</p>}
        {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}

        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={handleSave}
          disabled={saving || sendingBusinessWa}
          style={{ width: '100%' }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
