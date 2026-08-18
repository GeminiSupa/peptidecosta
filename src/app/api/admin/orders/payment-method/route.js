import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { orderVisibleToAgent } from '@/lib/agentOrders';
import { buildCardPaymentPath, canSignCardPaymentLinks, getPublicBaseUrl } from '@/lib/cardPaymentLink';
import {
  paymentMethodActivity,
  paymentMethodPatch,
  planPaymentMethodChange,
} from '@/lib/orderPaymentMethod.mjs';

export const runtime = 'nodejs';

// Switching an order between WhatsApp, card, SINPE and PayPal without
// recreating it. Kept off the generic PATCH allow-list on purpose: the settled
// -order guard below is the whole point, and a field sitting in that list could
// be changed by any other caller that happened to include it.

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
  const requested = body?.paymentMethod;
  if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();

  try {
    const { data: order, error: readError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (readError) {
      console.error('[admin/orders/payment-method] read failed', orderId, readError);
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    if (!orderVisibleToAgent(order, auth.profile)) {
      return NextResponse.json({ error: 'Forbidden: order is not visible to this staff member' }, { status: 403 });
    }

    const plan = planPaymentMethodChange(order, requested);
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: plan.status });
    }

    const patch = {
      ...paymentMethodPatch(plan),
      activity_log: appendOrderActivity(order.activity_log, paymentMethodActivity(plan, auth.profile?.email)),
    };

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', orderId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('[admin/orders/payment-method] update failed', order.order_number, updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'The database accepted the change but updated nothing.' }, { status: 500 });
    }

    // Hand the link back with the change so the agent can paste it into the
    // conversation they are already having, rather than making a second trip.
    let paymentUrl = null;
    let paymentLinkError = null;
    if (plan.to === 'card' && order.order_number) {
      if (canSignCardPaymentLinks()) {
        paymentUrl = `${getPublicBaseUrl(request.url)}${buildCardPaymentPath(order.order_number)}`;
      } else {
        paymentLinkError = 'Card payment link signing is not configured, so no link could be created.';
      }
    }

    console.log(`[admin/orders/payment-method] ${order.order_number}: ${plan.from} -> ${plan.to} by ${auth.profile?.email}`);
    return NextResponse.json({
      ok: true,
      order: updated,
      from: plan.from,
      to: plan.to,
      clearedCardAttempt: plan.clearsCardAttempt,
      paymentUrl,
      paymentLinkError,
    });
  } catch (err) {
    console.error('[admin/orders/payment-method]', err);
    return NextResponse.json({ error: err.message || 'Could not change the payment method' }, { status: 500 });
  }
}
