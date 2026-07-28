import { after, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';
import { countCartUnits, checkUnitLimits, unitLimitsMessage } from '@/lib/promoEligibility.mjs';
import { agentWhatsAppNumber, selectWithOptionalPreferences, wantsOrderWhatsApp } from '@/lib/notificationPreferences.mjs';
import { sanitizeOrderAttribution } from '@/lib/orderAttribution.mjs';

export const runtime = 'nodejs';
// The post-order alerts run in `after()`, which is capped by this route's max
// duration. The default was short enough that a slow SMTP handshake could eat
// the whole budget and silently drop every alert.
export const maxDuration = 60;

const REQUIRED_FIELDS = ['order_number', 'customer_name', 'customer_phone', 'items'];
/** No alert should be able to hold the background block hostage. */
const ALERT_TIMEOUT_MS = 15000;
/**
 * The WhatsApp calls run before the response, so this is time the customer
 * spends staring at a spinner. The order is already saved by then — if Meta is
 * slow we give up and let the checkout finish.
 */
const WHATSAPP_TIMEOUT_MS = 6000;

function isFkViolation(error) {
  const msg = error?.message || '';
  return msg.includes('foreign key constraint') || error?.code === '23503';
}

function formatSalesAlertTotal(order) {
  return order.currency === 'USD'
    ? `$${Number(order.total_usd || 0).toLocaleString('en-US')}`
    : `CRC ${Number(order.total_crc || 0).toLocaleString('es-CR')}`;
}

function buildOrderNotificationPayload(order, orderNumber) {
  const items = Array.isArray(order.items) ? order.items : [];
  const currency = order.currency || 'USD';
  const itemsAmount = items.reduce((sum, item) => {
    return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
  }, 0);
  const shipping = currency === 'CRC'
    ? Number(order.shipping_cost_crc || 0)
    : Number(order.shipping_cost_usd || 0);
  const promoDiscount = currency === 'CRC'
    ? Number(order.discount_amount_crc || 0)
    : Number(order.discount_amount_usd || 0);
  const total = currency === 'CRC'
    ? Number(order.total_crc || 0)
    : Number(order.total_usd || 0);
  const volumeDiscount = Math.max(0, itemsAmount - promoDiscount + shipping - total);

  return {
    orderNumber,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerEmail: order.customer_email || '',
    shippingAddress: order.shipping_address,
    customerIdType: order.customer_id_type,
    customerIdNumber: order.customer_id_number,
    items,
    total,
    totalUsd: order.total_usd,
    totalCrc: order.total_crc,
    subtotal: itemsAmount,
    volumeDiscount,
    promoDiscount,
    shipping,
    currency,
    paymentMethod: order.payment_method,
    status: order.status || 'Pending',
    adminNotificationOnly: true,
    lang: currency === 'CRC' ? 'es' : 'en',
  };
}

async function sendAdminOrderEmail(baseUrl, order, orderNumber) {
  const response = await fetch(`${baseUrl}/api/order-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildOrderNotificationPayload(order, orderNumber)),
    signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.error || result?.details || `Order notification returned ${response.status}`);
  }
}

/**
 * The durable "a new order landed" record behind the admin bell.
 *
 * This is written on the request path, not in `after()`, precisely because the
 * email and WhatsApp alerts are best-effort: if both fail, the team still has
 * one notification that cannot be lost to a timeout. The dynamic pending-order
 * badge does not cover this — it vanishes the moment the status moves off
 * "Pending", and never appears for card orders ("Pending - Card").
 */
async function recordNewOrderNotification(supabase, order, orderNumber) {
  const itemCount = (order.items || []).reduce((total, item) => total + Number(item.qty || 0), 0);
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
 * New-order WhatsApp alerts for team members who asked for them.
 *
 * The previous version blasted three hardcoded company numbers — one of which
 * was the business's own WhatsApp number, which Meta rejects on every send.
 * This is opt-in per member and goes to that member's own number, so it sends
 * nothing at all until someone switches it on in Team Management.
 */
async function sendAgentOrderWhatsApp(supabase, order, orderNumber) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    console.warn('[orders/create] Agent WhatsApp skipped: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set');
    return;
  }

  const { data, error } = await selectWithOptionalPreferences(
    ['name', 'notifications_enabled', 'order_whatsapp_notifications', 'whatsapp_number'],
    (columns) => supabase.from('admin_profiles').select(columns)
  );

  if (error) throw new Error(error.message);

  // Before the migration the opt-in column is absent, so nobody qualifies and
  // this sends nothing at all.
  const recipients = (data || [])
    .filter(wantsOrderWhatsApp)
    .map((profile) => ({ name: profile.name, phone: agentWhatsAppNumber(profile) }))
    .filter((entry) => entry.phone)
    .filter((entry, index, all) => all.findIndex((other) => other.phone === entry.phone) === index);

  if (recipients.length === 0) {
    console.warn(`[orders/create] Agent WhatsApp skipped for ${orderNumber}: nobody has the alert switched on with a usable number`);
    return;
  }

  console.log(`[orders/create] Sending agent WhatsApp for ${orderNumber} to ${recipients.length} recipient(s)`);

  const templateName = process.env.SALES_TEAM_WHATSAPP_TEMPLATE || 'alerta_nuevo_pedido';
  const templateLanguage = process.env.SALES_TEAM_WHATSAPP_TEMPLATE_LANGUAGE || 'es';
  const itemCount = (order.items || []).reduce((total, item) => total + Number(item.qty || 0), 0);

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
    return { phone, messageId: result.messages?.[0]?.id };
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

async function sendCustomerOrderConfirmation(order, orderNumber) {
  const customerPhone = order.customer_phone?.replace(/\D/g, '');
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // Every one of these used to return in silence, which is why a missing
  // customer confirmation looked identical to one that was never attempted.
  if (!accessToken || !phoneNumberId) {
    console.warn('[orders/create] Customer WhatsApp skipped: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set');
    return;
  }
  if (!customerPhone) {
    console.warn(`[orders/create] Customer WhatsApp skipped for ${orderNumber}: no phone on the order`);
    return;
  }

  // Format Costa Rica numbers if lacking country code
  let cleanPhone = customerPhone;
  if (cleanPhone.length === 8) cleanPhone = '506' + cleanPhone;

  // Use Spanish by default, or English if currency is USD
  const templateLanguage = order.currency === 'USD' ? 'en' : 'es';

  // Cart items are stored as { product, qty, price }. Reading `name`/`quantity`
  // made every confirmation say "1x Producto" instead of what was ordered.
  const itemSummary = (order.items || [])
    .map((item) => `${Number(item.qty) || 1}x ${item.product || item.name || 'Producto'}`)
    .join(', ');

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: process.env.WHATSAPP_CUSTOMER_ORDER_TEMPLATE || 'confirmacion_pedido_cliente_v2',
          language: { code: templateLanguage },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: order.customer_name || 'Cliente' },
              { type: 'text', text: orderNumber },
              { type: 'text', text: itemSummary || 'Productos varios' },
              { type: 'text', text: formatSalesAlertTotal(order) },
            ],
          }],
        },
      }),
    });
    
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      console.error('[orders/create] Customer WhatsApp alert failed:', result);
    } else {
      console.log('[orders/create] Customer WhatsApp alert sent successfully to', cleanPhone);
    }
  } catch (error) {
    console.error('[orders/create] Customer WhatsApp alert error:', error.message);
  }
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
    const { order: orderRow, dropped: droppedAttribution } = sanitizeOrderAttribution(order);
    if (droppedAttribution.length) {
      console.warn(
        '[orders/create] Dropped invalid attribution (order still saved):',
        droppedAttribution.map(({ field, value }) => `${field}="${value}"`).join(', ')
      );
    }

    let { data, error } = await supabase
      .from('orders')
      .insert(orderRow)
      .select('id, order_number')
      .single();

    if (error && isFkViolation(error) && orderRow.affiliate_id) {
      console.warn('[orders/create] Affiliate FK failed, retrying without affiliate fields:', error.message);
      const { affiliate_id, affiliate_commission_usd, affiliate_commission_crc, ...withoutAffiliate } = orderRow;
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

    // Execute post-order alerts in the background
    const baseUrl = new URL(request.url).origin;
    // The email is delegated to another route, so it completes in its own
    // invocation and survives whatever happens to this one. The WhatsApp calls
    // talk to Meta directly, and in `after()` they produced no result and no
    // log at all — while the identical call in /api/leads/capture, made from
    // the request path, sends reliably. So they run here, before the response,
    // capped tightly enough that Meta can never hold up a checkout.
    const whatsappResults = await Promise.allSettled([
      sendCustomerOrderConfirmation(order, data.order_number),
      sendAgentOrderWhatsApp(supabase, order, data.order_number),
    ]);
    whatsappResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        const label = index === 0 ? 'customer' : 'agent';
        console.error(`[orders/create] ${label} WhatsApp error:`, result.reason?.message || String(result.reason));
      }
    });

    after(async () => {
      try {
        await sendAdminOrderEmail(baseUrl, order, data.order_number);
        console.log(`[orders/create] Admin order email dispatched for ${data.order_number}`);
      } catch (err) {
        console.error('[orders/create] Background admin email alert error:', err);
      }
    });

    return NextResponse.json({ ok: true, id: data.id, orderNumber: data.order_number });
  } catch (err) {
    console.error('[orders/create] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
