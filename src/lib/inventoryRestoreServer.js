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
 * Expire unpaid orders that have held their stock past the window.
 *
 * Marks them Cancelled and returns the stock in one pass. Only ever touches
 * orders still sitting in an unpaid status — anything a human has moved on is
 * left alone.
 */
export async function expireStaleUnpaidOrders(supabase, { hours = STALE_ORDER_HOURS, now = new Date() } = {}) {
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
  const results = [];

  for (const order of stale) {
    if (restorableQuantities(order).length === 0) continue;

    const { error: statusError } = await supabase
      .from('orders')
      .update({ status: 'Cancelled' })
      .eq('id', order.id)
      // Re-check the status at write time: a customer may have paid between the
      // read above and this update, and an expiry must never cancel a paid sale.
      .in('status', ['Pending', 'Payment Pending', 'Pending - Card', 'Pending - Card 3DS']);

    if (statusError) {
      console.error('[inventory] Could not expire order', order.order_number, statusError.message);
      continue;
    }

    const outcome = await restoreInventoryForOrder(
      supabase,
      { ...order, status: 'Cancelled' },
      { reason: `unpaid for over ${hours}h` },
    );
    if (outcome.restored) results.push(order.order_number);
  }

  if (results.length > 0) {
    console.log(`[inventory] Expired ${results.length} unpaid order(s) past ${hours}h: ${results.join(', ')}`);
  }
  return {
    expired: results.length,
    orders: results,
    cutoff: cutoff.toISOString(),
    skippedBacklog: backlog,
  };
}
