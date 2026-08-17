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
} from '@/lib/customerOrderView.mjs';
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

  const items = orderItems(order);

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
          <div className="account-card">
            <h2>{isEn ? 'Status' : 'Estado'}</h2>
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
                <span className="account-muted">{isEn ? 'Tracking number: ' : 'Número de seguimiento: '}</span>
                <span className="account-tracking">{order.tracking_number}</span>
              </p>
            ) : null}
          </div>

          <div className="account-card">
            <h2>{isEn ? 'Items' : 'Artículos'}</h2>
            <table className="account-items">
              <thead>
                <tr>
                  <th>{isEn ? 'Product' : 'Producto'}</th>
                  <th>{isEn ? 'Qty' : 'Cant.'}</th>
                  <th>{isEn ? 'Price' : 'Precio'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item?.product}-${index}`}>
                    <td>{item?.product}</td>
                    <td>{item?.qty}</td>
                    <td>{formatItemPrice(item?.price, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ marginTop: 14, marginBottom: 0, textAlign: 'right', fontWeight: 700 }}>
              {isEn ? 'Total: ' : 'Total: '}
              {formatOrderTotal(order)}
            </p>

            {items.length > 0 ? (
              <p style={{ marginTop: 14, marginBottom: 0 }}>
                <button type="button" className="account-btn-secondary" onClick={reorder}>
                  {isEn ? 'Order again' : 'Pedir de nuevo'}
                </button>
                <span className="account-muted" style={{ display: 'block', marginTop: 8, fontSize: '0.8rem' }}>
                  {isEn
                    ? 'Items are added to your cart at today’s prices and availability.'
                    : 'Los artículos se agregan a su carrito con los precios y la disponibilidad de hoy.'}
                </span>
              </p>
            ) : null}
          </div>

          {order.shipping_address ? (
            <div className="account-card">
              <h2>{isEn ? 'Delivery' : 'Entrega'}</h2>
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
