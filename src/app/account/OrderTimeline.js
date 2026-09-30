import { orderDeliveryDate, orderTimeline } from '@/lib/customerOrderView.mjs';
import { CORREOS_TRACKING_URL, hasTrackingNumber } from '@/lib/correosTracking.mjs';

const COMPACT_LABELS = {
  placed: { en: 'Placed', es: 'Pedido' },
  paid: { en: 'Paid', es: 'Pagado' },
  preparing: { en: 'Packing', es: 'Empaque' },
  shipped: { en: 'Shipped', es: 'Enviado' },
  delivered: { en: 'Delivered', es: 'Entregado' },
  failed: { en: 'Failed', es: 'Rechazado' },
  cancelled: { en: 'Cancelled', es: 'Cancelado' },
  refunded: { en: 'Refunded', es: 'Reembolso' },
};

/** Where this order is, in the stages the shop can actually see. */
export default function OrderTimeline({ order, lang = 'es', compact = false }) {
  const isEn = lang === 'en';
  const timeline = orderTimeline(order, lang);
  const tracking = hasTrackingNumber(order?.tracking_number)
    ? String(order.tracking_number).trim()
    : '';
  const showTracking = Boolean(tracking) && !timeline.stopped && timeline.steps.some((step) => (
    step.id === 'shipped' && step.state !== 'upcoming'
  ));

  return (
    <div className={compact ? 'order-timeline-wrap is-compact' : 'order-timeline-wrap'}>
      <ol className="order-timeline" aria-label={isEn ? 'Order progress' : 'Avance del pedido'}>
        {timeline.steps.map((step) => (
          <li key={step.id} className={`is-${step.state}`}>
            <span className="order-timeline-mark" aria-hidden="true" />
            <span className="order-timeline-label">
              {compact ? (COMPACT_LABELS[step.id]?.[isEn ? 'en' : 'es'] || step.label) : step.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="order-delivery-date">
        <span>{isEn ? 'Delivery date' : 'Fecha de entrega'}</span>
        <b>{orderDeliveryDate(order, lang)}</b>
      </p>
      {showTracking ? (
        <p className="order-timeline-track">
          <span className="account-tracking">{tracking}</span>
          {' · '}
          <a className="account-track-link" href={CORREOS_TRACKING_URL} target="_blank" rel="noopener noreferrer">
            {isEn ? 'Track on Correos' : 'Rastrear en Correos'}
          </a>
        </p>
      ) : null}
    </div>
  );
}
