'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, UserRoundSearch } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { calculateAdminOrderTotals } from '@/lib/adminOrderTotals.mjs';
import { bacGiftShortfall } from '@/lib/bacWater.mjs';
import {
  buildManualOrderCustomerOptions,
  resolveManualOrderCustomerPrefill,
} from '@/lib/manualOrderCustomer.mjs';
import ProductCombobox from './ProductCombobox';

const EMPTY_ITEM = { product: '', qty: 1, price: '' };
const emptyForm = () => ({
  customer_name: '', customer_phone: '', customer_email: '', customer_id_number: '', customer_id_type: '1',
  shipping_address: '', currency: 'CRC', payment_method: 'whatsapp', status: 'Pending', promo_code: '',
  shipping_cost_crc: 0, shipping_cost_usd: 0, items: [{ ...EMPTY_ITEM }],
});

export default function ManualOrderModal({ open, onClose, products = [], orders = [], initialCustomer = null, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [customerSearch, setCustomerSearch] = useState('');
  const wasOpen = useRef(false);
  const customerOptions = useMemo(() => buildManualOrderCustomerOptions(orders), [orders]);

  const applyCustomer = (customer) => {
    if (!customer) return;
    setForm((current) => ({
      ...current,
      customer_name: customer.name || '',
      customer_phone: customer.phone || '',
      customer_email: customer.email || '',
      customer_id_number: customer.customerIdNumber || '',
      customer_id_type: customer.customerIdType || '1',
      shipping_address: customer.shippingAddress || '',
    }));
    setCustomerSearch(customer.searchLabel || [customer.name, customer.email, customer.phone].filter(Boolean).join(' · '));
  };

  useEffect(() => {
    if (open && !wasOpen.current) {
      const next = initialCustomer ? resolveManualOrderCustomerPrefill(initialCustomer, orders) : null;
      setForm(emptyForm());
      setError('');
      setCustomerSearch('');
      if (next) applyCustomer(next);
    }
    wasOpen.current = open;
  }, [open, initialCustomer, orders]);

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

  // The free vials the route will attach on save. Shown here so an agent taking
  // a phone order can see what is going in the box before they commit to it.
  const giftShortfall = bacGiftShortfall(form.items);

  const shipping = form.currency === 'USD' ? Number(form.shipping_cost_usd) || 0 : Number(form.shipping_cost_crc) || 0;
  const { discountPct, total } = calculateAdminOrderTotals(form.items, shipping);

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

    const totalUsd = form.currency === 'USD' ? Number(total.toFixed(2)) : parseFloat((total / 454.48).toFixed(2));
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
            customer_id_type: form.customer_id_number.trim() ? form.customer_id_type : null,
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
          <div style={{ background: '#172237', borderRadius: 10, padding: 12, marginBottom: 4 }}>
            <label htmlFor="manual-order-customer-search" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cbd5e1', fontSize: '.76rem', fontWeight: 800, marginBottom: 7 }}>
              <UserRoundSearch size={14} /> Find an existing customer
            </label>
            <input
              id="manual-order-customer-search"
              className="admin-input"
              list="manual-order-customer-options"
              value={customerSearch}
              placeholder="Type a name, email, or phone…"
              onChange={(event) => {
                const value = event.target.value;
                setCustomerSearch(value);
                const selected = customerOptions.find((customer) => customer.searchLabel === value);
                if (selected) applyCustomer(selected);
              }}
              style={{ width: '100%' }}
            />
            <datalist id="manual-order-customer-options">
              {customerOptions.map((customer) => <option key={customer.id} value={customer.searchLabel} />)}
            </datalist>
            <div style={{ color: '#64748b', fontSize: '.68rem', marginTop: 6 }}>Selecting a customer fills their latest contact, ID, and shipping details. Everything remains editable.</div>
          </div>
          <div className="manual-order-grid">
            <input className="admin-input" placeholder="Customer name *" required value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            <input className="admin-input" placeholder="Phone *" required value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
            <input className="admin-input" placeholder="Email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            <select className="admin-select" value={form.customer_id_type} onChange={(e) => setForm({ ...form, customer_id_type: e.target.value })}>
              <option value="1">National ID / Cédula</option>
              <option value="6">DIMEX</option>
              <option value="5">Passport</option>
              <option value="2">Corporate ID</option>
            </select>
            <input className="admin-input" placeholder="ID number" value={form.customer_id_number} onChange={(e) => setForm({ ...form, customer_id_number: e.target.value })} />
          </div>
          <textarea className="admin-input" placeholder="Shipping address" rows={2} value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} />

          <div className="manual-order-grid">
            <select className="admin-select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="CRC">CRC (₡)</option>
              <option value="USD">USD ($)</option>
            </select>
            <select
              className="admin-select"
              value={form.payment_method}
              onChange={(e) => setForm({
                ...form,
                payment_method: e.target.value,
                status: e.target.value === 'card'
                  ? 'Payment Pending'
                  : (form.status === 'Payment Pending' ? 'Pending' : form.status),
              })}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="paypal">PayPal</option>
              <option value="sinpe">SINPE</option>
              <option value="card">Card</option>
            </select>
            <select className="admin-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Pending">Pending</option>
              <option value="Payment Pending">Payment Pending</option>
              <option value="Pending - Card">Pending - Card</option>
              <option value="Pending - Card 3DS">Pending - Card 3DS</option>
              <option value="Paid">Paid</option>
              <option value="Declined">Declined</option>
              <option value="Error">Error</option>
              <option value="Processing">Processing</option>
              <option value="Order Complete">Order Complete</option>
            </select>
            <input className="admin-input" placeholder="Promo code (optional)" value={form.promo_code} onChange={(e) => setForm({ ...form, promo_code: e.target.value })} />
          </div>

          <h4 style={{ margin: '16px 0 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Items</h4>
          {form.items.map((item, idx) => (
            <div key={idx} className="manual-order-item-row">
              <ProductCombobox
                products={products}
                value={item.product}
                placeholder="Type to find a product…"
                onClear={() => updateItem(idx, 'product', '')}
                onSelect={(product) => pickProduct(idx, product.product)}
              />
              <input className="admin-input" type="number" min="1" placeholder="Qty" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} style={{ width: '70px' }} />
              <input className="admin-input" type="number" min="0" step="0.01" placeholder="Price" value={item.price} onChange={(e) => updateItem(idx, 'price', e.target.value)} style={{ width: '100px' }} />
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => removeItem(idx)} disabled={form.items.length <= 1}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {giftShortfall.missing > 0 && (
            <div
              className="manual-order-item-row"
              style={{
                marginBottom: '8px',
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px dashed rgba(56, 189, 248, 0.35)',
                background: 'rgba(56, 189, 248, 0.06)',
              }}
            >
              <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: '#7dd3fc' }}>
                🎁 Bacteriostatic Water 3ml{' '}
                <span style={{ fontWeight: 500, color: '#94a3b8' }}>— added free, 1 per peptide</span>
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7dd3fc', whiteSpace: 'nowrap' }}>
                × {giftShortfall.missing}
              </span>
            </div>
          )}

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
