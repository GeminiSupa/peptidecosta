import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getBusinessLinks } from '@/lib/settings';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'omerforce@gmail.com'}>`;

// Trustpilot Automatic Feedback Service (AFS): BCC this address on the
// order-complete email and Trustpilot sends the customer a verified review
// invitation (default 7-day delay, configured in the Trustpilot dashboard).
const TRUSTPILOT_AFS_BCC = process.env.TRUSTPILOT_AFS_BCC || 'peptidescostarica.net+7777886f21@invite.trustpilot.com';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
};

const buildItemsRows = (items = [], currency) => items.map((item) => {
  const price = Number(item.price || 0);
  const qty = Number(item.qty || 0);
  return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:left;">
        <strong>${escapeHtml(item.product || 'Premium Peptide')}</strong>
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:14px;color:#334155;width:60px;">
        ${qty}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;font-weight:600;color:#0f172a;width:100px;">
        ${formatMoney(price * qty, currency)}
      </td>
    </tr>
  `;
}).join('');

// Customer HTML Receipt Builder
const buildCustomerShippedHtml = (order, totalPrimary, totalUsd, totalCrc, lang, links) => {
  const isEn = lang === 'en';
  
  const strings = {
    title: isEn ? 'Your Order is on the Way!' : '¡Su pedido está en camino!',
    subtitle: isEn ? "Great news! Your order has been completed and shipped. Here are your tracking details." : '¡Buenas noticias! Su pedido ha sido completado y enviado. A continuación encontrará los detalles de seguimiento.',
    ref: isEn ? 'Order Reference' : 'Referencia del Pedido',
    status: isEn ? 'Order Status' : 'Estado del Pedido',
    shippedStatus: isEn ? 'Completed & Shipped' : 'Completado y Enviado',
    tracking: isEn ? 'Tracking Number' : 'Número de Rastreo',
    shippingTo: isEn ? 'Shipping Destination' : 'Destinatario de Envío',
    orderSummary: isEn ? 'Order Summary' : 'Resumen de su Orden',
    product: isEn ? 'Product' : 'Producto',
    qty: isEn ? 'Qty' : 'Cant',
    totalPrice: isEn ? 'Total Price' : 'Precio Total',
    supportTitle: isEn ? 'Need Assistance?' : '¿Necesita Ayuda?',
    supportText: isEn ? 'Our scientific support desk is ready to answer any questions about reconstitution, supplies, or shipping details.' : 'Nuestra mesa de soporte científico está lista para responder cualquier consulta sobre reconstitución, suministros o logística de envío.',
    whatsappBtn: isEn ? 'Chat with Support on WhatsApp' : 'Chatear con Soporte por WhatsApp',
    footer: isEn ? 'High-Purity Research Peptides · Base in Costa Rica' : 'Péptidos de Alta Pureza para Investigación · Con base en Costa Rica',
  };

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);">
      
      <!-- Premium Science Theme Header Banner -->
      <div style="background-color:#0f172a;background:linear-gradient(135deg, #0f172a, #022c22);padding:32px 24px;text-align:center;">
        <img src="https://catalog.peptidescostarica.net/logo.png" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 16px auto;border-radius:12px;">
        <h1 style="color:#ffffff !important;font-size:24px;font-weight:800;margin:0 0 8px;letter-spacing:-0.5px;">${strings.title}</h1>
        <p style="color:#a7f3d0 !important;font-size:14px;margin:0;max-width:440px;margin:0 auto;line-height:1.4;">${strings.subtitle}</p>
      </div>

      <div style="padding:24px;">
        
        <!-- Summary Dashboard Grid -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
            <tr>
              <td style="padding:6px 0;color:#64748b;font-weight:600;">${strings.ref}</td>
              <td style="padding:6px 0;text-align:right;font-family:monospace;font-weight:bold;color:#059669;font-size:14.5px;">${escapeHtml(order.orderNumber || 'N/A')}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;font-weight:600;">${strings.status}</td>
              <td style="padding:6px 0;text-align:right;">
                <span style="background-color:#dbeafe;color:#1e40af;font-weight:800;font-size:11px;padding:2px 8px;border-radius:12px;text-transform:uppercase;">${strings.shippedStatus}</span>
              </td>
            </tr>
            <tr style="border-top:1px solid #cbd5e1;">
              <td style="padding:12px 0 0;font-size:15px;font-weight:800;color:#0f172a;">${strings.tracking}</td>
              <td style="padding:12px 0 0;text-align:right;font-size:16px;font-weight:900;color:#3b82f6;">
                ${escapeHtml(order.tracking_number || 'N/A')}
              </td>
            </tr>
          </table>
        </div>

        <!-- Shipping Section -->
        <h3 style="font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">📦 ${strings.shippingTo}</h3>
        <pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13.5px;color:#475569;margin:0 0 24px;line-height:1.6;">${escapeHtml(order.shippingAddress || 'N/A')}</pre>

        <!-- Cart Table -->
        <h3 style="font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">📋 ${strings.orderSummary}</h3>
        <table style="width:100%;max-width:440px;margin:0 auto 28px;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid #cbd5e1;">
              <th style="text-align:left;padding:8px 16px;font-size:12px;color:#64748b;text-transform:uppercase;">${strings.product}</th>
              <th style="text-align:center;padding:8px 16px;font-size:12px;color:#64748b;text-transform:uppercase;width:60px;">${strings.qty}</th>
              <th style="text-align:right;padding:8px 16px;font-size:12px;color:#64748b;text-transform:uppercase;width:100px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${buildItemsRows(order.items, order.currency)}
            <tr style="border-top:1px solid #cbd5e1;">
              <td colspan="2" style="padding:12px 16px 0;font-size:14px;font-weight:800;color:#0f172a;text-align:right;">${strings.totalPrice}:</td>
              <td style="padding:12px 16px 0;text-align:right;font-size:15px;font-weight:900;color:#059669;">
                ${totalPrimary}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Science High Purity Support CTA Block -->
        <div style="background:linear-gradient(135deg, rgba(5,150,105,0.06), rgba(16,185,129,0.02));border:1px dashed rgba(5,150,105,0.25);border-radius:16px;padding:20px;text-align:center;">
          <h4 style="margin:0 0 6px;color:#047857;font-size:16px;font-weight:bold;">🔬 ${strings.supportTitle}</h4>
          <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.45;">${strings.supportText}</p>
          <a href="https://api.whatsapp.com/send?phone=${links.whatsappNumber}" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;font-size:14px;box-shadow:0 2px 4px rgba(37,211,102,0.2);">
            💬 ${strings.whatsappBtn}
          </a>
        </div>

      </div>

      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center;font-size:11px;color:#94a3b8;font-weight:500;">
        ${strings.footer}
      </div>

    </div>
  `;
};

export async function POST(request) {
  // Security: admin-only. This endpoint emails customers AND triggers a Trustpilot
  // review invitation (via BCC). Leaving it open would let anyone spam customers
  // and burn the monthly Trustpilot invitation quota on arbitrary addresses.
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const order = await request.json();
    const links = await getBusinessLinks();

    if (!order?.customer_name || !Array.isArray(order?.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'Invalid order notification payload' }, { status: 400 });
    }

    if (!order.customer_email || order.customer_email.trim() === '') {
      return NextResponse.json({ sent: false, skipped: true, reason: 'No customer email' });
    }

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.warn('[Order Shipped Notification] SMTP settings are not configured; email skipped.');
      return NextResponse.json({ sent: false, skipped: true });
    }

    const orderLang = order.lang || (order.currency === 'CRC' ? 'es' : 'en');
    const totalPrimary = formatMoney(order.total_crc || order.total_usd, order.currency);
    const totalUsd = order.total_usd ? formatMoney(order.total_usd, 'USD') : null;
    const totalCrc = order.total_crc ? formatMoney(order.total_crc, 'CRC') : null;

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      }
    });

    const customerSubject = orderLang === 'en'
      ? `Your Order ${order.order_number || ''} has Shipped! - Peptides Costa Rica`
      : `¡Su pedido ${order.order_number || ''} ha sido enviado! - Péptidos Costa Rica`;
      
    const normalizedOrder = {
      orderNumber: order.order_number || order.id?.substring(0,8),
      shippingAddress: order.shipping_address,
      items: order.items,
      currency: order.currency,
      tracking_number: order.tracking_number
    };

    const customerHtml = buildCustomerShippedHtml(normalizedOrder, totalPrimary, totalUsd, totalCrc, orderLang, links);

    // Only BCC Trustpilot the FIRST time an order is completed. Re-marking an
    // order (Completed -> Processing -> Completed, or resending the receipt)
    // must not burn another monthly invitation or spam the customer.
    let alreadyInvited = false;
    let supabase = null;
    try {
      supabase = getSupabaseAdmin();
      let query = supabase.from('orders').select('id, review_requested_at');
      query = order.id ? query.eq('id', order.id) : query.eq('order_number', order.order_number);
      const { data: existing } = await query.maybeSingle();
      alreadyInvited = Boolean(existing?.review_requested_at);
    } catch (err) {
      // If the lookup fails we fall back to sending the invitation (previous behavior).
      console.error('[Order Shipped Notification] review_requested_at lookup failed:', err.message);
    }

    // Trustpilot AFS structured data (read by Trustpilot from the BCC'd copy).
    // Not visible to the customer; gives Trustpilot the name, order ref, and language.
    const trustpilotSnippet = `
<script type="application/json+trustpilot">
{
  "recipientEmail": ${JSON.stringify(order.customer_email.trim())},
  "recipientName": ${JSON.stringify(order.customer_name || 'Cliente')},
  "referenceId": ${JSON.stringify(normalizedOrder.orderNumber || '')},
  "locale": ${JSON.stringify(orderLang === 'en' ? 'en-US' : 'es-ES')}
}
</script>`;
    const customerHtmlWithTrustpilot = alreadyInvited ? customerHtml : customerHtml + trustpilotSnippet;

    const customerText = [
      orderLang === 'en' ? 'Your order is on the way!' : '¡Su pedido está en camino!',
      '',
      `${orderLang === 'en' ? 'Tracking Number' : 'Número de Rastreo'}: ${order.tracking_number || 'N/A'}`,
      '',
      `${orderLang === 'en' ? 'Order Summary' : 'Resumen de su Orden'}:`,
      `• ${orderLang === 'en' ? 'Reference' : 'Referencia'}: ${normalizedOrder.orderNumber}`,
      `• ${orderLang === 'en' ? 'Total Paid' : 'Total Pagado'}: ${totalPrimary}`,
      '',
      `${orderLang === 'en' ? 'Delivery Details' : 'Detalles de Envío'}:`,
      normalizedOrder.shippingAddress || 'N/A',
      '',
      `${orderLang === 'en' ? 'Products' : 'Productos'}:`,
      ...order.items.map(item => `• ${item.product} x${item.qty} (${formatMoney(Number(item.price || 0) * Number(item.qty || 0), order.currency)})`),
      '',
      orderLang === 'en' 
        ? `Need help? Contact our support desk at ${links.whatsappDisplay} or reply to this email.`
        : `¿Necesita ayuda? Contacte a soporte al ${links.whatsappDisplay} o responda a este correo.`
    ].join('\n');

    const bccList = [
      process.env.BCC_EMAIL || 'omerforce@gmail.com',
      alreadyInvited ? null : TRUSTPILOT_AFS_BCC,
    ].filter(Boolean);

    const customerInfo = await transporter.sendMail({
      bcc: bccList,
      from: NOTIFICATION_FROM,
      to: order.customer_email.trim(),
      subject: customerSubject,
      html: customerHtmlWithTrustpilot,
      text: customerText,
    });

    console.log(`[Order Shipped Notification] Customer receipt dispatched: ${customerInfo.messageId} to ${order.customer_email}`);

    // Record that the Trustpilot invitation went out so later resends (and the
    // review-requests cron, which checks the same column) never duplicate it.
    if (!alreadyInvited && supabase) {
      try {
        let update = supabase.from('orders').update({ review_requested_at: new Date().toISOString() });
        update = order.id ? update.eq('id', order.id) : update.eq('order_number', order.order_number);
        await update;
      } catch (err) {
        console.error('[Order Shipped Notification] Failed to mark review_requested_at:', err.message);
      }
    }

    return NextResponse.json({
      success: true,
      messageId: customerInfo.messageId,
      trustpilotInvited: !alreadyInvited,
    });
  } catch (err) {
    console.error('[Order Shipped Notification] Unexpected handler crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
