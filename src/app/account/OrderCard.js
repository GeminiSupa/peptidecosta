'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  badgeTone,
  deliveryLabel,
  formatOrderDate,
  formatOrderTotal,
  orderDeliveryState,
  orderItems,
  orderPaymentState,
  paymentLabel,
  billableItemCount,
} from '@/lib/customerOrderView.mjs';
import { stashReorder } from '@/lib/reorderHandoff';

/** One row in the order list: number, date, status, total, and a reorder action. */
export default function OrderCard({ order, lang = 'es' }) {
  const router = useRouter();
  const isEn = lang === 'en';
  const items = orderItems(order, lang);
  const itemCount = billableItemCount(items);

  const reorder = () => {
    if (stashReorder({ ...order, items })) router.push(`/catalog?reorder=1&lang=${lang}`);
  };

  return (
    <div className="account-order">
      <div>
        <Link href={`/account/orders/${encodeURIComponent(order.order_number)}`} className="account-order-number">
          {order.order_number}
        </Link>
        <div className="account-order-meta">
          {formatOrderDate(order.created_at, lang)}
          {' · '}
          {itemCount}
          {' '}
          {itemCount === 1
            ? (isEn ? 'item' : 'artículo')
            : (isEn ? 'items' : 'artículos')}
        </div>
        <div className="account-badges">
          <span className={`account-badge ${badgeTone(orderPaymentState(order))}`}>
            {paymentLabel(order, lang)}
          </span>
          <span className={`account-badge ${badgeTone(orderDeliveryState(order))}`}>
            {deliveryLabel(order, lang)}
          </span>
        </div>
        {order.tracking_number ? (
          <div className="account-order-meta">
            {isEn ? 'Tracking: ' : 'Seguimiento: '}
            <span className="account-tracking">{order.tracking_number}</span>
          </div>
        ) : null}
      </div>

      <div>
        <div className="account-order-total">{formatOrderTotal(order)}</div>
        {itemCount > 0 ? (
          <button
            type="button"
            className="account-btn-secondary"
            style={{ marginTop: 8 }}
            onClick={reorder}
          >
            {isEn ? 'Order again' : 'Pedir de nuevo'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
