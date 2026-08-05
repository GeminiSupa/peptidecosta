import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { agentMatchKeys, orderVisibleToAgent } from '@/lib/agentOrders';
import { ORDER_ATTRIBUTION_COLUMNS, writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { sendAffiliateOrderWhatsApp } from '@/lib/orderWhatsAppAlerts';

export const runtime = 'nodejs';

function affiliateCommissionPatch(order, affiliate) {
  if (!order?.affiliate_id || !affiliate) {
    return {
      affiliate_commission_usd: 0,
      affiliate_commission_crc: 0,
    };
  }

  const rate = Number(affiliate.commission_rate || 0);
  const usdBase = Math.max(0, Number(order.total_usd || 0) - Number(order.shipping_cost_usd || 0));
  const crcBase = Math.max(0, Number(order.total_crc || 0) - Number(order.shipping_cost_crc || 0));

  return {
    affiliate_commission_usd: Number((usdBase * rate).toFixed(2)),
    affiliate_commission_crc: Math.round(crcBase * rate),
  };
}

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
      'affiliate_id', 'agent_commission_rate_override', 'agent_commission_source',
    ];
    const patch = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) patch[key] = updates[key];
    }

    const supabase = getSupabaseAdmin();

    const { data: currentOrder, error: currentOrderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (currentOrderError || !currentOrder) {
      return NextResponse.json({ error: currentOrderError?.message || 'Order not found' }, { status: 404 });
    }

    if (!orderVisibleToAgent(currentOrder, auth.profile)) {
      return NextResponse.json({ error: 'Forbidden: order is not visible to this staff member' }, { status: 403 });
    }

    if (!auth.profile.is_superadmin && patch.sales_agent !== undefined) {
      const requestedAgent = String(patch.sales_agent || '').trim().toLowerCase();
      if (requestedAgent && !agentMatchKeys(auth.profile).has(requestedAgent)) {
        return NextResponse.json({ error: 'Forbidden: staff can only assign orders to themselves' }, { status: 403 });
      }
    }

    const superadminOnlyFields = [
      'affiliate_id',
      'agent_commission_rate_override',
      'agent_commission_source',
    ];
    if (!auth.profile.is_superadmin && superadminOnlyFields.some((field) => field in patch)) {
      return NextResponse.json({ error: 'Forbidden: only superadmins can edit payout attribution' }, { status: 403 });
    }

    if ('agent_commission_rate_override' in patch) {
      const rate = Number(patch.agent_commission_rate_override || 0);
      patch.agent_commission_rate_override = rate > 0 ? rate : null;
      if (!patch.agent_commission_rate_override) patch.agent_commission_source = null;
    }

    if ('agent_commission_source' in patch) {
      patch.agent_commission_source = String(patch.agent_commission_source || '').trim() || null;
    }

    if ('affiliate_id' in patch) {
      patch.affiliate_id = patch.affiliate_id || null;
      let affiliate = null;
      if (patch.affiliate_id) {
        const { data: affiliateRow, error: affiliateError } = await supabase
          .from('affiliates')
          .select('id, commission_rate')
          .eq('id', patch.affiliate_id)
          .maybeSingle();
        if (affiliateError) {
          return NextResponse.json({ error: affiliateError.message }, { status: 500 });
        }
        if (!affiliateRow) {
          return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
        }
        affiliate = affiliateRow;
      }
      Object.assign(patch, affiliateCommissionPatch({ ...currentOrder, ...patch }, affiliate));
      if (currentOrder.affiliate_id !== patch.affiliate_id) {
        patch.affiliate_whatsapp_notified_at = null;
        patch.affiliate_whatsapp_message_id = null;
      }
    }

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

    const { data, error, droppedColumns } = await writeDroppingMissingColumns(
      patch,
      ORDER_ATTRIBUTION_COLUMNS,
      (row) => supabase
        .from('orders')
        .update(row)
        .eq('id', orderId)
        .select('*')
        .single()
    );

    if (error) {
      console.error('[admin/orders/update]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (droppedColumns?.length) {
      console.warn('[admin/orders/update] Order attribution columns missing, run add-order-attribution-controls.sql:', droppedColumns.join(', '));
    }

    if (
      auth.profile.is_superadmin &&
      'affiliate_id' in patch &&
      data.affiliate_id &&
      currentOrder.affiliate_id !== data.affiliate_id
    ) {
      await sendAffiliateOrderWhatsApp(supabase, data, data.order_number, data.id);
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
