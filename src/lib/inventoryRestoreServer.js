import {
  expiryFloor,
  isExpirableStatus,
  isWithinExpiryWindow,
  planInventoryRestore,
  restorableQuantities,
  staleOrderCutoff,
  STALE_ORDER_HOURS,
} from './inventoryRestore.mjs';
import { writeDroppingMissingColumns } from './optionalColumns.mjs';

// The database half of the inventory restore. Kept apart from the rules in
// inventoryRestore.mjs so those stay testable without a Supabase client.

/** Products where inventory_count is null are not tracked and are skipped. */
async function addBackStock(supabase, lines) {
  const restored = [];

  for (const line of lines) {
    const { data: product, error } = await supabase
      .from('products')
      .select('inventory_count')
      .eq('product', line.product)
      .maybeSingle();

    if (error || !product || product.inventory_count === null) continue;

    const next = Number(product.inventory_count) + line.qty;
    const { error: updateError } = await supabase
      .from('products')
      .update({ inventory_count: next })
      .eq('product', line.product);

    if (updateError) {
      console.error(`[inventory] Failed to restore ${line.qty} × ${line.product}:`, updateError.message);
      continue;
    }
    restored.push({ product: line.product, qty: line.qty, from: product.inventory_count, to: next });
  }

  return restored;
}

/**
 * Return an order's reserved stock to the shelf. Idempotent.
 *
 * Stamps inventory_restored_at first so a concurrent caller — the admin panel
 * cancelling while the expiry cron is mid-sweep — cannot pay the stock out
 * twice. The stamp is conditional on the column still being null, so only one
 * of them wins the row.
 *
 * Never throws: inventory is worth fixing, never worth failing an admin action
 * or a cron sweep over.
 */
export async function restoreInventoryForOrder(supabase, order, { reason = 'status change' } = {}) {
  const plan = planInventoryRestore(order);
  if (!plan.restore) return { restored: false, skipped: plan.reason };

  try {
    // Claim the restore before doing it. A second caller matching zero rows
    // knows it lost the race and returns without touching stock.
    const { data: claimed, error: claimError } = await writeDroppingMissingColumns(
      { inventory_restored_at: new Date().toISOString() },
      [],
      (row) => supabase
        .from('orders')
        .update(row)
        .eq('id', order.id)
        .is('inventory_restored_at', null)
        .select('id'),
    );

    if (claimError) {
      console.error('[inventory] Could not claim restore for order', order.order_number, claimError.message);
      return { restored: false, skipped: 'claim failed', error: claimError.message };
    }
    if (!claimed || claimed.length === 0) {
      return { restored: false, skipped: 'already restored by another caller' };
    }

    const restored = await addBackStock(supabase, plan.lines);
    console.log(
      `[inventory] Restored stock for ${order.order_number} (${reason}): `
      + (restored.map((r) => `${r.product} ${r.from}→${r.to}`).join(', ') || 'no tracked products'),
    );
    return { restored: true, lines: restored };
  } catch (error) {
    console.error('[inventory] Restore failed for order', order?.order_number, error.message);
    return { restored: false, error: error.message };
  }
}

/**
 * Return a deleted order's stock. Never throws.
 *
 * The row is gone by the time this runs, so it cannot claim the restore the
 * way restoreInventoryForOrder() does — and does not need to. A DELETE that
 * reported rows *is* the claim: Postgres lets exactly one caller remove a
 * given row, so whoever holds the confirmed delete is the only one who will
 * ever reach this for that order.
 *
 * Which is why the caller deletes first and restores second, against the
 * in-memory copy of the row. Restoring first reads as the safer order — "the
 * row still says what it was holding" — but the whole row is loaded before any
 * of this, so waiting costs nothing. What restoring first did cost was the
 * delete that then fails: a foreign key still pointing at the order refuses
 * it, the order stays live, its vials are back on the shelf, and the admin is
 * shown an error saying nothing happened. Stock silently reads high from then
 * on. This way a refused delete changes nothing at all.
 *
 * @param {object} order the row as it was read before the delete
 */
export async function restoreInventoryForDeletedOrder(supabase, order, { reason = 'order deleted' } = {}) {
  // The status gate is bypassed by the caller passing a cancelled copy: a
  // deleted order is a cancelled one by definition. inventory_restored_at is
  // still honoured, so an order whose stock went back when it was cancelled
  // last week is not paid out again now.
  const plan = planInventoryRestore(order);
  if (!plan.restore) return { restored: false, skipped: plan.reason };

  try {
    const restored = await addBackStock(supabase, plan.lines);
    console.log(
      `[inventory] Restored stock for deleted ${order.order_number} (${reason}): `
      + (restored.map((r) => `${r.product} ${r.from}→${r.to}`).join(', ') || 'no tracked products'),
    );
    return { restored: true, lines: restored };
  } catch (error) {
    console.error('[inventory] Restore failed for deleted order', order?.order_number, error.message);
    return { restored: false, error: error.message };
  }
}

/**
 * Report unpaid orders that have held their stock past the window.
 *
 * REPORT ONLY. This does not change any order's status and does not move any
 * stock. Automatically cancelling was built and then removed at Omer's
 * instruction: an unpaid order here is very often still being chased on
 * WhatsApp, or was settled by transfer and never marked, so a cron closing it
 * would destroy real sales. Cancelling stays a human decision made in the admin
 * panel — and doing it there still restores the stock, through
 * restoreInventoryForOrder above.
 */
export async function reportStaleUnpaidOrders(supabase, { hours = STALE_ORDER_HOURS, now = new Date() } = {}) {
  const cutoff = staleOrderCutoff(now, hours);
  const floor = expiryFloor(now);

  const { data: candidates, error } = await supabase
    .from('orders')
    .select('id, order_number, status, items, created_at, inventory_restored_at, inventory_deducted')
    .lt('created_at', cutoff.toISOString())
    .is('inventory_restored_at', null)
    .limit(500);

  if (error) {
    console.error('[inventory] Stale order sweep failed to read orders:', error.message);
    return { expired: 0, error: error.message };
  }

  const unpaid = (candidates || []).filter((order) => isExpirableStatus(order.status));
  const stale = unpaid.filter((order) => isWithinExpiryWindow(order, now));

  // Anything older than the floor is pre-existing backlog. Reported, never
  // touched — cancelling a three-month-old ledger is a person's decision.
  const backlog = unpaid.length - stale.length;
  if (backlog > 0) {
    console.warn(
      `[inventory] ${backlog} unpaid order(s) predate ${floor.toISOString().slice(0, 10)} `
      + 'and were left alone. Close them by hand if they are genuinely dead.',
    );
  }
  const holding = stale.filter((order) => restorableQuantities(order).length > 0);

  if (holding.length > 0) {
    console.log(
      `[inventory] ${holding.length} order(s) unpaid for over ${hours}h are still holding stock: `
      + `${holding.map((o) => o.order_number).join(', ')}. `
      + 'Nothing was cancelled — cancel in the admin panel to release the stock.',
    );
  }

  return {
    cancelled: 0,
    reportOnly: true,
    holdingStock: holding.length,
    orders: holding.map((o) => ({
      order_number: o.order_number,
      status: o.status,
      created_at: o.created_at,
    })),
    cutoff: cutoff.toISOString(),
    skippedBacklog: backlog,
  };
}
