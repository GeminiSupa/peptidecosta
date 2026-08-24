import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { appendOrderActivity } from '@/lib/orderActivity';
import { agentMatchKeys } from '@/lib/agentOrders';
import { isGiftLine, stripGiftSuffix } from '@/lib/bacWater.mjs';
import { authoritativeCheckout } from '@/lib/authoritativeCheckout.mjs';
import { countCartUnits, checkUnitLimits, unitLimitsMessage } from '@/lib/promoEligibility.mjs';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import { getAdminCurrencyPair, normalizeAdminOrderCurrency } from '@/lib/adminOrderTotals.mjs';
import { affiliateCommissionPatch } from '@/lib/affiliateCommission.mjs';
import { sendAdminOrderEmail } from '@/lib/adminOrderEmail.mjs';
import { applyCustomerHistoryAttribution } from '@/lib/customerHistoryAttributionServer';
import { notifyLowInventory, prepareInventoryReservation } from '@/lib/orderInventoryServer';
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

async function applyAffiliateAttribution(supabase, row, promo) {
  const affiliateId = promo?.affiliate_id || null;
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

    const authoritative = authoritativeCheckout({
      postedOrder: { ...order, currency },
      products: products || [],
      promo,
      exchangeRate: liveExchangeRate,
    });
    if (!authoritative.ok) {
      return NextResponse.json({ error: authoritative.error, errorCode: 'cart_invalid' }, { status: 409 });
    }

    const primaryShipping = Math.max(0, Number(
      currency === 'USD' ? order.shipping_cost_usd : order.shipping_cost_crc,
    ) || 0);
    const primaryTotal = authoritative.total - authoritative.shipping + primaryShipping;
    const totals = getAdminCurrencyPair(primaryTotal, currency, liveExchangeRate);
    const shipping = getAdminCurrencyPair(primaryShipping, currency, liveExchangeRate);
    const promoDiscount = getAdminCurrencyPair(authoritative.promoDiscount, currency, liveExchangeRate);
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
      promo_code: promo?.code || null,
      payment_method: paymentMethod,
      status: paymentMethod === 'card' ? 'Payment Pending' : requestedStatus,
      source: 'admin_manual',
      sales_agent: String(order.sales_agent || '').trim() || null,
    };

    if (!auth.profile.is_superadmin) {
      const requestedAgent = String(row.sales_agent || '').trim().toLowerCase();
      if (requestedAgent && !agentMatchKeys(auth.profile).has(requestedAgent)) {
        return NextResponse.json({ error: 'Forbidden: staff can only create orders assigned to themselves' }, { status: 403 });
      }
      row.sales_agent = row.sales_agent || auth.profile.name || auth.profile.email || auth.user.email;
    }

    row = await applyAffiliateAttribution(supabase, row, promo);
    row = await applyCustomerHistoryAttribution(supabase, row);
    row.activity_log = appendOrderActivity([], {
      type: 'manual_entry',
      message: `Manual order created by ${auth.user.email} · catalog pricing verified · FX $1 = ₡${liveExchangeRate} (${rateResult.source})`,
      by: auth.user.email,
    });

    inventory = await prepareInventoryReservation(supabase, [], row.items);
    row.inventory_deducted = inventory.reservations;

    let { data, error } = await supabase.from('orders').insert(row).select('*').single();
    if (error && row.affiliate_id && isForeignKeyError(error)) {
      const { affiliate_id, affiliate_commission_usd, affiliate_commission_crc, ...withoutAffiliate } = row;
      ({ data, error } = await supabase.from('orders').insert(withoutAffiliate).select('*').single());
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
    const alerts = [
      paymentMethod === 'card'
        ? Promise.resolve({ skipped: 'card_payment_pending' })
        : sendCustomerOrderConfirmation(supabase, data, data.order_number, data.id),
      sendTeamOrderWhatsApp(supabase, data, data.order_number, data.id),
      sendAffiliateOrderWhatsApp(supabase, data, data.order_number, data.id),
      paymentMethod === 'card'
        ? Promise.resolve({ skipped: 'card_payment_pending' })
        : sendAdminOrderEmail(baseUrl, data, data.order_number),
    ];
    const alertResults = await Promise.allSettled(alerts);

    return NextResponse.json({
      ok: true,
      order: data,
      exchangeRate: liveExchangeRate,
      exchangeRateSource: rateResult.source,
      alerts: alertResults.map((result) => result.status),
    });
  } catch (error) {
    if (inventory) await inventory.rollback().catch(() => {});
    console.error('[admin/orders/create]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: error.status || 500 });
  }
}
