import { orderDeliveryState, orderItems } from './customerOrderView.mjs';
import { isGiftLine } from './bacWater.mjs';

const HELP_TOPICS = ['order', 'shipping', 'payment', 'product', 'other'];

export function helpTopicSubject(topic) {
  const key = HELP_TOPICS.includes(topic) ? topic : '';
  if (!key) return '';
  const labels = {
    order: 'Account: Order issue',
    shipping: 'Account: Shipping issue',
    payment: 'Account: Payment issue',
    product: 'Account: Product question',
    other: 'Account: Other',
  };
  return labels[key];
}

export function stockAlertSubject(product) {
  const name = String(product || '').trim().slice(0, 120);
  if (!name) return '';
  return `Back in stock: ${name}`;
}

export function isCatalogOutOfStock(status) {
  const value = String(status || '').toLowerCase().trim();
  return value === 'out of stock' || value === 'agotado';
}

export function toggleFavorite(list, name) {
  const clean = String(name || '').trim();
  if (!clean) return Array.isArray(list) ? list : [];
  const current = Array.isArray(list) ? list.filter((item) => String(item || '').trim()) : [];
  const exists = current.some((item) => item.toLowerCase() === clean.toLowerCase());
  if (exists) return current.filter((item) => item.toLowerCase() !== clean.toLowerCase());
  return [clean, ...current];
}

export function purchasedProductNames(orders) {
  const seen = new Set();
  const names = [];
  for (const order of orders || []) {
    for (const item of orderItems(order)) {
      if (isGiftLine(item) || !item?.product) continue;
      const name = String(item.product).trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

export function orderNotifications(orders, lang = 'es') {
  const isEn = lang === 'en';
  const rows = [];
  for (const order of orders || []) {
    const number = String(order?.order_number || '').trim();
    if (!number) continue;
    const id = order.id || number;
    rows.push({
      id: `${id}-placed`,
      text: isEn ? `Order ${number} was placed` : `El pedido ${number} fue realizado`,
    });
    const delivery = orderDeliveryState(order);
    if (delivery === 'shipped' || delivery === 'delivered') {
      rows.push({
        id: `${id}-shipped`,
        text: isEn ? `Order ${number} shipped` : `El pedido ${number} fue enviado`,
      });
    }
    if (delivery === 'delivered') {
      rows.push({
        id: `${id}-delivered`,
        text: isEn ? `Order ${number} was delivered` : `El pedido ${number} fue entregado`,
      });
    }
  }
  return rows;
}
