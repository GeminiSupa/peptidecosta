import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { restoreInventoryForOrder } from '@/lib/inventoryRestoreServer';

// Deleting an order used to be a direct browser call, which meant the stock it
// had reserved vanished with the row — nothing was left to restore it from.
// Deleting through here returns the stock first, then removes the order.

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

  const { data: order, error: readError } = await supabase
    .from('orders')
    .select('id, order_number, status, items, inventory_restored_at, inventory_deducted')
    .eq('id', orderId)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
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

  const { error: deleteError } = await supabase.from('orders').delete().eq('id', orderId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message, inventory }, { status: 500 });
  }

  console.log(`[admin/orders/delete] ${order.order_number} deleted by ${auth.profile.email}`);
  return NextResponse.json({ success: true, inventory });
}
