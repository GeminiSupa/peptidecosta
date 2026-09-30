// What the account home can show a signed-in customer.
//
// A stock-refill countdown and a count of paid orders by month. Not a dose
// clock and not a health chart. The questions are who the account is for.

import { isoToCrWall } from './crTime.mjs';
import { isPaidLike } from './orderStatusEmails.mjs';
import { REFILL_AFTER_DAYS } from './refillReminder.mjs';

export const ACCOUNT_KINDS = [
  { id: 'researcher', en: 'Researcher', es: 'Investigador' },
  { id: 'pharmacy', en: 'Pharmacy', es: 'Farmacia' },
  { id: 'clinic', en: 'Clinic', es: 'Clínica' },
  { id: 'other', en: 'Other', es: 'Otro' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function isAccountKind(value) {
  return ACCOUNT_KINDS.some((kind) => kind.id === value);
}

export function accountKindLabel(value, lang = 'es') {
  const kind = ACCOUNT_KINDS.find((item) => item.id === value);
  if (!kind) return '';
  return lang === 'en' ? kind.en : kind.es;
}

function crMonthKey(iso) {
  const wall = isoToCrWall(iso);
  return wall ? wall.slice(0, 7) : '';
}

function shiftMonth(year, month, delta) {
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return { year: nextYear, month: nextMonth };
}

/** Newest paid order, or null. */
export function latestPaidOrder(orders = []) {
  let latest = null;
  for (const order of orders || []) {
    if (!isPaidLike(order?.status) || !order?.created_at) continue;
    if (!latest || Date.parse(order.created_at) > Date.parse(latest.created_at)) latest = order;
  }
  return latest;
}

/**
 * Days until the stock-refill email for the newest paid order.
 * `days` is 0 when that email is due. Null when there is no paid order.
 */
export function refillCountdown(orders = [], now = new Date()) {
  const order = latestPaidOrder(orders);
  if (!order) return null;

  const placed = Date.parse(order.created_at);
  if (!Number.isFinite(placed)) return null;

  const dueAt = placed + REFILL_AFTER_DAYS * DAY_MS;
  const days = Math.max(0, Math.ceil((dueAt - now.getTime()) / DAY_MS));
  const elapsed = Math.min(REFILL_AFTER_DAYS, Math.max(0, REFILL_AFTER_DAYS - days));

  return {
    days,
    ready: days === 0,
    elapsed,
    total: REFILL_AFTER_DAYS,
    orderNumber: order.order_number || '',
    placedAt: order.created_at,
  };
}

/** Paid-order counts for the last few Costa Rica months, oldest first. */
export function orderMonthCounts(orders = [], now = new Date(), months = 6) {
  const wall = isoToCrWall(now.toISOString());
  const year = Number(wall.slice(0, 4));
  const month = Number(wall.slice(5, 7));
  const slots = [];

  for (let back = months - 1; back >= 0; back -= 1) {
    const shifted = shiftMonth(year, month, -back);
    const key = `${shifted.year}-${String(shifted.month).padStart(2, '0')}`;
    slots.push({ key, count: 0 });
  }

  const index = new Map(slots.map((slot) => [slot.key, slot]));
  for (const order of orders || []) {
    if (!isPaidLike(order?.status)) continue;
    const slot = index.get(crMonthKey(order.created_at));
    if (slot) slot.count += 1;
  }

  return slots;
}
