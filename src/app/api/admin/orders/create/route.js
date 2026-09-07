import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { agentMatchKeys } from '@/lib/agentOrders';
import { isGiftLine, stripGiftSuffix } from '@/lib/bacWater.mjs';
import { authoritativeCheckout } from '@/lib/authoritativeCheckout.mjs';
import { countCartUnits, checkUnitLimits, unitLimitsMessage } from '@/lib/promoEligibility.mjs';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import {
  calculateManualDiscountAmount,
  getAdminCurrencyPair,
  manualDiscountReplacesVolume,
  normalizeAdminOrderCurrency,
  normalizeManualDiscountType,
} from '@/lib/adminOrderTotals.mjs';
import { affiliateCommissionPatch } from '@/lib/affiliateCommission.mjs';
import { sendAdminOrderEmail } from '@/lib/adminOrderEmail.mjs';
import { applyCustomerHistoryAttribution } from '@/lib/customerHistoryAttributionServer';
import { notifyLowInventory, prepareInventoryReservation } from '@/lib/orderInventoryServer';
import {
  ORDER_ATTRIBUTION_COLUMNS,
  ORDER_INVENTORY_COLUMNS,
  ORDER_MANUAL_DISCOUNT_COLUMNS,
  ORDER_VOLUME_DISCOUNT_COLUMNS,
  ORDER_VOLUME_DISCOUNT_PCT_COLUMNS,
  writeDroppingMissingColumns,
} from '@/lib/optionalColumns.mjs';
import {
  recordNewOrderNotification,
  sendAffiliateOrderWhatsApp,
  sendCustomerOrderConfirmation,
  sendTeamOrderWhatsApp,
} from '@/lib/orderWhatsAppAlerts';
import {
  applySalesAgentReferral,
  isEligibleSalesAgentProfile,
  isSalesAgentAffiliate,
} from '@/lib/salesAgentAffiliate.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SAFE_STATUSES = new Set([
  'Pending', 'Payment Pending', 'Pending - Card', 'Pending - Card 3DS',
  'Paid', 'Declined', 'Error', 'Processing', 'Order Complete',
]);

function isForeignKeyError(error) {
  return error?.code === '23503' || String(error?.message || '').includes('foreign key');
}

async function resolvePromo(supabase, order) {
  const code = String(order.promo_code || '').trim().toUpperCase();
  if (!code) return null;

  const { data: promo, error } = await supabase
    .from('promo_codes')
    .select('id,code,is_active,valid_from,valid_until,usage_limit,usage_count,once_per_customer,min_units,max_units,discount_pct,target_product,is_flash_sale,affiliate_id')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!promo) throw Object.assign(new Error('Invalid promo code'), { status: 400 });
  if (!promo.is_active) throw Object.assign(new Error('Promo code is inactive'), { status: 400 });

  const now = Date.now();
  if (promo.valid_from && now < Date.parse(promo.valid_from)) {
    throw Object.assign(new Error('Promo code is not yet active'), { status: 400 });
  }
  if (promo.valid_until && now > Date.parse(promo.valid_until)) {
    await supabase.from('promo_codes').update({ is_active: false }).eq('id', promo.id);
    throw Object.assign(new Error('Promo code has expired'), { status: 400 });
  }
  if (promo.usage_limit !== null && Number(promo.usage_count || 0) >= Number(promo.usage_limit)) {
    throw Object.assign(new Error('Promo code has reached its usage limit'), { status: 400 });
  }

  const unitCheck = checkUnitLimits(
    promo,
    countCartUnits(order.items.filter((item) => !isGiftLine(item))),
  );
  if (!unitCheck.ok) {
    throw Object.assign(new Error(unitLimitsMessage(promo, unitCheck.unitCount, order.currency === 'USD' ? 'en' : 'es')), { status: 400 });
  }

  if (promo.once_per_customer) {
    let used = false;
    for (const [field, value] of [
      ['customer_email', order.customer_email],
      ['customer_phone', order.customer_phone],
    ]) {
      if (used || !value) continue;
      const { data: prior, error: priorError } = await supabase
        .from('orders')
        .select('promo_code')
        .eq(field, value)
        .not('promo_code', 'is', null);
      if (priorError) throw priorError;
      used = (prior || []).some((row) => String(row.promo_code || '').trim().toUpperCase() === code);
    }
    if (used) {
      throw Object.assign(new Error('This promo code can only be used once per customer.'), { status: 400 });
    }
  }

  return promo;
}

/**
 * @param explicitAffiliateId an affiliate chosen on the order form, which wins
 *   over the promo code's own. Staff sometimes credit an affiliate for a deal
 *   they brought in without a code ever being typed, and before this the only
 *   way to record that was to save the order and immediately edit it.
 */
async function applyAffiliateAttribution(supabase, row, promo, explicitAffiliateId = null) {
  const affiliateId = explicitAffiliateId || promo?.affiliate_id || null;
  if (!affiliateId) return { ...row, affiliate_id: null, ...affiliateCommissionPatch(row, null) };

  const { data: affiliate, error } = await supabase
    .from('affiliates')
    .select('*')
    .eq('id', affiliateId)
    .maybeSingle();
  if (error) throw error;
  if (!affiliate) return { ...row, affiliate_id: null, ...affiliateCommissionPatch(row, null) };

  const attributed = { ...row, affiliate_id: affiliate.id };
  if (!isSalesAgentAffiliate(affiliate)) {
    return { ...attributed, ...affiliateCommissionPatch(attributed, affiliate) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('user_id', affiliate.admin_profile_user_id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!isEligibleSalesAgentProfile(profile)) {
    return { ...attributed, affiliate_commission_usd: 0, affiliate_commission_crc: 0 };
  }
  return applySalesAgentReferral(attributed, profile);
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let inventory = null;
  try {
    const { order } = await request.json();
    if (!order?.customer_name || !order?.customer_phone || !Array.isArray(order.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'customer_name, customer_phone, and items are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const currency = normalizeAdminOrderCurrency(order.currency);
    const orderNum = String(order.order_number || '').trim() || `WPCR-${Date.now().toString(36).toUpperCase()}`;
    const promo = await resolvePromo(supabase, { ...order, currency });
    const names = [...new Set(order.items
      .filter((item) => !isGiftLine(item))
      .map((item) => stripGiftSuffix(item?.product || item?.name))
      .filter(Boolean))];
    const [{ data: products, error: productError }, rateResult] = await Promise.all([
      supabase
        .from('products')
        .select('id,product,price_usd,price_crc,status,inventory_count')
        .in('product', names),
      getDatabaseBackedUsdToCrcRate(),
    ]);
    if (productError) {
      return NextResponse.json({ error: `Could not verify current prices: ${productError.message}` }, { status: 503 });
    }
    const liveExchangeRate = rateResult.rate;


    // A negotiated discount, entered on the order form itself rather than
    // afterwards. Bulk buyers agree a price before the order is written down,
    // and until now the only place to record that was the order detail panel —
    // which meant the confirmation reached the customer carrying a price
    // nobody had agreed to. Same validation as /api/admin/orders/update so the
    // two entry points cannot disagree about what a valid discount is.
    const manualDiscountType = normalizeManualDiscountType(order.manual_discount_type);
    const manualDiscountValue = Number(order.manual_discount_value || 0);
    const manualDiscountReason = String(order.manual_discount_reason || '').trim();
    if (!Number.isFinite(manualDiscountValue) || manualDiscountValue < 0) {
      return NextResponse.json({ error: 'Discount value must be zero or greater' }, { status: 400 });
    }
    if (manualDiscountType === 'percentage' && manualDiscountValue > 100) {
      return NextResponse.json({ error: 'Percentage discount cannot exceed 100%' }, { status: 400 });
    }
    if (manualDiscountReason.length > 200) {
      return NextResponse.json({ error: 'Discount reason cannot exceed 200 characters' }, { status: 400 });
    }

    // Whether the automatic volume tier applies is the operator's own call,
    // made on a checkbox next to the discount. It defaults to the rule the
    // form follows — a negotiated discount replaces the tier — so an API
    // caller that says nothing still gets sensible pricing, but an explicit
    // choice is never overridden by an inference.
    const replaceVolumeDiscount = order.apply_volume_discount === undefined
      ? manualDiscountReplacesVolume('admin_manual', manualDiscountType, manualDiscountValue)
      : order.apply_volume_discount === false;

    const authoritative = authoritativeCheckout({
      postedOrder: { ...order, currency },
      products: products || [],
      promo,
      exchangeRate: liveExchangeRate,
      suppressVolumeDiscount: replaceVolumeDiscount,
    });
    if (!authoritative.ok) {
      return NextResponse.json({ error: authoritative.error, errorCode: 'cart_invalid' }, { status: 409 });
    }

    const primaryShipping = Math.max(0, Number(
      currency === 'USD' ? order.shipping_cost_usd : order.shipping_cost_crc,
    ) || 0);

    // Applied to what is left after the volume and promo discounts the
    // authoritative rebuild already worked out, and before shipping — the same
    // order the edit route and the receipt template use. Taken off
    // `authoritative`'s own arithmetic rather than recomputed here, so a promo
    // that overrides the volume tier cannot be discounted twice.
    const subtotalAfterCatalogDiscounts = Math.max(0, authoritative.total - authoritative.shipping);
    const rawManualDiscount = calculateManualDiscountAmount(
      subtotalAfterCatalogDiscounts,
      manualDiscountType,
      manualDiscountValue,
    );
    const manualDiscountAmount = currency === 'USD'
      ? Number(rawManualDiscount.toFixed(2))
      : Math.round(rawManualDiscount);

    const primaryTotal = subtotalAfterCatalogDiscounts - manualDiscountAmount + primaryShipping;
    const totals = getAdminCurrencyPair(primaryTotal, currency, liveExchangeRate);
    const shipping = getAdminCurrencyPair(primaryShipping, currency, liveExchangeRate);
    const promoDiscount = getAdminCurrencyPair(authoritative.promoDiscount, currency, liveExchangeRate);
    const manualDiscount = getAdminCurrencyPair(manualDiscountAmount, currency, liveExchangeRate);
    const paymentMethod = String(order.payment_method || 'whatsapp').trim().toLowerCase();
    const requestedStatus = SAFE_STATUSES.has(order.status) ? order.status : 'Pending';

    let row = {
      order_number: orderNum,
      customer_name: String(order.customer_name).trim(),
      customer_phone: String(order.customer_phone).trim(),
      customer_email: String(order.customer_email || '').trim() || null,
      customer_id_number: String(order.customer_id_number || '').trim() || null,
      customer_id_type: order.customer_id_number ? (order.customer_id_type || null) : null,
      shipping_address: String(order.shipping_address || '').trim() || null,
      items: authoritative.items,
      currency,
      total_usd: totals.usd,
      total_crc: totals.crc,
      shipping_cost_usd: shipping.usd,
      shipping_cost_crc: shipping.crc,
      discount_amount_usd: promoDiscount.usd,
      discount_amount_crc: promoDiscount.crc,
      manual_discount_type: manualDiscountType,
      manual_discount_value: manualDiscountType ? manualDiscountValue : 0,
      manual_discount_reason: manualDiscountType ? (manualDiscountReason || null) : null,
      manual_discount_amount_usd: manualDiscount.usd,
      manual_discount_amount_crc: manualDiscount.crc,
      promo_code: promo?.code || null,
      payment_method: paymentMethod,
      status: paymentMethod === 'card' ? 'Payment Pending' : requestedStatus,
      source: 'admin_manual',
      // Recorded so reopening and re-saving this order cannot quietly reprice
      // it against a rule the operator did not choose.
      apply_volume_discount: !replaceVolumeDiscount,
      // The rate charged, not the rate today's rules would produce: a deal week
      // moves the 10+ tier, and the orders list must keep reporting what this
      // customer was actually given.
      volume_discount_pct: authoritative.volumeDiscountPct ?? 0,
      sales_agent: String(order.sales_agent || '').trim() || null,
      internal_notes: String(order.internal_notes || '').trim() || null,
    };

    // Attribution decides what the business pays its own people, so only a
    // superadmin may set it. Staff creating their own orders are pinned to
    // themselves at the profile rate, exactly as before.
    const requestedAffiliateId = auth.profile.is_superadmin
      ? (String(order.affiliate_id || '').trim() || null)
      : null;
    const requestedCommissionRate = auth.profile.is_superadmin
      && order.agent_commission_rate_override !== undefined
      && order.agent_commission_rate_override !== null
      && order.agent_commission_rate_override !== ''
      ? Number(order.agent_commission_rate_override)
      : null;
    if (requestedCommissionRate !== null
      && (!Number.isFinite(requestedCommissionRate) || requestedCommissionRate < 0 || requestedCommissionRate > 100)) {
      return NextResponse.json({ error: 'Commission override must be between 0 and 100' }, { status: 400 });
    }
    const requestedCommissionSource = requestedCommissionRate === null
      ? null
      : (String(order.agent_commission_source || '').trim() || 'custom_override');
    if (requestedCommissionRate !== null && !String(row.sales_agent || '').trim()) {
      return NextResponse.json({
        error: 'Choose a credited agent before setting a commission override.',
      }, { status: 400 });
    }

    if (!auth.profile.is_superadmin) {
      const requestedAgent = String(row.sales_agent || '').trim().toLowerCase();
      if (requestedAgent && !agentMatchKeys(auth.profile).has(requestedAgent)) {
        return NextResponse.json({ error: 'Forbidden: staff can only create orders assigned to themselves' }, { status: 403 });
      }
      row.sales_agent = row.sales_agent || auth.profile.name || auth.profile.email || auth.user.email;
    }

    row = await applyAffiliateAttribution(supabase, row, promo, requestedAffiliateId);
    row = await applyCustomerHistoryAttribution(supabase, row);

    // Last, so an explicitly chosen rate outranks anything the affiliate or
    // customer-history rules worked out for themselves.
    if (requestedCommissionRate !== null) {
      row.agent_commission_rate_override = requestedCommissionRate;
      row.agent_commission_source = requestedCommissionSource;
    }
    const discountNote = manualDiscountType
      ? ` · order discount ${manualDiscountType === 'percentage' ? `${manualDiscountValue}%` : `${manualDiscountValue} ${currency}`}${manualDiscountReason ? ` — ${manualDiscountReason}` : ''}`
      : '';
    row.activity_log = appendOrderActivity([], {
      type: 'manual_entry',
      message: `Manual order created by ${auth.user.email} · catalog pricing verified${discountNote} · FX $1 = ₡${liveExchangeRate} (${rateResult.source})`,
      by: auth.user.email,
    });

    inventory = await prepareInventoryReservation(supabase, [], row.items);
    row.inventory_deducted = inventory.reservations;

    // Same defence the storefront checkout already had: a manual order must not
    // fail outright just because add-inventory-restore.sql has not been run yet.
    const optionalOrderColumns = [
      ...ORDER_INVENTORY_COLUMNS,
      ...ORDER_MANUAL_DISCOUNT_COLUMNS,
      // The attribution columns arrive by their own hand-run migration too, and
      // an order must still save without them — the same list the edit route
      // already tolerates.
      ...ORDER_ATTRIBUTION_COLUMNS,
      ...ORDER_VOLUME_DISCOUNT_COLUMNS,
      ...ORDER_VOLUME_DISCOUNT_PCT_COLUMNS,
    ];
    let { data, error, droppedColumns } = await writeDroppingMissingColumns(
      row,
      optionalOrderColumns,
      (attempt) => supabase.from('orders').insert(attempt).select('*').single(),
    );
    if (droppedColumns?.some((column) => ORDER_INVENTORY_COLUMNS.includes(column))) {
      console.warn('[admin/orders/create] inventory columns not stored — run add-inventory-restore.sql');
    }
    if (droppedColumns?.some((column) => ORDER_MANUAL_DISCOUNT_COLUMNS.includes(column))) {
      console.warn('[admin/orders/create] manual discount columns not stored — run add-manual-order-discounts.sql');
    }
    if (droppedColumns?.some((column) => ORDER_VOLUME_DISCOUNT_PCT_COLUMNS.includes(column))) {
      console.warn('[admin/orders/create] volume discount pct not stored — run add-order-volume-discount-pct.sql');
    }
    if (error && row.affiliate_id && isForeignKeyError(error)) {
      const { affiliate_id, affiliate_commission_usd, affiliate_commission_crc, ...withoutAffiliate } = row;
      ({ data, error } = await writeDroppingMissingColumns(
        withoutAffiliate,
        optionalOrderColumns,
        (attempt) => supabase.from('orders').insert(attempt).select('*').single(),
      ));
    }
    if (error) {
      await inventory.rollback();
      inventory = null;
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const committedInventory = inventory;
    inventory = null;
    try {
      await notifyLowInventory(supabase, committedInventory.changes);
    } catch (notifyError) {
      console.error('[admin/orders/create] low inventory alert failed:', notifyError.message);
    }

    const housekeeping = [];
    if (row.customer_phone) {
      const cleanPhone = row.customer_phone.replace(/\D/g, '');
      housekeeping.push(supabase.from('abandoned_carts').delete().ilike('customer_phone', `%${cleanPhone.slice(-8)}%`));
    }
    if (row.customer_email) {
      housekeeping.push(supabase.from('abandoned_carts').delete().eq('customer_email', row.customer_email));
    }
    if (promo) {
      housekeeping.push(
        supabase.from('promo_codes').update({ usage_count: Number(promo.usage_count || 0) + 1 }).eq('id', promo.id),
      );
    }
    await Promise.allSettled(housekeeping);

    try {
      await recordNewOrderNotification(supabase, data, data.order_number);
    } catch (error) {
      console.error('[admin/orders/create] durable notification failed:', error.message);
    }

    const baseUrl = new URL(request.url).origin;

    // Staff can hold the customer's notifications back for one order. This is
    // for backfills: an order typed in weeks after it was delivered, entered
    // straight as Order Complete, must not greet the customer with "Order
    // Confirmed!" for something they already have. Everything else — the team
    // alert, the affiliate alert, the accounting copy on a completed sale —
    // still goes out, because those are the business's own records.
    //
    // Defaults to notifying. An API caller that says nothing gets the receipt.
    const notifyCustomer = order.notify_customer !== false;

    // A manual order now emails the customer their receipt, not just the team.
    //
    // It never used to. `sendAdminOrderEmail` defaults to adminNotificationOnly,
    // so a phone or WhatsApp order produced a team alert and a WhatsApp message
    // and nothing the customer could file. Buyers who keep books — pharmacies,
    // clinics, anyone reclaiming the cost — had no document until the order
    // reached Paid, which for a bank transfer can be days, and for an order
    // entered straight as Paid never happened at all.
    //
    // forceCustomerReceipt is what lifts the admin-only default: one call, one
    // SMTP connection, both mails. Card orders still send neither — they are
    // held at Payment Pending and the gateway's own payment-result mail is the
    // first thing the customer should receive.
    const skipCustomerAlerts = paymentMethod === 'card' || !notifyCustomer;
    const alerts = [
      skipCustomerAlerts
        ? Promise.resolve({ skipped: paymentMethod === 'card' ? 'card_payment_pending' : 'not_notifying' })
        : sendCustomerOrderConfirmation(supabase, data, data.order_number, data.id),
      sendTeamOrderWhatsApp(supabase, data, data.order_number, data.id),
      sendAffiliateOrderWhatsApp(supabase, data, data.order_number, data.id),
      // The team alert is not the customer's to suppress, so this still runs
      // when notifications are held back — it just stops carrying the receipt.
      paymentMethod === 'card'
        ? Promise.resolve({ skipped: 'card_payment_pending' })
        : sendAdminOrderEmail(baseUrl, data, data.order_number, {
          notificationOptions: { forceCustomerReceipt: notifyCustomer },
        }),
    ];
    const [customerWhatsApp, teamWhatsApp, affiliateWhatsApp, emailResult] =
      await Promise.allSettled(alerts);

    // Named rather than positional. The old array of four bare statuses could
    // not say *which* alert failed, so a customer receipt that never left the
    // building looked the same as an affiliate alert that was never due.
    const alertStatus = {
      customerWhatsApp: customerWhatsApp.status,
      teamWhatsApp: teamWhatsApp.status,
      affiliateWhatsApp: affiliateWhatsApp.status,
      email: emailResult.status,
      customerReceipt: emailResult.value?.results?.customerReceipt?.sent === true
        ? 'sent'
        : !notifyCustomer
          ? 'held_back_by_operator'
          : paymentMethod === 'card'
            ? 'card_payment_pending'
            : data.customer_email
              ? 'failed'
              : 'no_email_on_order',
      emailError: emailResult.status === 'rejected'
        ? String(emailResult.reason?.message || 'unknown error')
        : (emailResult.value?.results?.customerReceipt?.error || null),
    };
    if (alertStatus.customerReceipt === 'failed') {
      console.error(
        `[admin/orders/create] customer receipt for ${data.order_number} did not send:`,
        alertStatus.emailError,
      );
    }

    return NextResponse.json({
      ok: true,
      order: data,
      exchangeRate: liveExchangeRate,
      exchangeRateSource: rateResult.source,
      alerts: alertStatus,
    });
  } catch (error) {
    if (inventory) await inventory.rollback().catch(() => {});
    console.error('[admin/orders/create]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: error.status || 500 });
  }
}
