import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { orderVisibleToAgent } from '@/lib/agentOrders';
import { missingColumnFrom, ORDER_ATTRIBUTION_COLUMNS, writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { sendAffiliateOrderWhatsApp } from '@/lib/orderWhatsAppAlerts';
import {
  ADMIN_FALLBACK_EXCHANGE_RATE,
  calculateAdminOrderTotals,
  getAdminShippingCosts,
  normalizeAdminOrderCurrency,
  normalizeManualDiscountType,
} from '@/lib/adminOrderTotals.mjs';
import {
  applySalesAgentReferral,
  isEligibleSalesAgentProfile,
  isSalesAgentAffiliate,
} from '@/lib/salesAgentAffiliate.mjs';

export const runtime = 'nodejs';

const MANUAL_DISCOUNT_FIELDS = [
  'manual_discount_type',
  'manual_discount_value',
  'manual_discount_reason',
];

const isSettledStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  return normalized.includes('paid') || normalized.includes('complete');
};

const sameNullableText = (left, right) =>
  (String(left || '').trim() || null) === (String(right || '').trim() || null);

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
    const { orderId, updates, activity, acknowledgePaidOrderDiscount } = body;

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
      'manual_discount_type', 'manual_discount_value', 'manual_discount_reason',
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

    const manualDiscountRequested = MANUAL_DISCOUNT_FIELDS.some((field) => field in patch);
    if (manualDiscountRequested) {
      const manualType = normalizeManualDiscountType(patch.manual_discount_type);
      const manualValue = Number(patch.manual_discount_value || 0);
      const manualReason = String(patch.manual_discount_reason || '').trim();

      if (!Number.isFinite(manualValue) || manualValue < 0) {
        return NextResponse.json({ error: 'Discount value must be zero or greater' }, { status: 400 });
      }
      if (manualType === 'percentage' && manualValue > 100) {
        return NextResponse.json({ error: 'Percentage discount cannot exceed 100%' }, { status: 400 });
      }
      if (manualReason.length > 200) {
        return NextResponse.json({ error: 'Discount reason cannot exceed 200 characters' }, { status: 400 });
      }

      patch.manual_discount_type = manualType;
      patch.manual_discount_value = manualType ? manualValue : 0;
      patch.manual_discount_reason = manualType ? (manualReason || null) : null;
    }

    const manualDiscountChanged = manualDiscountRequested && (
      normalizeManualDiscountType(currentOrder.manual_discount_type) !== patch.manual_discount_type ||
      Number(currentOrder.manual_discount_value || 0) !== Number(patch.manual_discount_value || 0) ||
      !sameNullableText(currentOrder.manual_discount_reason, patch.manual_discount_reason)
    );

    if (manualDiscountChanged && isSettledStatus(currentOrder.status) && acknowledgePaidOrderDiscount !== true) {
      return NextResponse.json({
        error: 'This order is already paid or complete. Confirm that changing its record does not issue a refund.',
        requiresPaidOrderAcknowledgement: true,
      }, { status: 409 });
    }

    const pricingChanged = [
      'items',
      'shipping_cost_crc',
      'shipping_cost_usd',
      ...MANUAL_DISCOUNT_FIELDS,
    ].some((field) => field in patch);

    if (pricingChanged) {
      const items = 'items' in patch ? patch.items : currentOrder.items;
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Order must have at least one item' }, { status: 400 });
      }
      if (items.some((item) => !item?.product || Number(item.qty) <= 0 || Number(item.price) < 0)) {
        return NextResponse.json({ error: 'Every order item needs a product, positive quantity, and non-negative price' }, { status: 400 });
      }

      const currency = normalizeAdminOrderCurrency(currentOrder.currency);
      const shippingCrc = Number(('shipping_cost_crc' in patch ? patch.shipping_cost_crc : currentOrder.shipping_cost_crc) || 0);
      const shippingUsd = Number(('shipping_cost_usd' in patch ? patch.shipping_cost_usd : currentOrder.shipping_cost_usd) || 0);
      const shipping = currency === 'CRC' ? shippingCrc : shippingUsd;
      if ('shipping_cost_crc' in patch || 'shipping_cost_usd' in patch) {
        const normalizedShipping = getAdminShippingCosts(shipping, currency);
        patch.shipping_cost_crc = normalizedShipping.crc;
        patch.shipping_cost_usd = normalizedShipping.usd;
      }
      const promoDiscountAmount = currency === 'CRC'
        ? Number(currentOrder.discount_amount_crc || 0)
        : Number(currentOrder.discount_amount_usd || 0);
      const manualType = normalizeManualDiscountType(
        'manual_discount_type' in patch ? patch.manual_discount_type : currentOrder.manual_discount_type
      );
      const manualValue = Number(
        ('manual_discount_value' in patch ? patch.manual_discount_value : currentOrder.manual_discount_value) || 0
      );
      const totals = calculateAdminOrderTotals(items, shipping, {
        promoDiscountAmount,
        manualDiscountType: manualType,
        manualDiscountValue: manualValue,
      });
      const primaryTotal = currency === 'CRC' ? Math.round(totals.total) : Number(totals.total.toFixed(2));

      patch.total_usd = currency === 'USD'
        ? primaryTotal
        : Number((primaryTotal / ADMIN_FALLBACK_EXCHANGE_RATE).toFixed(2));
      patch.total_crc = currency === 'CRC'
        ? primaryTotal
        : Math.round(primaryTotal * ADMIN_FALLBACK_EXCHANGE_RATE);

      if (manualDiscountRequested || Object.hasOwn(currentOrder, 'manual_discount_amount_usd')) {
        patch.manual_discount_amount_usd = currency === 'USD'
          ? Number(totals.manualDiscountAmount.toFixed(2))
          : Number((totals.manualDiscountAmount / ADMIN_FALLBACK_EXCHANGE_RATE).toFixed(2));
        patch.manual_discount_amount_crc = currency === 'CRC'
          ? Math.round(totals.manualDiscountAmount)
          : Math.round(totals.manualDiscountAmount * ADMIN_FALLBACK_EXCHANGE_RATE);
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
          .select('*')
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
      if (isSalesAgentAffiliate(affiliate)) {
        const { data: linkedProfile, error: linkedProfileError } = await supabase
          .from('admin_profiles')
          .select('*')
          .eq('user_id', affiliate.admin_profile_user_id)
          .maybeSingle();
        if (linkedProfileError) {
          return NextResponse.json({ error: linkedProfileError.message }, { status: 500 });
        }
        if (!isEligibleSalesAgentProfile(linkedProfile)) {
          return NextResponse.json({ error: 'This sales-agent affiliate is not active.' }, { status: 400 });
        }
        const combined = applySalesAgentReferral({ ...currentOrder, ...patch }, linkedProfile);
        Object.assign(patch, {
          sales_agent: combined.sales_agent,
          agent_commission_rate_override: combined.agent_commission_rate_override,
          agent_commission_source: combined.agent_commission_source,
          affiliate_commission_usd: 0,
          affiliate_commission_crc: 0,
        });
      } else {
        Object.assign(patch, affiliateCommissionPatch({ ...currentOrder, ...patch }, affiliate));
      }
      if (currentOrder.affiliate_id !== patch.affiliate_id) {
        patch.affiliate_whatsapp_notified_at = null;
        patch.affiliate_whatsapp_message_id = null;
      }
    }

    if (pricingChanged && !('affiliate_id' in patch) && currentOrder.affiliate_id) {
      const { data: affiliate, error: affiliateError } = await supabase
        .from('affiliates')
        .select('*')
        .eq('id', currentOrder.affiliate_id)
        .maybeSingle();
      if (affiliateError) {
        return NextResponse.json({ error: affiliateError.message }, { status: 500 });
      }
      Object.assign(
        patch,
        isSalesAgentAffiliate(affiliate)
          ? { affiliate_commission_usd: 0, affiliate_commission_crc: 0 }
          : affiliateCommissionPatch({ ...currentOrder, ...patch }, affiliate)
      );
    }

    const authoritativeActivity = manualDiscountChanged
      ? {
          type: patch.manual_discount_type ? 'manual_discount_applied' : 'manual_discount_removed',
          message: patch.manual_discount_type
            ? `Order discount set to ${patch.manual_discount_type === 'percentage' ? `${patch.manual_discount_value}%` : `${patch.manual_discount_value} ${normalizeAdminOrderCurrency(currentOrder.currency)}`}${patch.manual_discount_reason ? ` — ${patch.manual_discount_reason}` : ''}`
            : 'Order discount removed',
        }
      : activity;

    let activityLog;
    if (authoritativeActivity) {
      activityLog = appendOrderActivity(currentOrder.activity_log, {
        type: authoritativeActivity.type || 'note',
        message: authoritativeActivity.message || '',
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
      const missingColumn = missingColumnFrom(error);
      if (manualDiscountRequested && missingColumn?.startsWith('manual_discount_')) {
        return NextResponse.json({
          error: 'Order discounts are not enabled in the database yet. Run add-manual-order-discounts.sql first.',
        }, { status: 503 });
      }
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
          const dataCurrency = normalizeAdminOrderCurrency(data.currency);
          const itemsAmount = (data.items || []).reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.qty) || 0)), 0);
          const shippingCost = dataCurrency === 'CRC' ? Number(data.shipping_cost_crc || 0) : Number(data.shipping_cost_usd || 0);
          const promoDiscount = dataCurrency === 'CRC' ? Number(data.discount_amount_crc || 0) : Number(data.discount_amount_usd || 0);
          const manualDiscount = dataCurrency === 'CRC' ? Number(data.manual_discount_amount_crc || 0) : Number(data.manual_discount_amount_usd || 0);
          const total = dataCurrency === 'CRC' ? Number(data.total_crc || 0) : Number(data.total_usd || 0);
          
          let volumeDiscount = itemsAmount - promoDiscount - manualDiscount + shippingCost - total;
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
               manualDiscount: manualDiscount,
               manualDiscountReason: data.manual_discount_reason || null,
               shipping: shippingCost,
               currency: dataCurrency,
               paymentMethod: data.payment_method,
               status: data.status,
               customerReceiptOnly: true,
               forceCustomerReceipt: true,
               lang: dataCurrency === 'CRC' ? 'es' : 'en',
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
