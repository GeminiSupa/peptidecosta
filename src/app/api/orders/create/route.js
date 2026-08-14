import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { countCartUnits, checkUnitLimits, unitLimitsMessage } from '@/lib/promoEligibility.mjs';
import { mergeOrderWhatsAppDestinations, selectWithOptionalPreferences } from '@/lib/notificationPreferences.mjs';
import { sanitizeOrderAttribution } from '@/lib/orderAttribution.mjs';
import { sendAdminOrderEmail } from '@/lib/adminOrderEmail.mjs';
import { agentMatchKeys } from '@/lib/agentOrders';
import { CUSTOMER_HISTORY_SOURCE, buildAgentNameResolver, lookupHistoricalAgent } from '@/lib/agentAttribution.mjs';
import { getNotificationRecipients } from '@/lib/notificationRecipients.mjs';
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
    const body = await request.json();
    const order = body?.order;

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

    const supabase = getSupabaseAdmin();

    if (order.promo_code) {
      const { data: promoData } = await supabase
        .from('promo_codes')
        .select('is_active, valid_from, valid_until, usage_limit, usage_count, once_per_customer, min_units, max_units')
        .eq('code', order.promo_code.toUpperCase())
        .single();
        
      if (!promoData) {
        return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 });
      }
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
      const unitCheck = checkUnitLimits(promoData, countCartUnits(order.items));
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

    let { data, error } = await supabase
      .from('orders')
      .insert(orderRow)
      .select('id, order_number')
      .single();

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

    // --- NEW: Deduct Inventory & Check Low Stock Threshold ---
    try {
      for (const item of order.items) {
        if (!item.product || !item.qty) continue;

        // Fetch current inventory and threshold
        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select('inventory_count, low_stock_threshold')
          .eq('product', item.product)
          .single();

        if (prodErr || !prodData || prodData.inventory_count === null) {
          continue; // Not tracking inventory for this product
        }

        const currentInventory = prodData.inventory_count;
        const threshold = prodData.low_stock_threshold !== null ? prodData.low_stock_threshold : 5;
        const newInventory = Math.max(0, currentInventory - item.qty);

        // Update the inventory count
        await supabase
          .from('products')
          .update({ inventory_count: newInventory })
          .eq('product', item.product);

        // Check if we just crossed the threshold, or hit zero
        const crossedThreshold = currentInventory > threshold && newInventory <= threshold;
        const hitZero = currentInventory > 0 && newInventory === 0;

        if (crossedThreshold || hitZero) {
          await supabase.from('admin_notifications').insert({
            type: 'low_inventory',
            title: hitZero ? `Out of Stock: ${item.product}` : `Low Stock Alert: ${item.product}`,
            body: `Inventory has dropped to ${newInventory} unit(s).`,
            link_tab: 'spreadsheet',
          });
        }
      }
    } catch (invErr) {
      console.error('[orders/create] Inventory deduction failed:', invErr);
      // We don't fail the order if inventory deduction fails
    }
    // --------------------------------------------------------

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
      ['admin email', sendAdminOrderEmail(baseUrl, savedOrderForAlerts, data.order_number)],
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

    return NextResponse.json({ ok: true, id: data.id, orderNumber: data.order_number });
  } catch (err) {
    console.error('[orders/create] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
