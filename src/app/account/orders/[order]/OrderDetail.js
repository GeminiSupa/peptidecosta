'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import AccountShell from '../../AccountShell';
import { getCustomerSupabase } from '@/lib/customerSupabase';
import { useCustomerSession, useStorefrontLang } from '@/hooks/useCustomerSession';
import {
  badgeTone,
  deliveryLabel,
  formatItemPrice,
  formatOrderDate,
  formatOrderTotal,
  orderDeliveryState,
  orderItems,
  orderPaymentState,
  paymentLabel,
  billableItemCount,
} from '@/lib/customerOrderView.mjs';
import { isGiftLine } from '@/lib/bacWater.mjs';
import { stashReorder } from '@/lib/reorderHandoff';

export default function OrderDetail({ orderNumber }) {
  const router = useRouter();
  const [lang] = useStorefrontLang();
  const { user } = useCustomerSession();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const isEn = lang === 'en';

  useEffect(() => {
    if (!user) return;

    const supabase = getCustomerSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    // Filtering by order number alone is safe: the customer's own JWT travels
    // with the request, so orders_customer_read_own still limits the result to
    // rows they own. Someone else's order number simply returns nothing.
    supabase
      .from('orders')
      .select('id,order_number,created_at,status,tracking_number,items,total_usd,total_crc,currency,payment_method,shipping_address,customer_name,customer_phone')
      .eq('order_number', orderNumber)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setOrder(data || null);
        setLoading(false);
      });

    return () => { active = false; };
  }, [user, orderNumber]);

  const [productCoas, setProductCoas] = useState({});

  useEffect(() => {
    const supabase = getCustomerSupabase();
    if (!supabase) return;
    supabase
      .from('products')
      .select('product, coa')
      .not('coa', 'is', null)
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        data.forEach((p) => {
          if (p.product && p.coa && p.coa.trim() !== '') {
            map[p.product.toLowerCase().trim()] = p.coa.trim();
          }
        });
        setProductCoas(map);
      });
  }, []);

  const items = orderItems(order, lang);
  const itemCount = billableItemCount(items);

  const reorder = () => {
    if (stashReorder({ ...order, items })) router.push(`/catalog?reorder=1&lang=${lang}`);
  };

  return (
    <AccountShell title={{ en: `Order ${orderNumber}`, es: `Pedido ${orderNumber}` }}>
      <p style={{ marginTop: -8, marginBottom: 16 }}>
        <Link href="/account/orders" className="account-btn-link">
          {isEn ? '← All orders' : '← Todos los pedidos'}
        </Link>
      </p>

      {loading ? (
        <div className="account-card account-empty">{isEn ? 'Loading…' : 'Cargando…'}</div>
      ) : !order ? (
        <div className="account-card account-empty">
          {isEn
            ? 'We could not find that order on your account.'
            : 'No encontramos ese pedido en su cuenta.'}
        </div>
      ) : (
        <>
          <div className="shop-order">
            <div className="account-badges">
              <span className={`account-badge ${badgeTone(orderPaymentState(order))}`}>
                {paymentLabel(order, lang)}
              </span>
              <span className={`account-badge ${badgeTone(orderDeliveryState(order))}`}>
                {deliveryLabel(order, lang)}
              </span>
            </div>
            <p className="account-muted" style={{ marginTop: 12, marginBottom: 0 }}>
              {isEn ? 'Placed ' : 'Realizado el '}
              {formatOrderDate(order.created_at, lang)}
            </p>
            {order.tracking_number ? (
              <p style={{ marginTop: 10, marginBottom: 0 }}>
                <span className="account-muted">{isEn ? 'Tracking: ' : 'Seguimiento: '}</span>
                <span className="account-tracking">{order.tracking_number}</span>
              </p>
            ) : null}

            <ul className="shop-lines">
              {items.map((item, index) => {
                const coaUrl = item?.coa || productCoas[String(item?.product || '').toLowerCase().trim()];
                const validCoaUrl = coaUrl && coaUrl !== '—' && String(coaUrl).trim() !== ''
                  ? (String(coaUrl).startsWith('http') ? coaUrl : `https://${coaUrl}`)
                  : null;
                const label = String(item?.product || '').trim();

                return (
                  <li key={`${label}-${index}`}>
                    <span className="shop-thumb">{label.charAt(0).toUpperCase() || '•'}</span>
                    <span className="shop-buy-copy">
                      <strong>{label}</strong>
                      <span className="account-muted">
                        × {item?.qty}
                        {' · '}
                        {isGiftLine(item) ? (isEn ? 'Free' : 'Gratis') : formatItemPrice(item?.price, order.currency)}
                      </span>
                      {validCoaUrl ? (
                        <a
                          href={validCoaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="account-btn-link"
                          style={{ fontSize: '0.78rem' }}
                        >
                          {isEn ? 'Lab paper (COA)' : 'Papel de laboratorio (COA)'}
                        </a>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p style={{ marginTop: 14, marginBottom: 0, fontWeight: 800, fontSize: '1.05rem' }}>
              {isEn ? 'Total ' : 'Total '}
              {formatOrderTotal(order)}
            </p>

            {itemCount > 0 ? (
              <>
                <button type="button" className="account-btn-primary" onClick={reorder}>
                  {isEn ? 'Buy again' : 'Comprar de nuevo'}
                </button>
                <span className="account-muted" style={{ display: 'block', marginTop: 8, fontSize: '0.8rem' }}>
                  {isEn
                    ? 'Added to your cart at today’s prices.'
                    : 'Se agrega al carrito con los precios de hoy.'}
                </span>
              </>
            ) : null}
          </div>

          {order.shipping_address ? (
            <div className="shop-order">
              <h2 className="shop-section-title" style={{ marginTop: 0 }}>{isEn ? 'Ships to' : 'Envío a'}</h2>
              <p className="account-muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {order.customer_name ? `${order.customer_name}\n` : ''}
                {order.shipping_address}
              </p>
            </div>
          ) : null}
        </>
      )}
    </AccountShell>
  );
}
