import { stripGiftSuffix } from './bacWater.mjs';

function quantities(lines = []) {
  const byProduct = new Map();
  for (const line of lines || []) {
    const product = stripGiftSuffix(line?.product || line?.name);
    const qty = Math.max(0, Math.floor(Number(line?.qty ?? line?.quantity ?? 0)));
    if (!product || !qty) continue;
    byProduct.set(product, (byProduct.get(product) || 0) + qty);
  }
  return byProduct;
}

export function inventoryReservationPlan(currentLines = [], desiredItems = [], products = []) {
  const current = quantities(currentLines);
  const desired = quantities(desiredItems);
  const productByName = new Map((products || []).map((row) => [row.product, row]));
  const changes = [];
  const reservations = [];

  for (const product of new Set([...current.keys(), ...desired.keys()])) {
    const row = productByName.get(product);
    const currentQty = current.get(product) || 0;
    const desiredQty = desired.get(product) || 0;
    if (!row || row.inventory_count === null || row.inventory_count === undefined) continue;

    const stockNow = Number(row.inventory_count || 0);
    const availableForOrder = stockNow + currentQty;
    if (desiredQty > availableForOrder) {
      return { ok: false, error: `${product}: only ${availableForOrder} available` };
    }
    const nextInventory = availableForOrder - desiredQty;
    changes.push({
      product,
      before: stockNow,
      after: nextInventory,
      threshold: row.low_stock_threshold === null || row.low_stock_threshold === undefined
        ? 5
        : Number(row.low_stock_threshold),
    });
    if (desiredQty > 0) reservations.push({ product, qty: desiredQty });
  }

  return { ok: true, changes, reservations };
}

async function applyInventoryChanges(supabase, changes, direction = 'forward') {
  const applied = [];
  for (const change of changes) {
    const value = direction === 'forward' ? change.after : change.before;
    const { error } = await supabase
      .from('products')
      .update({ inventory_count: value })
      .eq('product', change.product);
    if (error) {
      if (direction === 'forward' && applied.length > 0) {
        await applyInventoryChanges(supabase, applied.reverse(), 'rollback');
      }
      throw error;
    }
    applied.push(change);
  }
}

export async function prepareInventoryReservation(supabase, currentLines, desiredItems) {
  const names = [...new Set([
    ...quantities(currentLines).keys(),
    ...quantities(desiredItems).keys(),
  ])];
  if (names.length === 0) {
    return { reservations: [], changes: [], rollback: async () => {} };
  }

  const { data, error } = await supabase
    .from('products')
    .select('product,inventory_count,low_stock_threshold')
    .in('product', names);
  if (error) throw error;

  const plan = inventoryReservationPlan(currentLines, desiredItems, data || []);
  if (!plan.ok) {
    const shortage = new Error(plan.error);
    shortage.status = 409;
    throw shortage;
  }

  await applyInventoryChanges(supabase, plan.changes);
  return {
    ...plan,
    rollback: () => applyInventoryChanges(supabase, [...plan.changes].reverse(), 'rollback'),
  };
}

export async function notifyLowInventory(supabase, changes = []) {
  for (const change of changes) {
    const crossed = change.before > change.threshold && change.after <= change.threshold;
    const hitZero = change.before > 0 && change.after === 0;
    if (!crossed && !hitZero) continue;
    await supabase.from('admin_notifications').insert({
      type: 'low_inventory',
      title: hitZero ? `Out of Stock: ${change.product}` : `Low Stock Alert: ${change.product}`,
      body: `Inventory has dropped to ${change.after} unit(s).`,
      link_tab: 'spreadsheet',
    });
  }
}
