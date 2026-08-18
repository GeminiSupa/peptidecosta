import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { restoreInventoryForOrder } from '@/lib/inventoryRestoreServer';

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

    // Restore before deleting, and only before deleting: once the row is gone
    // there is no record of what it was holding. A deleted order is a cancelled
    // one by definition, so the status gate in planInventoryRestore is bypassed
    // by asking for the restore against a cancelled copy.
    const inventory = await restoreInventoryForOrder(
      supabase,
      { ...order, status: 'Cancelled' },
      { reason: 'order deleted' },
    );

    const { data: deleted, error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId)
      .select('id');

    if (deleteError) {
      console.error('[admin/orders/delete] delete failed', order.order_number, deleteError);
      return NextResponse.json(
        { error: describeDbError(deleteError, 'Could not delete the order'), code: deleteError.code || null, inventory },
        { status: 500 },
      );
    }

    // Postgres reports no error when a DELETE matches nothing, so without this
    // the caller was told the order had gone while the row was still there —
    // which is exactly how a delete came back on the next refresh.
    if (!deleted || deleted.length === 0) {
      console.error('[admin/orders/delete] matched no rows', order.order_number);
      return NextResponse.json(
        { error: 'The database accepted the delete but removed nothing. The order is still there.', inventory },
        { status: 500 },
      );
    }

    console.log(`[admin/orders/delete] ${order.order_number} deleted by ${auth.profile.email}`);
    return NextResponse.json({ success: true, inventory });
  } catch (err) {
    console.error('[admin/orders/delete] unexpected failure', orderId, err);
    return NextResponse.json({ error: err.message || 'Could not delete the order' }, { status: 500 });
  }
}
