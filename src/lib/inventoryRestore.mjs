// Putting stock back when a sale does not happen.
//
// Inventory is deducted the moment an order is placed, which is what Joe asked
// for — reserving the vials stops two customers being sold the last one. But
// nothing ever added it back. A cancelled, declined or abandoned order kept its
// stock reserved forever, so the count drifted down until the catalog showed
// "Out of Stock" for vials sitting on the shelf.
//
// Two things have to be true for a restore to be safe:
//
//   1. It must return exactly what was taken. The deduction clamps at zero
//      (Math.max(0, current - qty)), so an order for 5 against a stock of 2
//      only ever removed 2. Adding 5 back would invent three vials. What was
//      actually deducted is therefore recorded on the order at deduction time,
//      and that record — not the order's quantities — is what gets returned.
//   2. It must happen once. A cancelled order that is re-saved, or picked up by
//      the expiry cron after being cancelled by hand, must not pay out twice.
//      inventory_restored_at is the guard.

/** Statuses where the sale is off and the stock belongs back on the shelf. */
export const RESTORE_STATUSES = [
  'cancelled',
  'declined',
  'payment blocked',
  'error',
];

/**
 * Statuses an unpaid order can sit in while it waits for money.
 *
 * These are the only ones the expiry cron may touch. Anything further along has
 * either been paid or been dealt with by a human.
 */
export const EXPIRABLE_STATUSES = ['pending', 'payment pending', 'pending - card', 'pending - card 3ds'];

/**
 * How long an unpaid order holds its stock.
 *
 * 24 hours, chosen by Joe. Long enough for a bank transfer or a SINPE to land
 * overnight, short enough that a browser-abandoned card checkout is not still
 * holding the last vial the following day.
 */
export const STALE_ORDER_HOURS = 24;

/**
 * How far back the expiry sweep is allowed to reach.
 *
 * Without this the first run would have cancelled 89 live orders dating to
 * June — a three-month backlog of "Pending" and "Payment Pending" rows that
 * staff may still be chasing or that were settled offline and never updated.
 * A cron must not mass-close a ledger it has never seen before.
 *
 * In steady state the sweep only ever meets orders that just crossed 24 hours,
 * so this bound is invisible. It matters exactly twice: the first run, and the
 * first run after any extended downtime. Anything older is a human's decision.
 */
export const MAX_EXPIRY_AGE_DAYS = 7;

const normalize = (status) => String(status || '').trim().toLowerCase();

export function shouldRestoreForStatus(status) {
  return RESTORE_STATUSES.includes(normalize(status));
}

export function isExpirableStatus(status) {
  return EXPIRABLE_STATUSES.includes(normalize(status));
}

/** Orders created before this instant have held their stock long enough. */
export function staleOrderCutoff(now = new Date(), hours = STALE_ORDER_HOURS) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

/** Orders created before this instant are backlog, and the sweep leaves them. */
export function expiryFloor(now = new Date(), days = MAX_EXPIRY_AGE_DAYS) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Is this order inside the window the sweep may act on? */
export function isWithinExpiryWindow(order, now = new Date()) {
  const created = new Date(order?.created_at || 0).getTime();
  if (!Number.isFinite(created) || created === 0) return false;
  return created < staleOrderCutoff(now).getTime() && created > expiryFloor(now).getTime();
}

/** Already paid out — restoring again would invent stock. */
export function isAlreadyRestored(order) {
  return Boolean(order?.inventory_restored_at);
}

/**
 * What to put back, as [{ product, qty }].
 *
 * Prefers the record written at deduction time, which is the only version that
 * accounts for the zero-clamp. Falls back to the order's own quantities for
 * orders placed before that record existed — imperfect for the clamped case,
 * but far better than leaving their stock reserved forever.
 */
export function restorableQuantities(order) {
  const recorded = order?.inventory_deducted;
  const source = Array.isArray(recorded) && recorded.length > 0 ? recorded : order?.items;
  if (!Array.isArray(source)) return [];

  const totals = new Map();
  for (const entry of source) {
    const product = String(entry?.product || '').trim();
    const qty = Math.floor(Number(entry?.qty));
    if (!product || !Number.isFinite(qty) || qty <= 0) continue;
    // An order can list the same product twice; return the sum, once.
    totals.set(product, (totals.get(product) || 0) + qty);
  }

  return [...totals].map(([product, qty]) => ({ product, qty }));
}

/**
 * Decide whether an order's stock should be returned right now.
 *
 * @returns {{restore: boolean, reason: string}} reason is for the log line, so
 *          a skipped restore is as explainable as a performed one.
 */
export function planInventoryRestore(order) {
  if (!order) return { restore: false, reason: 'no order' };
  if (isAlreadyRestored(order)) return { restore: false, reason: 'already restored' };
  if (!shouldRestoreForStatus(order.status)) {
    return { restore: false, reason: `status "${order.status}" keeps its reservation` };
  }
  const lines = restorableQuantities(order);
  if (lines.length === 0) return { restore: false, reason: 'nothing to restore' };
  return { restore: true, reason: `returning ${lines.length} product line(s)`, lines };
}
/**
 * What is still owed back to the shelf on this order.
 *
 * A whole-order restore stamps inventory_restored_at and returns everything at
 * once, which is right for a cancellation and useless for a refund of one
 * bottle out of five. A partial refund instead names the bottles that came
 * back, and each one is recorded on its refund event — so this is the ordered
 * quantity minus everything earlier refunds already put back.
 *
 * Returns nothing once the whole order has been restored, because there is
 * then nothing left that could come back.
 */
export function restockableRemaining(order) {
  if (order?.inventory_restored_at) return [];

  const left = new Map(restorableQuantities(order).map((line) => [line.product, line.qty]));

  for (const event of Array.isArray(order?.refund_events) ? order.refund_events : []) {
    for (const line of Array.isArray(event?.restocked) ? event.restocked : []) {
      const product = String(line?.product || '').trim();
      const qty = Math.floor(Number(line?.qty));
      if (!product || !Number.isFinite(qty) || qty <= 0) continue;
      if (left.has(product)) left.set(product, Math.max(0, left.get(product) - qty));
    }
  }

  return [...left]
    .filter(([, qty]) => qty > 0)
    .map(([product, qty]) => ({ product, qty }));
}

/**
 * Clamp a requested restock to what the order can actually give back.
 *
 * The browser sends whatever the admin typed. Putting back more bottles than
 * were bought — or more than are left after an earlier partial refund — would
 * invent stock, and stock that exists only in the database is the failure that
 * ends with an order that cannot be shipped. Anything unknown or over the line
 * is dropped rather than rejected: the refund itself is the important half and
 * must not fail over a typo in an optional field.
 */
export function planPartialRestock(order, requested = []) {
  const allowed = new Map(restockableRemaining(order).map((line) => [line.product, line.qty]));
  const lines = [];

  for (const item of Array.isArray(requested) ? requested : []) {
    const product = String(item?.product || '').trim();
    const qty = Math.floor(Number(item?.qty));
    if (!product || !Number.isFinite(qty) || qty <= 0) continue;

    const take = Math.min(qty, allowed.get(product) || 0);
    if (take <= 0) continue;

    lines.push({ product, qty: take });
    allowed.set(product, (allowed.get(product) || 0) - take);
  }

  return lines;
}
