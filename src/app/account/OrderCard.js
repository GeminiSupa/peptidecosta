'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  formatOrderDate,
  formatOrderTotal,
  orderItems,
  billableItemCount,
} from '@/lib/customerOrderView.mjs';
import { stashReorder } from '@/lib/reorderHandoff';
import { isGiftLine } from '@/lib/bacWater.mjs';
import ProductFace from './ProductFace';
import OrderTimeline from './OrderTimeline';

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
      </Link>
      <OrderTimeline order={order} lang={lang} compact />

      {buyAgain.length > 0 ? (
        <ul className="shop-lines">
          {buyAgain.slice(0, 4).map((item, index) => (
            <li key={`${item.product}-${index}`}>
              <ProductFace name={item.product} />
              <span className="shop-buy-copy">
                <strong>{item.product}</strong>
                <span className="account-muted">× {item.qty}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {itemCount > 0 ? (
        <button type="button" className="account-btn-primary" onClick={reorder}>
          {isEn ? 'Buy again' : 'Comprar de nuevo'}
        </button>
      ) : null}
    </article>
  );
}
