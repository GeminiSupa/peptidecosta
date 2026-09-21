import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { restoreInventoryForDeletedOrder } from '@/lib/inventoryRestoreServer';
import { actorFrom, moveToBin } from '@/lib/recycleBinServer';

// Deleting an order used to be a direct browser call, which meant the stock it
// had reserved vanished with the row — nothing was left to restore it from.
// Deleting through here returns the stock first, then removes the order.

/** Postgres says why it refused; pass that on instead of a bare message. */
function describeDbError(error, fallback) {
  const parts = [error?.message || fallback];
  if (error?.details) parts.push(error.details);
  if (error?.hint) parts.push(error.hint);
  if (error?.code === '23503') {
    // A foreign key still points at this order. Which one is in `details`, and
    // it is the difference between "add ON DELETE SET NULL" and guesswork.
    parts.push('Another record still references this order.');
  }
  return parts.filter(Boolean).join(' — ');
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const orderId = String(body?.orderId || '').trim();
  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    // Selected whole rather than by name: inventory_restored_at and
    // inventory_deducted arrive with add-inventory-restore.sql, and naming a
    // column the database does not have yet fails the read — which used to
    // abort the delete before it was attempted.
    const { data: order, error: readError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (readError) {
      console.error('[admin/orders/delete] read failed', orderId, readError);
      return NextResponse.json({ error: describeDbError(readError, 'Could not read the order') }, { status: 500 });
    }
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Delete first, restore second — against the copy of the row already read
    // above, which is every bit as complete as the row itself.
    //
    // The other order looks safer and is not. A delete can be refused after
    // the fact: a foreign key still pointing at the order sends back 23503,
    // handled below. Restoring first meant that refusal left the order live
    // *and* its vials back on the shelf, with the admin reading an error that
    // says nothing happened — stock reads high from then on and nothing says
    // why. Nothing is restored now unless the row is confirmed gone.
    //
    // Through the Bin, so the order and its items can be brought back. moveToBin
    // keeps the same guarantee this code already relied on: it reports ok only
    // once the row is confirmed gone, and undoes its own snapshot otherwise.
    const binned = await moveToBin(
      { table: 'orders', ids: [orderId], actor: actorFrom(auth.profile) },
      supabase,
    );

    if (!binned.ok) {
      console.error('[admin/orders/delete] delete failed', order.order_number, binned.error);
      return NextResponse.json(
        {
          error: binned.error,
          // Said explicitly so the admin knows the order is untouched rather
          // than half-removed, and can retry without wondering about stock.
          inventory: { restored: false, skipped: 'delete refused — nothing was changed' },
        },
        { status: 500 },
      );
    }

    // The row is confirmed gone, which is what makes this safe to do without
    // claiming it. A deleted order is a cancelled one by definition, so the
    // status gate is bypassed by asking against a cancelled copy.
    const inventory = await restoreInventoryForDeletedOrder(
      supabase,
      { ...order, status: 'Cancelled' },
      { reason: 'order deleted' },
    );

    console.log(`[admin/orders/delete] ${order.order_number} binned by ${auth.profile.email}`);
    return NextResponse.json({
      success: true,
      inventory,
      message: 'Moved to the Bin. Restore it from the Bin tab if this was a mistake.',
    });
  } catch (err) {
    console.error('[admin/orders/delete] unexpected failure', orderId, err);
    return NextResponse.json({ error: err.message || 'Could not delete the order' }, { status: 500 });
  }
}
