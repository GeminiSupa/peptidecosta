// Turning internal order state into something a customer can read.
//
// orders.status is one operational field that mixes two questions the customer
// actually asks: has my money gone through, and where is my package. "Pending -
// Card 3DS" answers the first and says nothing about the second; "Order
// Complete" answers both. So the dashboard derives two independent states from
// it rather than showing the raw value, which would otherwise leak internal
// vocabulary ("Error", "Declined") onto the storefront.
//
// The status vocabulary is the one the admin dashboard writes — see
// ORDER_STATUS_OPTIONS in src/components/admin/OrdersManager.js.

const NEEDS_PAYMENT = ['pending', 'payment pending', 'pending - card', 'pending - card 3ds'];
const REFUNDED = 'refunded';
const PARTLY_REFUNDED = 'partly refunded';
const FAILED = ['declined', 'error'];
const COMPLETE = ['order complete', 'completed'];
const SETTLED = ['paid', 'processing', ...COMPLETE];

function key(status) {
  return String(status ?? '').trim().toLowerCase();
}

import { isGiftLine, withBacGiftLines } from './bacWater.mjs';

export function orderPaymentState(order) {
  const status = key(order?.status);
  if (status === 'cancelled') return 'cancelled';
  // Named before anything else, because neither word appears in the sets below:
  // a refunded order used to fall past all of them to the catch-all and tell a
  // customer who had just been paid back that their payment was still pending.
  if (status === REFUNDED) return 'refunded';
  if (status === PARTLY_REFUNDED) return 'partly_refunded';
  if (FAILED.includes(status)) return 'failed';
  if (SETTLED.includes(status)) return 'paid';
  if (NEEDS_PAYMENT.includes(status)) return 'pending';
  return 'pending';
}

/**
 * Delivery progress.
 *
 * A tracking number is the strongest available signal that a parcel is moving —
 * it is only ever written when the order is dispatched — so it outranks the
 * status field for everything short of a completed or cancelled order.
 */
export function orderDeliveryState(order) {
  const status = key(order?.status);
  if (status === 'cancelled') return 'cancelled';
  // A full refund reverses the order; a partial one does not — the customer
  // kept goods, so the parcel still has a real state. The refund overwrote the
  // status that would have said which, so the tracking number decides, and
  // anything else is "being handled" rather than "awaiting your payment".
  if (status === REFUNDED) return 'cancelled';
  if (status === PARTLY_REFUNDED) {
    return String(order?.tracking_number || '').trim() ? 'shipped' : 'preparing';
  }
  if (COMPLETE.includes(status)) return 'delivered';
  if (String(order?.tracking_number || '').trim()) return 'shipped';
  if (status === 'processing' || status === 'paid') return 'preparing';
  return 'awaiting_payment';
}

const PAYMENT_LABELS = {
  paid: { en: 'Paid', es: 'Pagado' },
  pending: { en: 'Payment pending', es: 'Pago pendiente' },
  failed: { en: 'Payment failed', es: 'Pago rechazado' },
  cancelled: { en: 'Cancelled', es: 'Cancelado' },
  refunded: { en: 'Refunded', es: 'Reembolsado' },
  partly_refunded: { en: 'Partly refunded', es: 'Reembolso parcial' },
};

const DELIVERY_LABELS = {
  delivered: { en: 'Delivered', es: 'Entregado' },
  shipped: { en: 'Shipped', es: 'Enviado' },
  preparing: { en: 'Preparing', es: 'En preparación' },
  awaiting_payment: { en: 'Not shipped yet', es: 'Aún no enviado' },
  cancelled: { en: 'Cancelled', es: 'Cancelado' },
};

const BADGE_TONES = {
  paid: 'is-paid',
  delivered: 'is-paid',
  shipped: 'is-shipped',
  preparing: 'is-shipped',
  pending: 'is-pending',
  awaiting_payment: 'is-pending',
  failed: 'is-cancelled',
  cancelled: 'is-cancelled',
  refunded: 'is-cancelled',
  partly_refunded: 'is-shipped',
};

export function paymentLabel(order, lang = 'es') {
  const state = orderPaymentState(order);
  return PAYMENT_LABELS[state][lang === 'en' ? 'en' : 'es'];
}

export function deliveryLabel(order, lang = 'es') {
  const state = orderDeliveryState(order);
  return DELIVERY_LABELS[state][lang === 'en' ? 'en' : 'es'];
}

export function badgeTone(state) {
  return BADGE_TONES[state] || '';
}

/**
 * The total as the customer was charged it.
 *
 * Orders store both currencies, but only the one in `currency` is what they
 * actually paid; showing the converted figure would contradict their receipt.
 */
export function formatOrderTotal(order) {
  const currency = String(order?.currency || 'CRC').toUpperCase();

  if (currency === 'USD') {
    const usd = Number(order?.total_usd);
    if (!Number.isFinite(usd) || usd <= 0) return '—';
    return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const crc = Number(order?.total_crc);
  if (!Number.isFinite(crc) || crc <= 0) return '—';
  return `₡${Math.round(crc).toLocaleString('en-US')}`;
}

/** Line price in the order's own currency, for the item table. */
export function formatItemPrice(price, currency) {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return '—';
  if (amount === 0) return '—';
  return String(currency || 'CRC').toUpperCase() === 'USD'
    ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₡${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatOrderDate(value, lang = 'es') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Items are JSONB and older rows predate the current shape — read defensively. */
function parseOrderItems(order) {
  const items = order?.items;
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * The order's lines as the customer should see them, free vials included.
 *
 * The gift is one 3ml vial per peptide and it ships whether or not the stored
 * row lists it — orders taken by an agent, and everything placed before the
 * gift became an explicit line, never had one written down. Showing the box as
 * the customer will receive it means filling that in here rather than leaving
 * their own history disagreeing with what arrived.
 */
export function orderItems(order, lang = 'es') {
  return withBacGiftLines(parseOrderItems(order), lang);
}

/**
 * How many items an order is said to contain.
 *
 * Free vials are listed but not counted: "2 artículos" is what the customer
 * chose and paid for, and re-counting a gift they never added would change the
 * number every past order has always shown them.
 */
export function billableItemCount(items = []) {
  return (items || []).filter((item) => !isGiftLine(item)).length;
}
