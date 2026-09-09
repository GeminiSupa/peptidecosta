import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { countPromoEligibleUnits, checkUnitLimits, unitLimitsMessage } from '@/lib/promoEligibility.mjs';
import { isGiftLine, stripGiftSuffix } from '@/lib/bacWater.mjs';
import { authoritativeCheckout, activeDealForOrder } from '@/lib/authoritativeCheckout.mjs';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import { mergeOrderWhatsAppDestinations, selectWithOptionalPreferences } from '@/lib/notificationPreferences.mjs';
import { sanitizeOrderAttribution } from '@/lib/orderAttribution.mjs';
import { affiliateCommissionPatch } from '@/lib/affiliateCommission.mjs';
import { checkoutOrderStatus } from '@/lib/checkoutOrderStatus.mjs';
import { writeDroppingMissingColumns } from '@/lib/optionalColumns.mjs';
import { sendAdminOrderEmail } from '@/lib/adminOrderEmail.mjs';
import {
  CustomerSessionError,
  applyCustomerOrderOwnership,
  resolveCustomerOrderOwner,
} from '@/lib/customerOrderOwnership.mjs';
import { agentMatchKeys } from '@/lib/agentOrders';
import { CUSTOMER_HISTORY_SOURCE, buildAgentNameResolver, lookupHistoricalAgent } from '@/lib/agentAttribution.mjs';
import { getNotificationRecipients } from '@/lib/notificationRecipients.mjs';
import { identityMessage, validateCustomerName } from '@/lib/checkoutIdentity.mjs';
import { createCardCheckoutToken } from '@/lib/cardPaymentLink';
import {
  consumeDurableRateLimit,
  getRequestIp,
  isTrustedStorefrontRequest,
  rateLimitHeaders,
  readLimitedJson,
  RequestBodyError,
} from '@/lib/publicApiSecurity.mjs';
import {
  applySalesAgentReferral,
  isEligibleSalesAgentProfile,
  isSalesAgentAffiliate,
} from '@/lib/salesAgentAffiliate.mjs';
import {
  WHATSAPP_TIMEOUT_MS,
  formatSalesAlertTotal,
  logOrderAlert,
  sendAffiliateOrderWhatsApp,
  sendCustomerOrderConfirmation,
} from '@/lib/orderWhatsAppAlerts';

export const runtime = 'nodejs';
// Every post-order alert now runs before the response, so this budget covers
// the whole handler. The default was short enough that a slow SMTP handshake
// could eat it and silently drop the alerts.
export const maxDuration = 60;

const REQUIRED_FIELDS = ['order_number', 'customer_name', 'customer_phone', 'items'];

async function applyTrustedAgentReferralAttribution(supabase, untrustedOrder) {
  const order = { ...untrustedOrder };
  // Checkout callers do not choose payout rates. Attribution is resolved from
  // the linked server-side profile below.
  delete order.agent_commission_rate_override;
  delete order.agent_commission_source;

  let affiliate = null;
  if (order.affiliate_id) {
    const { data } = await supabase
      .from('affiliates')
      .select('*')
      .eq('id', order.affiliate_id)
      .maybeSingle();
    affiliate = data || null;
  }

  // The browser does not get to say what a referral earns. These two columns
  // arrived in the POST body and were written down as given, and the weekly
  // affiliate scan sums them straight off the row onto an invoice somebody
  // approves and pays. Recomputed here from the affiliate's own stored rate, so
  // the figure on that invoice is ours. The sales-agent branches below zero
  // these deliberately — they pay through the agent report instead — and still
  // win, because they run after this.
  Object.assign(order, affiliateCommissionPatch(order, affiliate));

  if (isSalesAgentAffiliate(affiliate)) {
    const { data: profile } = await supabase
      .from('admin_profiles')
      .select('*')
      .eq('user_id', affiliate.admin_profile_user_id)
      .maybeSingle();

    if (isEligibleSalesAgentProfile(profile)) {
      return applySalesAgentReferral(order, profile);
    }

    // A suspended or otherwise invalid linked agent must not fall through to
    // the ordinary affiliate payout and accidentally earn there instead.
    return {
      ...order,
      affiliate_commission_usd: 0,
      affiliate_commission_crc: 0,
    };
  }

  const requestedAgent = String(order.sales_agent || '').trim().toLowerCase();
  if (!requestedAgent) return order;

  const { data: profiles } = await supabase.from('admin_profiles').select('*');
  const profile = (profiles || []).find((row) => agentMatchKeys(row).has(requestedAgent));
  if (!isEligibleSalesAgentProfile(profile)) return order;

  const { data: linkedAffiliate } = await supabase
    .from('affiliates')
    .select('*')
    .eq('admin_profile_user_id', profile.user_id)
    .maybeSingle();

  return applySalesAgentReferral({
    ...order,
    affiliate_id: linkedAffiliate?.id || order.affiliate_id || null,
  }, profile);
}

/**
 * Credits a returning customer's order to the agent who first closed them.
 *
 * Runs only when the order arrived with no agent, so a referral link always
 * wins. Attribution is never worth losing a sale over: if the lookup fails the
 * order saves unattributed and an agent can still assign it by hand.
 */
async function applyCustomerHistoryAttribution(supabase, order) {
  if (String(order?.sales_agent || '').trim()) return order;

  try {
    const { data: profiles } = await supabase.from('admin_profiles').select('*');

    const match = await lookupHistoricalAgent(supabase, {
      phone: order.customer_phone,
      email: order.customer_email,
      // Some closed orders record an agent's email rather than their name.
      // Without this they read as a second, non-existent agent.
      resolveAgent: buildAgentNameResolver(profiles),
    });
    if (!match) return order;

    // The agent who closed them may have left since. Only a currently eligible
    // profile can be credited, otherwise the order is left unassigned.
    const profile = (profiles || []).find((row) => agentMatchKeys(row).has(match.agent.toLowerCase()));
    if (!isEligibleSalesAgentProfile(profile)) return order;

    console.log(`[orders/create] Attributed to ${match.agent} from customer history`);
    return {
      ...order,
      sales_agent: match.agent,
      agent_commission_source: CUSTOMER_HISTORY_SOURCE,
    };
  } catch (err) {
    console.warn('[orders/create] History attribution skipped:', err.message);
    return order;
  }
}

function isFkViolation(error) {
  const msg = error?.message || '';
  return msg.includes('foreign key constraint') || error?.code === '23503';
}

/**
 * The durable "a new order landed" record behind the admin bell.
 *
 * This is written before any alert is attempted, precisely because the email
 * and WhatsApp alerts are best-effort: if all of them fail, the team still has
 * one notification that cannot be lost to a timeout. The dynamic pending-order
 * badge does not cover this — it vanishes the moment the status moves off
 * "Pending", and never appears for card orders ("Pending - Card").
 */
async function recordNewOrderNotification(supabase, order, orderNumber) {
  // Counts what the customer paid for. Orders carry an explicit zero-price line
  // for the free BAC water, and counting it would report a 5-vial order as
  // "10 articulos" — inflating every alert the team reads.
  const itemCount = (order.items || []).reduce((total, item) => (
    Number(item.price || 0) > 0 ? total + Number(item.qty || 0) : total
  ), 0);
  const method = String(order.payment_method || 'order').toUpperCase();

  const { error } = await supabase.from('admin_notifications').insert({
    type: 'new_order',
    title: `New order ${orderNumber} (${method})`,
    body: `${order.customer_name || 'Customer'} — ${formatSalesAlertTotal(order)} · ${itemCount} ${itemCount === 1 ? 'unit' : 'units'}`.slice(0, 500),
    link_tab: 'orders',
    link_ref: orderNumber,
  });

  if (error) throw new Error(error.message);
}

/**
 * Records an order alert in whatsapp_messages so its delivery can be seen.
 *
 * Meta returning a message id only means "accepted for delivery" — the real
 * `sent -> delivered -> read` trail arrives later as webhook status callbacks,
 * and /api/whatsapp/webhook applies them by matching `meta_message_id`. Order
 * alerts were the one send path that never wrote such a row, so their statuses
 * had nowhere to land and "did that number actually get the alert?" was
 * unanswerable. Best-effort: a logging failure must not fail the order.
 */
/**
 * Where the new-order WhatsApp alert goes.
 *
 * Notification Settings covers standalone destinations. Team-member WhatsApp
 * opt-ins are added from admin_profiles so editing a member controls that
 * member's own order alerts.
 */
async function resolveAgentWhatsAppRecipients(supabase) {
  const { available, recipients } = await getNotificationRecipients(supabase, {
    channel: 'whatsapp',
    type: 'new_order',
  });

  const { data, error } = await selectWithOptionalPreferences(
    ['name', 'notifications_enabled', 'order_whatsapp_notifications', 'whatsapp_number'],
    (columns) => supabase.from('admin_profiles').select(columns)
  );

  if (error) {
    if (available) {
      console.warn('[orders/create] Could not load team WhatsApp preferences:', error.message);
      return mergeOrderWhatsAppDestinations({ managed: recipients, managedAvailable: true, profiles: [] });
    }
    throw new Error(error.message);
  }

  return mergeOrderWhatsAppDestinations({
    managed: recipients,
    managedAvailable: available,
    profiles: data || [],
  });
}

/**
 * New-order WhatsApp alerts for everyone on the notification list.
 *
 * The version before last blasted three hardcoded company numbers — one of
 * which was the business's own WhatsApp number, which Meta rejects on every
 * send. Destinations are explicit now, and a destination no longer has to be a
 * team member with a login.
 */
async function sendAgentOrderWhatsApp(supabase, order, orderNumber, orderId = null) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    console.warn('[orders/create] Agent WhatsApp skipped: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set');
    return;
  }

  const recipients = await resolveAgentWhatsAppRecipients(supabase);

  if (recipients.length === 0) {
    console.warn(`[orders/create] Agent WhatsApp skipped for ${orderNumber}: nobody has the alert switched on with a usable number`);
    return;
  }

  console.log(`[orders/create] Sending agent WhatsApp for ${orderNumber} to ${recipients.length} recipient(s)`);

  const templateName = process.env.SALES_TEAM_WHATSAPP_TEMPLATE || 'alerta_nuevo_pedido';
  const templateLanguage = process.env.SALES_TEAM_WHATSAPP_TEMPLATE_LANGUAGE || 'es';
  // Counts what the customer paid for. Orders carry an explicit zero-price line
  // for the free BAC water, and counting it would report a 5-vial order as
  // "10 articulos" — inflating every alert the team reads.
  const itemCount = (order.items || []).reduce((total, item) => (
    Number(item.price || 0) > 0 ? total + Number(item.qty || 0) : total
  ), 0);

  const results = await Promise.allSettled(recipients.map(async ({ phone }) => {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: orderNumber },
              { type: 'text', text: `${order.customer_name} - ${order.customer_phone || 'N/A'}` },
              { type: 'text', text: formatSalesAlertTotal(order) },
              { type: 'text', text: `${itemCount} ${itemCount === 1 ? 'articulo' : 'articulos'}` },
            ],
          }],
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || `Meta API returned ${response.status}`);
    const messageId = result.messages?.[0]?.id;

    await logOrderAlert(supabase, {
      phone,
      messageId,
      summary: `New order alert ${orderNumber} — ${order.customer_name} · ${formatSalesAlertTotal(order)} · ${itemCount} ${itemCount === 1 ? 'articulo' : 'articulos'}`,
      orderId,
      raw: result,
    });

    return { phone, messageId };
  }));

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log('[orders/create] Agent WhatsApp alert sent:', result.value);
    } else {
      console.error('[orders/create] Agent WhatsApp alert failed:', {
        agent: recipients[index].name,
        error: result.reason?.message || String(result.reason),
      });
    }
  });
}

export async function POST(request) {
  try {
    if (!isTrustedStorefrontRequest(request)) {
      return NextResponse.json({ error: 'Request origin is not allowed' }, { status: 403 });
    }

    const { body } = await readLimitedJson(request, 96 * 1024);
    let order = body?.order;

    if (!order || typeof order !== 'object') {
      return NextResponse.json({ error: 'Missing order payload' }, { status: 400 });
    }

    for (const field of REQUIRED_FIELDS) {
      if (!order[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'Order must include at least one item' }, { status: 400 });
    }
    if (order.items.length > 50
        || order.items.some((item) => !Number.isInteger(Number(item?.qty))
          || Number(item.qty) < 1
          || Number(item.qty) > 100)) {
      return NextResponse.json({ error: 'Order item limits exceeded' }, { status: 400 });
    }
    if (!/^[A-Za-z0-9-]{6,64}$/.test(String(order.order_number || ''))
        || String(order.customer_phone || '').length > 40
        || String(order.customer_email || '').length > 254
        || String(order.shipping_address || '').length > 2000
        || !['card', 'whatsapp'].includes(String(order.payment_method || '').toLowerCase())) {
      return NextResponse.json({ error: 'Invalid order details' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const ip = getRequestIp(request);
    const ipLimit = await consumeDurableRateLimit(supabase, {
      bucket: 'order-create-ip',
      key: ip,
      limit: 6,
      windowSeconds: 60 * 60,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: ipLimit.unavailable ? 'Checkout protection is temporarily unavailable' : 'Too many order attempts. Please try again later.' },
        { status: ipLimit.unavailable ? 503 : 429, headers: rateLimitHeaders(ipLimit) },
      );
    }

    const contactKey = `${String(order.customer_email || '').trim().toLowerCase()}|${String(order.customer_phone || '').replace(/\D/g, '')}`;
    const contactLimit = await consumeDurableRateLimit(supabase, {
      bucket: 'order-create-contact',
      key: contactKey,
      limit: 5,
      windowSeconds: 24 * 60 * 60,
    });
    if (!contactLimit.allowed) {
      return NextResponse.json(
        { error: contactLimit.unavailable ? 'Checkout protection is temporarily unavailable' : 'Too many orders for these contact details today.' },
        { status: contactLimit.unavailable ? 503 : 429, headers: rateLimitHeaders(contactLimit) },
      );
    }

    // The opening status is ours, not the caller's. This route is public and
    // runs as service-role, so a posted `status: 'Paid'` used to create a
    // settled order that no money had ever been attached to — one the weekly
    // commission scan then counted as a real sale. Derived from the payment
    // method, which is the only thing that has ever decided it in practice.
    //
    // Set here rather than just before the insert so the alerts and the
    // abandoned-cart cleanup further down read the same status the row gets.
    order.status = checkoutOrderStatus(order.payment_method);

    // The same rules the checkout form runs, run again here. The browser is not
    // the authority: a stale tab, a retry from a saved payload or a direct post
    // would otherwise write a name nobody can address a package to. Names are
    // stored normalized so the staff alert and the courier label match.
    const orderLang = order.lang === 'en' ? 'en' : 'es';
    const nameCheck = validateCustomerName(order.customer_name);
    if (!nameCheck.ok) {
      return NextResponse.json({ error: identityMessage(nameCheck.reason, orderLang) }, { status: 400 });
    }
    order.customer_name = nameCheck.name;

    let resolvedPromo = null;

    try {
      const customer = await resolveCustomerOrderOwner(
        supabase,
        request.headers.get('authorization'),
      );
      order = applyCustomerOrderOwnership(order, customer?.id);
    } catch (error) {
      if (error instanceof CustomerSessionError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    if (order.promo_code) {
      const { data: promoData } = await supabase
        .from('promo_codes')
        .select('is_active, valid_from, valid_until, usage_limit, usage_count, once_per_customer, min_units, max_units, discount_pct, target_product, is_flash_sale')
        .eq('code', order.promo_code.toUpperCase())
        .single();
        
      if (!promoData) {
        return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 });
      }
      resolvedPromo = promoData;
      if (!promoData.is_active) {
        return NextResponse.json({ error: 'Promo code is inactive' }, { status: 400 });
      }
      
      const now = new Date();
      if (promoData.valid_from && now < new Date(promoData.valid_from)) {
        return NextResponse.json({ error: 'Promo code is not yet active' }, { status: 400 });
      }
      if (promoData.valid_until && now > new Date(promoData.valid_until)) {
        // Auto-deactivate expired code
        await supabase.from('promo_codes').update({ is_active: false }).eq('code', order.promo_code.toUpperCase());
        return NextResponse.json({ error: 'Promo code has expired' }, { status: 400 });
      }
      if (promoData.usage_limit !== null && promoData.usage_count >= promoData.usage_limit) {
        return NextResponse.json({ error: 'Promo code has reached its usage limit' }, { status: 400 });
      }
      // Unit conditions, re-checked against the items actually being ordered.
      // The browser already blocks this, but the browser is not the authority:
      // a capped intro code ("up to 4") is worth real money on a 30-vial order,
      // so the cart size is verified once more before anything is saved.
      const unitCheck = checkUnitLimits(
        promoData,
        // Only the products this code discounts count toward its minimum. A
        // basket padded with items the code does not cover must not unlock it.
        countPromoEligibleUnits(promoData, order.items.filter((item) => !isGiftLine(item))),
      );
      if (!unitCheck.ok) {
        return NextResponse.json({
          error: unitLimitsMessage(promoData, unitCheck.unitCount, order.lang || 'es'),
        }, { status: 400 });
      }
      // One-time-per-customer codes: block if this customer (by email or phone)
      // already has a prior order using this code.
      if (promoData.once_per_customer) {
        const codeUpper = order.promo_code.toUpperCase();
        let alreadyUsed = false;
        const checkPriorUse = async (field, value) => {
          if (alreadyUsed || !value) return;
          const { data: prior } = await supabase
            .from('orders')
            .select('promo_code')
            .eq(field, value)
            .not('promo_code', 'is', null);
          if ((prior || []).some((o) => String(o.promo_code || '').trim().toUpperCase() === codeUpper)) {
            alreadyUsed = true;
          }
        };
        await checkPriorUse('customer_email', order.customer_email);
        await checkPriorUse('customer_phone', order.customer_phone);
        if (alreadyUsed) {
          return NextResponse.json({ error: 'This promo code can only be used once per customer.' }, { status: 400 });
        }
      }
    }

    // Rebuild every public order from current product rows. A saved browser cart
    // can straddle a deal start/end, and callers can edit posted prices; neither
    // is allowed to decide what the customer is charged.
    const requestedProductNames = [...new Set(order.items
      .filter((item) => !isGiftLine(item))
      .map((item) => stripGiftSuffix(item?.product || item?.name))
      .filter(Boolean))];
    const [{ data: currentProducts, error: productError }, rateResult] = await Promise.all([
      supabase
        .from('products')
        .select('id,product,price_usd,price_crc,status,inventory_count')
        .in('product', requestedProductNames),
      getDatabaseBackedUsdToCrcRate(),
    ]);
    if (productError) {
      return NextResponse.json({ error: `Could not verify current prices: ${productError.message}` }, { status: 503 });
    }
    const authoritative = authoritativeCheckout({
      postedOrder: order,
      products: currentProducts || [],
      promo: resolvedPromo,
      exchangeRate: rateResult.rate,
    });
    if (!authoritative.ok) {
      return NextResponse.json({ error: authoritative.error, errorCode: 'cart_invalid' }, { status: 409 });
    }
    if (authoritative.changed) {
      return NextResponse.json({
        error: orderLang === 'en'
          ? 'A product price changed while this cart was open. We updated the cart; review the new total and submit again.'
          : 'El precio de un producto cambió mientras el carrito estaba abierto. Actualizamos el carrito; revise el nuevo total y envíe de nuevo.',
        errorCode: 'price_changed',
        pricing: authoritative,
      }, { status: 409 });
    }

    order.items = authoritative.items;
    // Recorded rather than recomputed later: the tier rules change during a
    // deal week, and this order's badge must keep showing the rate it was
    // actually charged. Dropped harmlessly if the migration has not been run.
    order.volume_discount_pct = authoritative.volumeDiscountPct ?? 0;
    order.total_usd = authoritative.totalUsd;
    order.total_crc = authoritative.totalCrc;
    order.discount_amount_usd = order.currency === 'USD'
      ? authoritative.promoDiscount
      : Number((authoritative.promoDiscount / rateResult.rate).toFixed(2));
    order.discount_amount_crc = order.currency === 'CRC'
      ? authoritative.promoDiscount
      : Math.round(authoritative.promoDiscount * rateResult.rate);
    order.shipping_cost_usd = order.currency === 'USD'
      ? authoritative.shipping
      : Number((authoritative.shipping / rateResult.rate).toFixed(2));
    order.shipping_cost_crc = order.currency === 'CRC'
      ? authoritative.shipping
      : Math.round(authoritative.shipping * rateResult.rate);

    // Attribution is derived from the live deal and the products actually
    // priced, never from a query parameter supplied by the shopper.
    const { data: liveDeals } = await supabase
      .from('deals')
      .select('id,status,starts_at,ends_at,product_names')
      .eq('status', 'live');
    const matchedDeal = activeDealForOrder(liveDeals || [], order.items);
    if (matchedDeal) order.deal_id = matchedDeal.id;

    // A marketing tag must never cost us the sale. A free-text campaign name
    // reaching a uuid column used to fail the whole insert, which broke
    // checkout for every customer who arrived through that link.
    const { order: sanitizedOrder, dropped: droppedAttribution } = sanitizeOrderAttribution(order);
    const referredOrder = await applyTrustedAgentReferralAttribution(supabase, sanitizedOrder);
    // A returning customer goes back to the agent who first closed them, so the
    // team keeps its clients now that the WhatsApp history is gone. This only
    // fills a gap: an order that already has an agent (a referral link) is left
    // exactly as it is, so nobody is paid twice for the same sale.
    const orderRow = await applyCustomerHistoryAttribution(supabase, referredOrder);
    // A public request may create an unpaid order, but it may not mutate stock.
    // The empty reservation is explicit so authenticated settlement/card approval
    // can distinguish this order from legacy rows whose stock was already taken.
    orderRow.inventory_deducted = [];
    let savedOrderForAlerts = orderRow;
    if (droppedAttribution.length) {
      console.warn(
        '[orders/create] Dropped invalid attribution (order still saved):',
        droppedAttribution.map(({ field, value }) => `${field}="${value}"`).join(', ')
      );
    }

    // The checkout page collected this by calling ipapi.co, then db-ip, then
    // ipify from the customer's browser. Ad blockers block all three, which is
    // why roughly one order in seven has no address at all, and a value the
    // browser supplies can be edited by whoever is sending it. The platform
    // already puts the real client address on the request, so it is read here
    // and the browser's guess kept only as a local-development fallback.
    const forwardedFor = request.headers.get('x-forwarded-for')
      || request.headers.get('x-real-ip')
      || '';
    const requestIp = forwardedFor.split(',')[0].trim();
    if (requestIp) orderRow.ip_address = requestIp;

    // utm_campaign arrives via its own hand-run migration
    // (add-order-utm-campaign.sql). Dropping it rather than failing keeps
    // checkout working on a database that has not had that file pasted in yet —
    // the same principle as the attribution sanitizer: an order is worth more
    // than its marketing tag.
    let { data, error, droppedColumns } = await writeDroppingMissingColumns(
      orderRow,
      ['utm_campaign', 'deal_id', 'inventory_deducted', 'volume_discount_pct'],
      (row) => supabase.from('orders').insert(row).select('id, order_number').single(),
    );
    if (droppedColumns?.length) {
      console.warn(`[orders/create] Order saved without ${droppedColumns.join(', ')} — run the migration to keep it.`);
    }

    if (error && isFkViolation(error) && orderRow.affiliate_id) {
      console.warn('[orders/create] Affiliate FK failed, retrying without affiliate fields:', error.message);
      const { affiliate_id, affiliate_commission_usd, affiliate_commission_crc, ...withoutAffiliate } = orderRow;
      savedOrderForAlerts = withoutAffiliate;
      ({ data, error } = await supabase
        .from('orders')
        .insert(withoutAffiliate)
        .select('id, order_number')
        .single());
    }

    if (error) {
      console.error('[orders/create] Insert failed:', error.message, { order_number: order.order_number });
      try {
        await supabase.from('admin_notifications').insert({
          type: 'order_save_failed',
          title: `Order save failed: ${order.order_number}`,
          body: `${order.customer_name} — ${error.message}`.slice(0, 500),
          link_tab: 'orders',
          link_ref: order.order_number,
        });
      } catch {
        // notification table may not exist yet
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Raise the bell before anything that can fail slowly. Email and WhatsApp
    // are best-effort; this row is the one alert the team is guaranteed to get.
    try {
      await recordNewOrderNotification(supabase, order, data.order_number);
    } catch (notifyErr) {
      console.error('[orders/create] New order notification insert failed:', notifyErr.message);
    }

    const updatePromises = [];
    if (body.sessionId) {
      updatePromises.push(
        supabase
          .from('abandoned_carts')
          .delete()
          .eq('session_id', body.sessionId)
      );
    }
    if (order.customer_phone) {
      const cleanPhone = order.customer_phone.replace(/\D/g, '');
      const phoneSearch = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone;
      updatePromises.push(
        supabase
          .from('abandoned_carts')
          .delete()
          .ilike('customer_phone', `%${phoneSearch}%`)
      );
    }
    if (order.customer_email) {
      updatePromises.push(
        supabase
          .from('abandoned_carts')
          .delete()
          .eq('customer_email', order.customer_email)
      );
    }
    if (order.promo_code) {
      updatePromises.push(
        (async () => {
          const { data: pCode } = await supabase.from('promo_codes').select('usage_count').eq('code', order.promo_code).single();
          if (pCode) {
            await supabase.from('promo_codes').update({ usage_count: (pCode.usage_count || 0) + 1 }).eq('code', order.promo_code);
          }
        })()
      );
    }

    if (updatePromises.length > 0) {
      try {
        await Promise.all(updatePromises);
      } catch (cartErr) {
        console.warn('[orders/create] Abandoned cart update failed:', cartErr.message);
      }
    }

    const { error: paidCartCleanupError } = await markActiveAbandonedCartsConvertedForOrder(supabase, order);
    if (paidCartCleanupError) {
      console.warn('[orders/create] Paid cart cleanup failed:', paidCartCleanupError.message);
    }

    // Every post-order alert runs here, before the response.
    //
    // In `after()` these produced no result and no log at all — while the
    // identical WhatsApp call in /api/leads/capture, made from the request
    // path, sends reliably. The WhatsApp alerts were moved out first; the
    // admin email was left behind and kept vanishing on its own, which is why
    // a test order could land in the dashboard, mail the customer, and still
    // never reach the team.
    //
    // They run together so the checkout waits for the slowest one rather than
    // the sum, and each is capped tightly enough that neither Meta nor SMTP
    // can hold up a customer.
    const baseUrl = new URL(request.url).origin;
    const alerts = [
      order.payment_method === 'card' 
        ? ['customer WhatsApp (skipped)', Promise.resolve()]
        : ['customer WhatsApp', sendCustomerOrderConfirmation(supabase, savedOrderForAlerts, data.order_number, data.id)],
      ['agent WhatsApp', sendAgentOrderWhatsApp(supabase, savedOrderForAlerts, data.order_number, data.id)],
      ['affiliate WhatsApp', sendAffiliateOrderWhatsApp(supabase, savedOrderForAlerts, data.order_number, data.id)],
      // A card order's alert is held until the charge answers, so the team
      // gets one email that states the outcome instead of two — the first of
      // which could only ever say "PENDING - CARD", whether the card was about
      // to be approved or refused. The bell row above is raised either way, so
      // the order is never invisible while the charge is in flight.
      // Sent by /api/shieldhubpay/process-card, or by the webhook for 3DS.
      order.payment_method === 'card'
        ? ['admin email (deferred to payment result)', Promise.resolve()]
        : ['order emails', sendAdminOrderEmail(baseUrl, savedOrderForAlerts, data.order_number, {
          notificationOptions: {
            adminNotificationOnly: false,
            customerReceiptOnly: false,
          },
        })],
    ];
    const alertResults = await Promise.allSettled(alerts.map(([, promise]) => promise));
    alertResults.forEach((result, index) => {
      const label = alerts[index][0];
      if (result.status === 'rejected') {
        console.error(`[orders/create] ${label} alert failed for ${data.order_number}:`, result.reason?.message || String(result.reason));
      } else {
        console.log(`[orders/create] ${label} alert completed for ${data.order_number}`);
      }
    });

    const paymentToken = order.payment_method === 'card'
      ? createCardCheckoutToken(data.order_number, data.id)
      : null;
    return NextResponse.json({
      ok: true,
      id: data.id,
      orderNumber: data.order_number,
      ...(paymentToken ? { paymentToken } : {}),
    });
  } catch (err) {
    console.error('[orders/create] Unexpected error:', err);
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
