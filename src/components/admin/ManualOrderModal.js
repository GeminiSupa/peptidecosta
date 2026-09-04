'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BadgePercent, Plus, Trash2, UserRoundSearch } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import {
  ADMIN_FALLBACK_EXCHANGE_RATE,
  calculateAdminOrderTotals,
  getAdminCurrencyPair,
  manualDiscountReplacesVolume,
} from '@/lib/adminOrderTotals.mjs';
import { bacGiftShortfall } from '@/lib/bacWater.mjs';
import {
  buildManualOrderCustomerOptions,
  resolveManualOrderCustomerPrefill,
} from '@/lib/manualOrderCustomer.mjs';
import ManualCustomerCombobox from './ManualCustomerCombobox';
import ProductCombobox from './ProductCombobox';

const EMPTY_ITEM = { product: '', qty: 1, price: '' };
const emptyForm = () => ({
  customer_name: '', customer_phone: '', customer_email: '', customer_id_number: '', customer_id_type: '1',
  shipping_address: '', currency: 'CRC', payment_method: 'whatsapp', status: 'Pending', promo_code: '',
  shipping_cost_crc: 0, shipping_cost_usd: 0, items: [{ ...EMPTY_ITEM }],
  manual_discount_type: 'none', manual_discount_value: '', manual_discount_reason: '',
  internal_notes: '', sales_agent: '', notify_customer: true,
});

export default function ManualOrderModal({
  open,
  onClose,
  products = [],
  orders = [],
  agents = [],
  isSuperadmin = false,
  initialCustomer = null,
  exchangeRate = ADMIN_FALLBACK_EXCHANGE_RATE,
  exchangeRateUpdatedAt = null,
  onCreated,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [customerSearch, setCustomerSearch] = useState('');
  const wasOpen = useRef(false);
  const customerOptions = useMemo(() => buildManualOrderCustomerOptions(orders), [orders]);
  const liveExchangeRate = Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0
    ? Number(exchangeRate)
    : ADMIN_FALLBACK_EXCHANGE_RATE;

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

  const productPrice = (name, currency) => {
    const p = products.find((x) => x.product === name);
    if (!p) return 0;
    const usd = parseFloat(String(p.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
    if (currency === 'USD') return usd;
    // Match the customer catalog: CRC is always derived from the USD catalog
    // price and the current guarded USD/CRC rate, never from an old saved CRC
    // string or the historic 454.48 fallback.
    if (usd > 0) return Math.round(usd * liveExchangeRate);
    return parseFloat(String(p.priceCrc || '0').replace(/[^0-9.]/g, '')) || 0;
  };

  const pickProduct = (idx, name) => {
    const price = productPrice(name, form.currency);
    if (!price) return;
    const items = [...form.items];
    items[idx] = { ...items[idx], product: name, price: price };
    setForm({ ...form, items });
  };

  const changeCurrency = (currency) => {
    setForm((current) => ({
      ...current,
      currency,
      // Reprice selected catalog products when the order currency changes. A
      // CRC amount must never survive a switch to USD (or vice versa).
      items: current.items.map((item) => ({
        ...item,
        price: item.product ? productPrice(item.product, currency) : item.price,
      })),
    }));
  };

  // The free vials the route will attach on save. Shown here so an agent taking
  // a phone order can see what is going in the box before they commit to it.
  const giftShortfall = bacGiftShortfall(form.items);

  const shipping = form.currency === 'USD' ? Number(form.shipping_cost_usd) || 0 : Number(form.shipping_cost_crc) || 0;
  const manualDiscountType = form.manual_discount_type === 'none' ? null : form.manual_discount_type;
  const {
    itemsSubtotal,
    discountPct,
    discountAmount,
    manualDiscountAmount,
    total,
  } = calculateAdminOrderTotals(form.items, shipping, {
    manualDiscountType,
    manualDiscountValue: form.manual_discount_value,
    // A negotiated discount stands in place of the volume tier on a manual
    // order, so 25% typed here is 25% off the list price and not 25% off an
    // already-reduced one.
    replaceVolumeDiscount: manualDiscountReplacesVolume(
      'admin_manual', manualDiscountType, form.manual_discount_value,
    ),
  });

  // The preview and the receipt must agree to the cent, so it is worth being
  // explicit about what the customer will be shown rather than printing a
  // single total and hoping. The promo code's own discount is deliberately
  // absent: it is resolved and priced by the server against the live promo
  // table, so the browser has no honest figure for it until the order saves.
  const money = (amount) => form.currency === 'USD'
    ? `$${Number(amount).toFixed(2)}`
    : `₡${Math.round(Number(amount)).toLocaleString()}`;

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

    const discountValue = Number(form.manual_discount_value || 0);
    if (manualDiscountType) {
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        setError('Enter a discount greater than zero, or set the discount back to "No manual discount".');
        setSaving(false);
        return;
      }
      if (manualDiscountType === 'percentage' && discountValue > 100) {
        setError('Percentage discount cannot exceed 100%.');
        setSaving(false);
        return;
      }
    }

    const totals = getAdminCurrencyPair(total, form.currency, liveExchangeRate);
    const shippingCosts = getAdminCurrencyPair(shipping, form.currency, liveExchangeRate);

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
            total_usd: totals.usd,
            total_crc: totals.crc,
            currency: form.currency,
            payment_method: form.payment_method,
            status: form.status,
            promo_code: form.promo_code.trim() || null,
            shipping_cost_usd: shippingCosts.usd,
            shipping_cost_crc: shippingCosts.crc,
            manual_discount_type: manualDiscountType,
            manual_discount_value: manualDiscountType ? discountValue : 0,
            manual_discount_reason: manualDiscountType
              ? (form.manual_discount_reason.trim() || null)
              : null,
            internal_notes: form.internal_notes.trim() || null,
            notify_customer: form.notify_customer,
            ...(isSuperadmin && form.sales_agent.trim()
              ? { sales_agent: form.sales_agent.trim() }
              : {}),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create order');
      // The order saved either way — a refused receipt must not look like a
      // refused order. It is handed up so the page can say so plainly instead
      // of the agent finding out when the customer asks where their receipt is.
      onCreated(data.order, data.alerts);
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
            <ManualCustomerCombobox
              customers={customerOptions}
              value={customerSearch}
              onChange={setCustomerSearch}
              onSelect={applyCustomer}
            />
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
            <select className="admin-select" value={form.currency} onChange={(e) => changeCurrency(e.target.value)}>
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
          <div style={{ color: '#7dd3fc', fontSize: '.7rem', marginTop: '-2px' }}>
            Live checkout rate: $1 = ₡{liveExchangeRate.toLocaleString('en-US', { maximumFractionDigits: 4 })}
            {exchangeRateUpdatedAt ? ` · updated ${new Date(exchangeRateUpdatedAt).toLocaleString()}` : ''}
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
              <input className="admin-input" type="number" min="0" step="0.01" placeholder="Price" value={item.price} readOnly title="Price is loaded from the live product catalog" style={{ width: '100px', opacity: 0.82 }} />
              <button type="button" className="admin-btn admin-btn-danger" onClick={() => removeItem(idx)} disabled={form.items.length <= 1}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div style={{ color: '#64748b', fontSize: '.68rem', margin: '-2px 0 10px' }}>
            Product prices are confirmed from the live catalog when the order is saved.
          </div>
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

          {/* A standing label, not a placeholder. The placeholder vanishes the
              moment a figure is typed, which left an unlabelled box sitting
              between the items and the discount with no way to tell what the
              number in it meant. */}
          <label
            htmlFor="manual-order-shipping"
            style={{ display: 'block', color: '#cbd5e1', fontSize: '.72rem', fontWeight: 800, margin: '4px 0 6px' }}
          >
            Shipping fee ({form.currency === 'USD' ? '$ USD' : '₡ CRC'}) — leave 0 for free shipping
          </label>
          <input
            id="manual-order-shipping"
            className="admin-input"
            type="number"
            min="0"
            step={form.currency === 'USD' ? '0.01' : '1'}
            placeholder={form.currency === 'USD' ? 'Shipping fee in USD' : 'Shipping fee in CRC'}
            value={form.currency === 'USD' ? form.shipping_cost_usd : form.shipping_cost_crc}
            onChange={(e) => setForm({
              ...form,
              [form.currency === 'USD' ? 'shipping_cost_usd' : 'shipping_cost_crc']: e.target.value,
            })}
          />

          {/* The negotiated discount, entered before the order is saved rather
              than after it. Bulk buyers agree their price on the phone; when
              the only place to record it was the order detail panel, the
              customer's confirmation went out at the undiscounted price and
              their receipt was wrong from the moment it arrived. */}
          <div style={{
            marginTop: '12px',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            background: 'rgba(56, 189, 248, 0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px', color: '#e2e8f0', fontWeight: 800, fontSize: '0.85rem' }}>
              <BadgePercent size={16} /> Order discount
            </div>
            {/* Two columns, with the reason on its own row underneath. The
                order panel's three-across layout has the width for it; this
                modal does not, and it clipped every one of the three labels. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px' }}>
              <select
                className="admin-select"
                value={form.manual_discount_type}
                onChange={(e) => setForm({ ...form, manual_discount_type: e.target.value })}
              >
                <option value="none">No manual discount</option>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <input
                className="admin-input"
                type="number"
                min="0"
                max={form.manual_discount_type === 'percentage' ? '100' : undefined}
                step={form.manual_discount_type === 'percentage' ? '0.1' : (form.currency === 'USD' ? '0.01' : '1')}
                value={form.manual_discount_value}
                onChange={(e) => setForm({ ...form, manual_discount_value: e.target.value })}
                disabled={!manualDiscountType}
                placeholder={form.manual_discount_type === 'percentage' ? 'Percent' : `Amount ${form.currency}`}
              />
              <input
                className="admin-input"
                style={{ gridColumn: '1 / -1' }}
                value={form.manual_discount_reason}
                maxLength={200}
                onChange={(e) => setForm({ ...form, manual_discount_reason: e.target.value })}
                disabled={!manualDiscountType}
                placeholder="Reason shown on receipt (optional)"
              />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
              Applied after volume and promo discounts, before shipping. The reason appears on the customer&apos;s receipt.
            </p>
          </div>

          <div className="order-detail-totals" style={{ marginTop: '12px' }}>
            <div><span>Items subtotal</span><span>{money(itemsSubtotal)}</span></div>
            {discountPct > 0 && (
              <div style={{ color: '#16a34a' }}>
                <span>Volume discount ({discountPct}%)</span>
                <span>-{money(discountAmount)}</span>
              </div>
            )}
            {manualDiscountAmount > 0 && (
              <div style={{ color: '#c084fc' }}>
                <span>Order discount{form.manual_discount_reason.trim() ? ` (${form.manual_discount_reason.trim()})` : ''}</span>
                <span>-{money(manualDiscountAmount)}</span>
              </div>
            )}
            <div><span>Shipping</span><span>{shipping > 0 ? money(shipping) : 'FREE'}</span></div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#38bdf8' }}>
              <span>Total</span><span>{money(total)}</span>
            </div>
          </div>
          {form.promo_code.trim() && (
            <div style={{ color: '#7dd3fc', fontSize: '.7rem', marginTop: '6px' }}>
              Promo <strong>{form.promo_code.trim().toUpperCase()}</strong> is checked and priced when the order is saved, so its discount is not in the figures above.
            </div>
          )}

          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '9px',
            marginTop: '14px',
            padding: '11px 12px',
            borderRadius: '10px',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            background: 'rgba(148, 163, 184, 0.06)',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={form.notify_customer}
              onChange={(e) => setForm({ ...form, notify_customer: e.target.checked })}
              style={{ marginTop: '2px' }}
            />
            <span style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.45 }}>
              <strong>Email the customer their receipt</strong>
              <span style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem', marginTop: '2px' }}>
                {form.payment_method === 'card'
                  ? 'Card orders wait for the payment result before anything is sent to the customer.'
                  : form.notify_customer
                    ? 'They get the receipt and the WhatsApp confirmation, both showing the total above.'
                    : 'Nothing goes to the customer. Use this only when typing up an order they already received.'}
              </span>
            </span>
          </label>

          <h4 style={{ margin: '16px 0 8px', fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Internal</h4>
          {isSuperadmin && (
            <select
              className="admin-select"
              value={form.sales_agent}
              onChange={(e) => setForm({ ...form, sales_agent: e.target.value })}
              style={{ marginBottom: '8px' }}
            >
              <option value="">Credit this sale to… (nobody)</option>
              {/* `agents` is a list of plain names, not profile objects. */}
              {agents
                .map((agent) => String(agent || '').trim())
                .filter(Boolean)
                .map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          )}
          <textarea
            className="admin-input"
            placeholder="Internal notes (never shown to the customer)"
            rows={2}
            maxLength={2000}
            value={form.internal_notes}
            onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
          />

          {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}

          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving} style={{ width: '100%', marginTop: '12px' }}>
            {saving ? 'Saving…' : 'Create Order'}
          </button>
        </form>
      </div>
    </div>
  );
}
