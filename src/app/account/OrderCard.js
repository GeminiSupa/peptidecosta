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
import { isGiftLine } from '@/lib/bacWater.mjs';
import { CORREOS_TRACKING_URL, hasTrackingNumber } from '@/lib/correosTracking.mjs';

/** One past order, shown like a product card with a buy-again button. */
export default function OrderCard({ order, lang = 'es' }) {
  const router = useRouter();
  const isEn = lang === 'en';
  const items = orderItems(order, lang);
  const itemCount = billableItemCount(items);
  const buyAgain = items.filter((item) => !isGiftLine(item) && item?.product);

  const reorder = () => {
    if (stashReorder({ ...order, items })) router.push(`/catalog?reorder=1&lang=${lang}`);
  };

  return (
    <article className="shop-order">
      <Link href={`/account/orders/${encodeURIComponent(order.order_number)}`} className="shop-order-top">
        <div>
          <div className="account-order-number">{order.order_number}</div>
          <div className="account-order-meta">
            {formatOrderDate(order.created_at, lang)}
            {' · '}
            {formatOrderTotal(order)}
          </div>
        </div>
        <span className={`account-badge ${badgeTone(orderDeliveryState(order) === 'shipped' ? orderDeliveryState(order) : orderPaymentState(order))}`}>
          {orderDeliveryState(order) === 'shipped' ? deliveryLabel(order, lang) : paymentLabel(order, lang)}
        </span>
      </Link>

      {buyAgain.length > 0 ? (
        <ul className="shop-lines">
          {buyAgain.slice(0, 4).map((item, index) => (
            <li key={`${item.product}-${index}`}>
              <span className="shop-thumb">{String(item.product).trim().charAt(0).toUpperCase()}</span>
              <span className="shop-buy-copy">
                <strong>{item.product}</strong>
                <span className="account-muted">× {item.qty}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {hasTrackingNumber(order.tracking_number) ? (
        <div className="account-order-meta" style={{ marginTop: 8 }}>
          <a className="account-track-link" href={CORREOS_TRACKING_URL} target="_blank" rel="noopener noreferrer">
            {isEn ? 'Track package' : 'Rastrear paquete'}
          </a>
        </div>
      ) : null}

      {itemCount > 0 ? (
        <button type="button" className="account-btn-primary" onClick={reorder}>
          {isEn ? 'Buy again' : 'Comprar de nuevo'}
        </button>
      ) : null}
    </article>
  );
}
