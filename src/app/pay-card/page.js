'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CreditCard, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

function formatMoney(value, currency = 'USD') {
  const amount = Number(value || 0);
  if (currency === 'CRC') return `CRC ${Math.round(amount).toLocaleString('en-US')}`;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CardPaymentContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('order') || '';
  const token = searchParams.get('token') || '';
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [form, setForm] = useState({
    holder: '',
    number: '',
    expiry: '',
    cvv: '',
    email: '',
  });

  const lang = useMemo(() => (order?.currency === 'CRC' ? 'es' : 'en'), [order?.currency]);
  const isEn = lang === 'en';

  useEffect(() => {
    let cancelled = false;

    async function loadOrder() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ order: orderNumber, token });
        const res = await fetch(`/api/card-payment-link/order?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Payment link could not be loaded');
        if (cancelled) return;
        setOrder(data.order);
        setForm(prev => ({
          ...prev,
          holder: prev.holder || data.order.customerName || '',
          email: data.order.customerEmail || '',
        }));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (!orderNumber || !token) {
      setError('Invalid payment link');
      setLoading(false);
      return () => {};
    }

    loadOrder();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, token]);

  const updateCardNumber = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 19);
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
    setForm(prev => ({ ...prev, number: formatted }));
  };

  const updateExpiry = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    const expiry = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    setForm(prev => ({ ...prev, expiry }));
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    setError('');

    const cleanCardNumber = form.number.replace(/\D/g, '');
    const cleanCvv = form.cvv.replace(/\D/g, '');
    if (!form.holder.trim() || cleanCardNumber.length < 12 || !form.expiry.trim() || cleanCvv.length < 3 || !form.email.trim()) {
      setError(isEn ? 'Please enter complete card and email details.' : 'Ingrese los datos completos de tarjeta y correo.');
      return;
    }

    setPaying(true);
    try {
      const res = await fetch('/api/card-payment-link/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber,
          token,
          lang,
          customerEmail: form.email.trim(),
          card: {
            holder: form.holder,
            number: form.number,
            expiry: form.expiry,
            cvv: form.cvv,
          },
        }),
      });
      const data = await res.json();

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || (isEn ? 'Card payment failed' : 'El pago con tarjeta falló'));
      }

      setPaid(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <main className="card-pay-page">
      <section className="card-pay-shell">
        <div className="card-pay-brand">
          <img src="/logo.png" alt="Peptides Costa Rica" />
          <span>{isEn ? 'Secure card payment' : 'Pago seguro con tarjeta'}</span>
        </div>

        {loading ? (
          <div className="card-pay-panel">
            <p className="card-pay-muted">{isEn ? 'Loading payment link...' : 'Cargando enlace de pago...'}</p>
          </div>
        ) : error && !order ? (
          <div className="card-pay-panel card-pay-message">
            <AlertCircle size={28} />
            <h1>{isEn ? 'Payment link unavailable' : 'Enlace de pago no disponible'}</h1>
            <p>{error}</p>
            <Link href="/catalog">{isEn ? 'Return to catalog' : 'Volver al catálogo'}</Link>
          </div>
        ) : paid ? (
          <div className="card-pay-panel card-pay-message card-pay-success">
            <CheckCircle2 size={34} />
            <h1>{isEn ? 'Payment received' : 'Pago recibido'}</h1>
            <p>
              {isEn
                ? `Thank you. Your payment for order ${order.orderNumber} was approved.`
                : `Gracias. Su pago para la orden ${order.orderNumber} fue aprobado.`}
            </p>
            <Link href={`/thank-you?lang=${lang}&order=${encodeURIComponent(order.orderNumber)}`}>
              {isEn ? 'View confirmation' : 'Ver confirmación'}
            </Link>
          </div>
        ) : (
          <div className="card-pay-grid">
            <aside className="card-pay-panel card-pay-summary">
              <p className="card-pay-kicker">{isEn ? 'Order summary' : 'Resumen de orden'}</p>
              <h1>#{order.orderNumber}</h1>
              <div className="card-pay-customer">{order.customerName || (isEn ? 'Customer' : 'Cliente')}</div>
              <div className="card-pay-items">
                {(order.items || []).map((item, index) => (
                  <div key={`${item.product}-${index}`}>
                    <span>{item.product}</span>
                    <strong>x{item.qty}</strong>
                  </div>
                ))}
              </div>
              <div className="card-pay-total-row">
                <span>{isEn ? 'Card charge' : 'Cargo a tarjeta'}</span>
                <strong>{formatMoney(order.cardAmountUsd, 'USD')}</strong>
              </div>
              {order.currency === 'CRC' && (
                <p className="card-pay-muted">
                  {isEn ? 'Order total' : 'Total de la orden'}: {formatMoney(order.totalCrc, 'CRC')}
                </p>
              )}
              <p className="card-pay-note">
                <Lock size={14} />
                {isEn
                  ? 'Card details are processed by Shield Hub Pay and are not stored by Costa Peptides.'
                  : 'Los datos de tarjeta son procesados por Shield Hub Pay y no se almacenan en Costa Peptides.'}
              </p>
            </aside>

            <form className="card-pay-panel card-pay-form" onSubmit={submitPayment}>
              <div className="card-pay-form-title">
                <CreditCard size={20} />
                <h2>{isEn ? 'Card details' : 'Datos de tarjeta'}</h2>
              </div>
              <label>
                <span>{isEn ? 'Email for receipt' : 'Correo para recibo'}</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </label>
              <label>
                <span>{isEn ? 'Name on card' : 'Nombre en la tarjeta'}</span>
                <input
                  type="text"
                  autoComplete="cc-name"
                  value={form.holder}
                  onChange={(e) => setForm(prev => ({ ...prev, holder: e.target.value }))}
                  required
                />
              </label>
              <label>
                <span>{isEn ? 'Card number' : 'Numero de tarjeta'}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={form.number}
                  onChange={(e) => updateCardNumber(e.target.value)}
                  required
                />
              </label>
              <div className="card-pay-row">
                <label>
                  <span>{isEn ? 'Expiry' : 'Vence'}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    value={form.expiry}
                    onChange={(e) => updateExpiry(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>CVV</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    value={form.cvv}
                    onChange={(e) => setForm(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    required
                  />
                </label>
              </div>

              {error && (
                <div className="card-pay-error">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <button type="submit" disabled={paying}>
                {paying
                  ? (isEn ? 'Processing...' : 'Procesando...')
                  : `${isEn ? 'Pay' : 'Pagar'} ${formatMoney(order.cardAmountUsd, 'USD')}`}
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}

export default function CardPaymentPage() {
  return (
    <Suspense fallback={<main className="card-pay-page"><section className="card-pay-shell"><div className="card-pay-panel">Loading...</div></section></main>}>
      <CardPaymentContent />
    </Suspense>
  );
}
