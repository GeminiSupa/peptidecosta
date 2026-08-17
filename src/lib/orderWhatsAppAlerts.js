import { insertWhatsAppMessage } from '@/lib/whatsappMessageLog';
import { toE164, isValidE164, DEFAULT_PHONE_COUNTRY } from '@/lib/phoneFormat.mjs';
import { isSalesAgentAffiliate, SALES_AGENT_REFERRAL_RATE } from '@/lib/salesAgentAffiliate.mjs';

/**
 * Order WhatsApp alerts, shared by the two routes that send them.
 *
 * These lived inside app/api/orders/create/route.js until the card flow needed
 * the customer confirmation too. Importing one route module from another pulls
 * the whole handler and its dependency tree into the caller's bundle, so the
 * pieces both routes need live here instead.
 */

/**
 * The WhatsApp calls run before the response, so this is time the customer
 * spends staring at a spinner. The order is already saved by then — if Meta is
 * slow we give up and let the checkout finish.
 */
export const WHATSAPP_TIMEOUT_MS = 6000;

export function formatSalesAlertTotal(order) {
  return order.currency === 'USD'
    ? `$${Number(order.total_usd || 0).toLocaleString('en-US')}`
    : `CRC ${Number(order.total_crc || 0).toLocaleString('es-CR')}`;
}

export function formatAffiliateCommissionTotal(order) {
  return order.currency === 'USD'
    ? `$${Number(order.affiliate_commission_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `CRC ${Number(order.affiliate_commission_crc || 0).toLocaleString('es-CR')}`;
}

export function formatAffiliateAlertCommission(order, affiliate) {
  if (!isSalesAgentAffiliate(affiliate)) return formatAffiliateCommissionTotal(order);

  const rate = Number(order.agent_commission_rate_override || SALES_AGENT_REFERRAL_RATE) / 100;
  if (order.currency === 'USD') {
    const base = Math.max(0, Number(order.total_usd || 0));
    return `$${(base * rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const base = Math.max(0, Number(order.total_crc || 0));
  return `CRC ${Math.round(base * rate).toLocaleString('es-CR')}`;
}

export async function logOrderAlert(supabase, { phone, messageId, summary, orderId, raw }) {
  if (!supabase || !messageId) return;
  try {
    const { error } = await insertWhatsAppMessage(supabase, {
      wa_id: phone,
      display_name: 'Order alert',
      message_text: summary,
      message_type: 'template',
      direction: 'outbound',
      source: 'cloud_api',
      matched_order_id: orderId || null,
      raw_payload: raw || null,
      meta_message_id: messageId,
      delivery_status: 'sent',
    });
    if (error) console.warn('[order-whatsapp] Could not log order alert:', error.message);
  } catch (err) {
    console.warn('[order-whatsapp] Could not log order alert:', err.message);
  }
}

export async function sendCustomerOrderConfirmation(supabase, order, orderNumber, orderId = null) {
  const customerPhone = order.customer_phone?.replace(/\D/g, '');
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // Every one of these used to return in silence, which is why a missing
  // customer confirmation looked identical to one that was never attempted.
  if (!accessToken || !phoneNumberId) {
    console.warn('[order-whatsapp] Customer WhatsApp skipped: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set');
    return;
  }
  if (!customerPhone) {
    console.warn(`[order-whatsapp] Customer WhatsApp skipped for ${orderNumber}: no phone on the order`);
    return;
  }

  // Checkout now sends a full international number. Older orders (and the
  // in-app order forms) can still carry a bare Costa Rica number, so it is
  // normalised here rather than assumed. The previous rule only knew how to
  // prefix exactly 8 digits and handed everything else to Meta untouched,
  // which came back "(#131009) the phone number is malformed".
  const cleanPhone = toE164(customerPhone, DEFAULT_PHONE_COUNTRY);

  if (!isValidE164(cleanPhone)) {
    console.warn(`[order-whatsapp] Customer WhatsApp skipped for ${orderNumber}: "${order.customer_phone}" is not a usable WhatsApp number`);
    return;
  }

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

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[order-whatsapp] Customer WhatsApp alert rejected by Meta:', result);
    } else {
      // Meta returning 200 means ACCEPTED, not delivered. The real outcome
      // arrives later on the status webhook, which is where a failure and its
      // error code get logged. Saying "sent successfully" here is what made
      // every subsequent delivery failure invisible — the message id is logged
      // instead so the two halves can be matched up.
      const acceptedId = result.messages?.[0]?.id || 'no-message-id';
      console.log(`[order-whatsapp] Customer WhatsApp alert accepted by Meta for ${cleanPhone} (message ${acceptedId}) — delivery confirmed separately by webhook`);
      await logOrderAlert(supabase, {
        phone: cleanPhone,
        messageId: result.messages?.[0]?.id,
        summary: `Order confirmation ${orderNumber} — ${itemSummary || 'Productos varios'} · ${formatSalesAlertTotal(order)}`,
        orderId,
        raw: result,
      });
    }
  } catch (error) {
    console.error('[order-whatsapp] Customer WhatsApp alert error:', error.message);
  }
}

async function markAffiliateOrderWhatsAppSent(supabase, orderId, messageId) {
  if (!supabase || !orderId) return;
  try {
    const { error } = await supabase
      .from('orders')
      .update({
        affiliate_whatsapp_notified_at: new Date().toISOString(),
        affiliate_whatsapp_message_id: messageId || null,
      })
      .eq('id', orderId);
    if (error) console.warn('[order-whatsapp] Could not mark affiliate WhatsApp notification:', error.message);
  } catch (err) {
    console.warn('[order-whatsapp] Could not mark affiliate WhatsApp notification:', err.message);
  }
}

export async function sendAffiliateOrderWhatsApp(supabase, order, orderNumber, orderId = null) {
  const affiliateId = order?.affiliate_id;
  if (!affiliateId) return { skipped: 'no_affiliate' };
  if (order?.affiliate_whatsapp_notified_at) return { skipped: 'already_notified' };

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    console.warn('[order-whatsapp] Affiliate WhatsApp skipped: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set');
    return { skipped: 'missing_whatsapp_config' };
  }

  const { data: affiliate, error } = await supabase
    .from('affiliates')
    .select('*')
    .eq('id', affiliateId)
    .maybeSingle();

  if (error) {
    console.warn('[order-whatsapp] Affiliate WhatsApp skipped: could not load affiliate:', error.message);
    return { skipped: 'affiliate_lookup_failed' };
  }
  if (!affiliate) return { skipped: 'affiliate_not_found' };

  const cleanPhone = toE164(affiliate.whatsapp, DEFAULT_PHONE_COUNTRY);
  if (!isValidE164(cleanPhone)) {
    console.warn(`[order-whatsapp] Affiliate WhatsApp skipped for ${orderNumber}: ${affiliate.name || affiliate.email || affiliateId} has no usable WhatsApp number`);
    return { skipped: 'missing_affiliate_whatsapp' };
  }

  const templateName = process.env.AFFILIATE_SALE_WHATSAPP_TEMPLATE || 'alerta_venta_afiliado';
  const templateLanguage = process.env.AFFILIATE_SALE_WHATSAPP_TEMPLATE_LANGUAGE || 'es';
  const commission = formatAffiliateAlertCommission(order, affiliate);

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
          name: templateName,
          language: { code: templateLanguage },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: affiliate.name || 'Afiliado' },
              { type: 'text', text: orderNumber },
              { type: 'text', text: formatSalesAlertTotal(order) },
              { type: 'text', text: commission },
            ],
          }],
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[order-whatsapp] Affiliate WhatsApp alert failed:', result);
      return { skipped: 'meta_rejected', error: result?.error?.message || `Meta API returned ${response.status}` };
    }

    const messageId = result.messages?.[0]?.id;
    await logOrderAlert(supabase, {
      phone: cleanPhone,
      messageId,
      summary: `Affiliate sale alert ${orderNumber} - ${affiliate.name || affiliate.email || affiliateId} - ${formatSalesAlertTotal(order)} - commission ${commission}`,
      orderId,
      raw: result,
    });
    await markAffiliateOrderWhatsAppSent(supabase, orderId, messageId);

    console.log('[order-whatsapp] Affiliate WhatsApp alert sent:', {
      affiliate: affiliate.name || affiliate.email || affiliateId,
      phone: cleanPhone,
      messageId,
    });
    return { sent: true, phone: cleanPhone, messageId };
  } catch (err) {
    console.error('[order-whatsapp] Affiliate WhatsApp alert error:', err.message);
    return { skipped: 'send_failed', error: err.message };
  }
}
