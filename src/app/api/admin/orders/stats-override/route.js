import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { missingColumnFrom } from '@/lib/optionalColumns.mjs';
import { STATS_OVERRIDE_VALUES } from '@/lib/orderRevenue.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Hold an order out of the money figures, or force one in.
 *
 * Superadmin only. This does not change what the customer was charged — it
 * changes what the business counts, across the Today tiles, the analytics
 * chart, customer lifetime totals and agent commission, all of which read the
 * same rule in src/lib/orderRevenue.mjs. Getting it wrong can move a payout, so
 * it sits above the ordinary `orders` permission that lets staff edit a status.
 *
 * Nothing is deleted: `override: null` puts the order back under the normal
 * status rules, and every change is written to the order's activity log.
 */
export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  if (!auth.profile?.is_superadmin) {
    return NextResponse.json(
      { error: 'Only a superadmin can change what counts as revenue.' },
      { status: 403 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { orderId, reason } = payload || {};
  // null / '' / 'default' all mean "back to the normal status rules".
  const raw = String(payload?.override ?? '').trim().toLowerCase();
  const override = raw === '' || raw === 'default' || raw === 'null' ? null : raw;

  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }
  if (override !== null && !STATS_OVERRIDE_VALUES.includes(override)) {
    return NextResponse.json(
      { error: `override must be one of ${STATS_OVERRIDE_VALUES.join(', ')}, or null to reset` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: order, error: readError } = await supabase
    .from('orders')
    .select('id, order_number, status, total_usd, activity_log')
    .eq('id', orderId)
    .maybeSingle();

  if (readError) {
    console.error('[stats-override] could not read order:', readError);
    return NextResponse.json({ error: 'Could not read that order' }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const actor = auth.profile?.email || 'unknown';
  const label = override === 'exclude'
    ? 'held out of the figures'
    : override === 'include'
      ? 'forced into the figures'
      : 'returned to the normal status rules';

  const { error: writeError } = await supabase
    .from('orders')
    .update({
      stats_override: override,
      stats_override_reason: override ? (String(reason || '').trim() || null) : null,
      stats_override_at: override ? new Date().toISOString() : null,
      stats_override_by: override ? actor : null,
      activity_log: appendOrderActivity(order.activity_log, {
        type: 'stats_override',
        by: actor,
        message: `Order ${label}${reason ? ` — ${String(reason).trim()}` : ''}`,
      }),
    })
    .eq('id', orderId);

  if (writeError) {
    // The migration is pasted into Supabase by hand, so this deploy can arrive
    // first. Say so plainly instead of a generic failure.
    if (missingColumnFrom(writeError)) {
      return NextResponse.json({
        error: 'This needs add-order-stats-override.sql to be run in the Supabase SQL Editor first.',
      }, { status: 503 });
    }
    console.error('[stats-override] could not write override:', writeError);
    return NextResponse.json({ error: 'Could not save that change' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    orderId,
    orderNumber: order.order_number,
    override,
    message: `${order.order_number || 'Order'} ${label}.`,
  });
}
