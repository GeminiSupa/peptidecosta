import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';

export const runtime = 'nodejs';

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { orderId, updates, activity } = body;

    if (!orderId || !updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'orderId and updates required' }, { status: 400 });
    }

    const allowed = [
      'status', 'tracking_number', 'sales_agent', 'internal_notes',
      'payment_proof_url', 'shipping_cost_crc', 'shipping_cost_usd',
      'customer_name', 'customer_phone', 'customer_email', 'customer_id_number',
      'shipping_address', 'items', 'total_usd', 'total_crc',
      'payment_transaction_id', 'payment_provider_status', 'payment_authorization',
      'payment_descriptor', 'payment_provider_response',
    ];
    const patch = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) patch[key] = updates[key];
    }

    const supabase = getSupabaseAdmin();

    let activityLog;
    if (activity) {
      const { data: current } = await supabase
        .from('orders')
        .select('activity_log')
        .eq('id', orderId)
        .single();
      activityLog = appendOrderActivity(current?.activity_log, {
        type: activity.type || 'note',
        message: activity.message || '',
        by: auth.user.email,
      });
      patch.activity_log = activityLog;
    }

    const { data: currentOrder } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();

    const { data, error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', orderId)
      .select('*')
      .single();

    if (error) {
      console.error('[admin/orders/update]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger Customer Receipt if status changed to Paid/Completed
    if (patch.status && currentOrder) {
      const wasPaid = currentOrder.status && (currentOrder.status.toLowerCase().includes('paid') || currentOrder.status.toLowerCase().includes('complet'));
      const isNowPaid = patch.status.toLowerCase().includes('paid') || patch.status.toLowerCase().includes('complet');

      if (!wasPaid && isNowPaid) {
        const { error: cartCleanupError } = await markActiveAbandonedCartsConvertedForOrder(supabase, data);
        if (cartCleanupError) {
          console.warn('[admin/orders/update] Paid cart cleanup failed:', cartCleanupError.message);
        }

        try {
          const itemsAmount = (data.items || []).reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.qty) || 0)), 0);
          const shippingCost = data.currency === 'CRC' ? Number(data.shipping_cost_crc || 0) : Number(data.shipping_cost_usd || 0);
          const promoDiscount = data.currency === 'CRC' ? Number(data.discount_amount_crc || 0) : Number(data.discount_amount_usd || 0);
          const total = data.currency === 'CRC' ? Number(data.total_crc || 0) : Number(data.total_usd || 0);
          
          let volumeDiscount = itemsAmount - promoDiscount + shippingCost - total;
          if (volumeDiscount < 0.01) volumeDiscount = 0; // handle floating point errors

          const baseUrl = new URL(request.url).origin;
          await fetch(`${baseUrl}/api/order-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               orderNumber: data.order_number,
               customerName: data.customer_name,
               customerPhone: data.customer_phone,
               customerEmail: data.customer_email,
               shippingAddress: data.shipping_address,
               customerIdType: data.customer_id_type,
               customerIdNumber: data.customer_id_number,
               items: data.items || [],
               total: total,
               totalUsd: data.total_usd,
               totalCrc: data.total_crc,
               subtotal: itemsAmount,
               volumeDiscount: volumeDiscount,
               promoDiscount: promoDiscount,
               shipping: shippingCost,
               currency: data.currency || 'USD',
               paymentMethod: data.payment_method,
               status: data.status,
               customerReceiptOnly: true,
               forceCustomerReceipt: true,
               lang: data.currency === 'CRC' ? 'es' : 'en',
            })
          });
        } catch (e) {
          console.error('[admin/orders/update] Failed to send customer confirmation:', e);
        }
      }
    }

    return NextResponse.json({ ok: true, order: data });
  } catch (err) {
    console.error('[admin/orders/update]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
