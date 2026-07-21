import { after, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { markActiveAbandonedCartsConvertedForOrder } from '@/lib/abandonedCartRecovery.mjs';

export const runtime = 'nodejs';

const REQUIRED_FIELDS = ['order_number', 'customer_name', 'customer_phone', 'items'];

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
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.error || result?.details || `Order notification returned ${response.status}`);
  }
}

async function sendSalesOrderAlerts(order, orderNumber) {
  const recipients = (process.env.SALES_TEAM_WHATSAPP_NUMBERS || '')
    .split(',')
    .map((phone) => phone.replace(/\D/g, ''))
    .filter(Boolean);
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (recipients.length === 0 || !accessToken || !phoneNumberId) {
    console.warn('[orders/create] Sales WhatsApp alert skipped: configuration is incomplete.');
    return;
  }

  const templateName = process.env.SALES_TEAM_WHATSAPP_TEMPLATE || 'alerta_nuevo_pedido';
  const templateLanguage = process.env.SALES_TEAM_WHATSAPP_TEMPLATE_LANGUAGE || 'es';
  const itemCount = order.items.reduce((total, item) => total + Number(item.qty || 0), 0);
  const itemLabel = `${itemCount} ${itemCount === 1 ? 'articulo' : 'articulos'}`;

  const results = await Promise.allSettled(recipients.map(async (phone) => {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
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
              { type: 'text', text: itemLabel },
            ],
          }],
        },
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result?.error?.message || `Meta API returned ${response.status}`);
    }

    return { phone, messageId: result.messages?.[0]?.id };
  }));

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log('[orders/create] Sales WhatsApp alert sent:', result.value);
    } else {
      console.error(
        '[orders/create] Sales WhatsApp alert failed:',
        { phone: recipients[index], error: result.reason?.message || String(result.reason) }
      );
    }
  });
}

async function sendCustomerOrderConfirmation(order, orderNumber) {
  const customerPhone = order.customer_phone?.replace(/\D/g, '');
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!customerPhone || !accessToken || !phoneNumberId) {
    return;
  }
  
  // Format Costa Rica numbers if lacking country code
  let cleanPhone = customerPhone;
  if (cleanPhone.length === 8) cleanPhone = '506' + cleanPhone;

  // Use Spanish by default, or English if currency is USD
  const templateLanguage = order.currency === 'USD' ? 'en' : 'es';

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
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
              { type: 'text', text: order.items?.map(i => `${i.quantity || 1}x ${i.name || i.product_name || 'Producto'}`).join(', ') || 'Productos varios' },
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
        .select('is_active, valid_from, valid_until, usage_limit, usage_count, once_per_customer')
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

    let { data, error } = await supabase
      .from('orders')
      .insert(order)
      .select('id, order_number')
      .single();

    if (error && isFkViolation(error) && order.affiliate_id) {
      console.warn('[orders/create] Affiliate FK failed, retrying without affiliate fields:', error.message);
      const { affiliate_id, affiliate_commission_usd, affiliate_commission_crc, ...withoutAffiliate } = order;
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
    after(async () => {
      try {
        await sendAdminOrderEmail(baseUrl, order, data.order_number);
      } catch (err) {
        console.error('[orders/create] Background admin email alert error:', err);
      }

      try {
        await sendSalesOrderAlerts(order, data.order_number);
      } catch (err) {
        console.error('[orders/create] Background sales alert error:', err);
      }
      
      try {
        await sendCustomerOrderConfirmation(order, data.order_number);
      } catch (err) {
        console.error('[orders/create] Background customer alert error:', err);
      }
    });

    return NextResponse.json({ ok: true, id: data.id, orderNumber: data.order_number });
  } catch (err) {
    console.error('[orders/create] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
