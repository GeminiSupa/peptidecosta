/**
 * Send the customer their order receipt again, with whatever the order says now.
 *
 * Until this existed there was exactly one way a customer could receive a
 * receipt: the automatic send on the first unpaid -> Paid transition. That send
 * happens once, and it happens at whatever moment the status was changed —
 * which for a negotiated bulk order is routinely *before* the agreed discount
 * has been entered. The customer was then holding a receipt for a price they
 * never paid, and nothing in the panel could replace it.
 *
 * The completion resend ("Send / resend email") is not a substitute: it sends
 * the shipping mail, whose body carries a tracking number and a single Total
 * Paid line with no subtotal and no discount breakdown, and it only appears
 * once an order is Complete.
 *
 * This route re-renders the full receipt from the current order row, so a
 * discount applied five minutes or five days later is reflected exactly. It is
 * marked as a correction in the subject and in the mail itself so the customer
 * can tell which of the two copies is the one to file.
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { orderVisibleToAgent } from '@/lib/agentOrders';
import { appendOrderActivity } from '@/lib/orderActivity';
import { buildOrderNotificationPayload } from '@/lib/adminOrderEmail.mjs';
import { internalJsonHeaders } from '@/lib/internalRequestAuth.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { orderId, orderNumber } = await request.json();
    if (!orderId && !orderNumber) {
      return NextResponse.json({ error: 'orderId or orderNumber is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let query = supabase.from('orders').select('*');
    query = orderId ? query.eq('id', orderId) : query.eq('order_number', orderNumber);
    const { data: order, error } = await query.maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (!orderVisibleToAgent(order, auth.profile)) {
      return NextResponse.json({ error: 'Forbidden: order is not visible to this staff member' }, { status: 403 });
    }

    const customerEmail = String(order.customer_email || '').trim();
    if (!customerEmail) {
      return NextResponse.json({
        error: 'This order has no email address on it, so there is nowhere to send the receipt. '
          + 'Add the customer\'s email to the order first.',
      }, { status: 400 });
    }

    // adminNotificationOnly:false + customerReceiptOnly:true is what tells
    // /api/order-notification to send the buyer's receipt and nothing else —
    // the team has already been alerted about this order and does not need a
    // second "New Order" mail for a price correction.
    const body = JSON.stringify({
      ...buildOrderNotificationPayload(order, order.order_number, {
        adminNotificationOnly: false,
        customerReceiptOnly: true,
        forceCustomerReceipt: true,
      }),
      isResend: true,
      suppressAccountingCopy: true,
    });

    const baseUrl = new URL(request.url).origin;
    const response = await fetch(`${baseUrl}/api/order-notification`, {
      method: 'POST',
      headers: internalJsonHeaders(body, '/api/order-notification'),
      body,
    });
    const result = await response.json().catch(() => ({}));
    const receipt = result?.results?.customerReceipt || {};
    const sent = receipt.sent === true;
    const failure = receipt.error || result?.error || `Order notification returned ${response.status}`;

    // Who asked for the resend, on the order, whether or not it went out. The
    // mail route logs the delivery itself; this records the decision, which is
    // the half a customer dispute actually turns on.
    let updated = null;
    try {
      // Re-read rather than reuse the row loaded above: /api/order-notification
      // writes its own delivery entry onto the same JSONB column while this
      // request is in flight, and appending to a stale copy would drop it.
      const { data: fresh } = await supabase
        .from('orders')
        .select('activity_log')
        .eq('id', order.id)
        .single();
      const { data: written } = await supabase
        .from('orders')
        .update({
          activity_log: appendOrderActivity(fresh?.activity_log || order.activity_log || [], {
            type: 'receipt_resent',
            message: sent
              ? `Corrected receipt resent to ${customerEmail} by ${auth.user.email}`
              : `Corrected receipt to ${customerEmail} FAILED — ${failure}`,
            by: auth.user.email,
          }),
        })
        .eq('id', order.id)
        .select('*')
        .single();
      updated = written || null;
    } catch (logError) {
      console.error('[admin/orders/resend-receipt] activity log failed:', logError.message);
    }

    if (!sent) {
      return NextResponse.json({ ok: false, sent: false, error: failure, order: updated }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sent: true, to: customerEmail, order: updated });
  } catch (err) {
    console.error('[admin/orders/resend-receipt]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
