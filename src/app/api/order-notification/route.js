import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const rawNotificationTo = process.env.ORDER_NOTIFICATION_TO || 'omerforce@gmail.com, info@peptidescostarica.net';
const NOTIFICATION_TO = rawNotificationTo.includes('surfyesi@hotmail.com')
  ? rawNotificationTo
  : `${rawNotificationTo}, surfyesi@hotmail.com`;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'info@peptidescostarica.net'}>`;

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

const paymentLabels = {
  en: {
    whatsapp: 'WhatsApp Manual Coordination',
    paypal: 'PayPal Secure Payment',
    sinpe: 'SINPE Móvil via Tilopay',
    tilopay: 'Credit / Debit Card via Tilopay',
    unknown: 'Standard Payment Method',
  },
  es: {
    whatsapp: 'Coordinación Manual por WhatsApp',
    paypal: 'Pago Seguro con PayPal',
    sinpe: 'SINPE Móvil vía Tilopay',
    tilopay: 'Tarjeta de Crédito / Débito vía Tilopay',
    unknown: 'Método de Pago Estándar',
  }
};

const buildItemsRows = (items = [], currency) => items.map((item) => {
  const price = Number(item.price || 0);
  const qty = Number(item.qty || 0);
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">
        <strong>${escapeHtml(item.product || 'Premium Peptide')}</strong>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:center;font-size:14px;color:#334155;">
        ${qty}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">
        ${formatMoney(price * qty, currency)}
      </td>
    </tr>
  `;
}).join('');

// Admin HTML Template Builder
const buildAdminHtml = (order, paymentLabel, totalPrimary, totalUsd, totalCrc) => `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;max-width:640px;margin:0 auto;padding:20px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
    <h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 16px;border-bottom:2px solid #e2e8f0;padding-bottom:12px;">🧪 New Order Received</h1>
    
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#475569;">Order Reference:</strong> <span style="font-family:monospace;font-size:15px;font-weight:bold;color:#059669;">${escapeHtml(order.orderNumber || 'N/A')}</span></p>
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#475569;">Payment Method:</strong> ${escapeHtml(paymentLabel)}</p>
      <p style="margin:0 0 8px;font-size:14px;"><strong style="color:#475569;">Order Status:</strong> <span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:bold;">${escapeHtml(order.status || 'Paid')}</span></p>
      <p style="margin:0;font-size:15px;"><strong style="color:#475569;">Total Amount:</strong> <span style="font-size:18px;font-weight:900;color:#0f172a;">${totalPrimary}</span> ${totalUsd && totalUsd !== totalPrimary ? ` / <span style="color:#64748b;">${totalUsd}</span>` : ''}${totalCrc && totalCrc !== totalPrimary ? ` / <span style="color:#64748b;">${totalCrc}</span>` : ''}</p>
    </div>

    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Customer Profile</h2>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <p style="margin:0 0 6px;font-size:14px;"><strong>Name:</strong> ${escapeHtml(order.customerName)}</p>
      ${order.customerIdNumber ? `
        <p style="margin:0 0 6px;font-size:14px;"><strong>ID:</strong> ${escapeHtml(order.customerIdNumber)} (${escapeHtml(
          order.customerIdType === '1' ? 'National ID' :
          order.customerIdType === '6' ? 'DIMEX' :
          order.customerIdType === '5' ? 'Passport' :
          order.customerIdType === '2' ? 'Corporate ID' :
          order.customerIdType || 'N/A'
        )})</p>
      ` : ''}
      <p style="margin:0 0 6px;font-size:14px;"><strong>WhatsApp:</strong> <a href="https://wa.me/${(order.customerPhone || '').replace(/[^0-9]/g, '')}" style="color:#059669;text-decoration:none;font-weight:bold;">${escapeHtml(order.customerPhone || 'N/A')}</a></p>
      <p style="margin:0;font-size:14px;"><strong>Email:</strong> ${escapeHtml(order.customerEmail || 'N/A')}</p>
    </div>

    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Shipping Coordinates</h2>
    <pre style="white-space:pre-wrap;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13.5px;color:#334155;margin:0 0 20px;line-height:1.6;box-shadow:0 1px 3px rgba(0,0,0,0.05);">${escapeHtml(order.shippingAddress || 'N/A')}</pre>

    <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Purchased Items</h2>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <thead>
        <tr style="background-color:#f1f5f9;">
          <th style="text-align:left;padding:10px 14px;border-bottom:2px solid #cbd5e1;font-size:12.5px;text-transform:uppercase;color:#475569;">Product</th>
          <th style="text-align:center;padding:10px 14px;border-bottom:2px solid #cbd5e1;font-size:12.5px;text-transform:uppercase;color:#475569;width:60px;">Qty</th>
          <th style="text-align:right;padding:10px 14px;border-bottom:2px solid #cbd5e1;font-size:12.5px;text-transform:uppercase;color:#475569;width:100px;">Total</th>
        </tr>
      </thead>
      <tbody style="padding:0 14px;">
        ${buildItemsRows(order.items, order.currency)}
      </tbody>
    </table>
  </div>
`;

// Customer HTML Receipt Builder
const buildCustomerHtml = (order, paymentLabel, totalPrimary, totalUsd, totalCrc, lang) => {
  const isEn = lang === 'en';
  
  const strings = {
    title: isEn ? 'Order Confirmed!' : '¡Pedido Confirmado!',
    subtitle: isEn ? "We've received your order and payment. Here are your transaction details." : 'Hemos recibido su pedido y su pago. A continuación encontrará los detalles de su transacción.',
    ref: isEn ? 'Order Reference' : 'Referencia del Pedido',
    method: isEn ? 'Payment Method' : 'Método de Pago',
    status: isEn ? 'Payment Status' : 'Estado del Pago',
    paidStatus: isEn ? 'Paid / Completed' : 'Pagado / Completado',
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
      <div style="background:linear-gradient(135deg, #0f172a, #022c22);padding:32px 24px;text-align:center;">
        <img src="https://catalog.peptidescostarica.net/logo.png" alt="Peptides Costa Rica" style="max-height:48px;border-radius:8px;margin-bottom:16px;background:rgba(255,255,255,0.08);padding:4px;">
        <h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0 0 8px;letter-spacing:-0.5px;">${strings.title}</h1>
        <p style="color:#a7f3d0;font-size:14px;margin:0;max-width:440px;margin:0 auto;line-height:1.4;">${strings.subtitle}</p>
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
              <td style="padding:6px 0;color:#64748b;font-weight:600;">${strings.method}</td>
              <td style="padding:6px 0;text-align:right;font-weight:bold;color:#0f172a;">${escapeHtml(paymentLabel)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;font-weight:600;">${strings.status}</td>
              <td style="padding:6px 0;text-align:right;">
                <span style="background-color:#dcfce7;color:#15803d;font-weight:800;font-size:11px;padding:2px 8px;border-radius:12px;text-transform:uppercase;">${strings.paidStatus}</span>
              </td>
            </tr>
            <tr style="border-top:1px solid #cbd5e1;">
              <td style="padding:12px 0 0;font-size:15px;font-weight:800;color:#0f172a;">${strings.totalPrice}</td>
              <td style="padding:12px 0 0;text-align:right;font-size:18px;font-weight:900;color:#059669;">
                ${totalPrimary}${totalUsd && totalUsd !== totalPrimary ? ` / ${totalUsd}` : ''}${totalCrc && totalCrc !== totalPrimary ? ` / ${totalCrc}` : ''}
              </td>
            </tr>
          </table>
        </div>

        <!-- Shipping Section -->
        <h3 style="font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">📦 ${strings.shippingTo}</h3>
        <pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13.5px;color:#475569;margin:0 0 24px;line-height:1.6;">${escapeHtml(order.shippingAddress || 'N/A')}</pre>

        <!-- Cart Table -->
        <h3 style="font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">📋 ${strings.orderSummary}</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
          <thead>
            <tr style="border-bottom:2px solid #cbd5e1;">
              <th style="text-align:left;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase;">${strings.product}</th>
              <th style="text-align:center;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase;width:50px;">${strings.qty}</th>
              <th style="text-align:right;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase;width:90px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${buildItemsRows(order.items, order.currency)}
          </tbody>
        </table>

        <!-- Science High Purity Support CTA Block -->
        <div style="background:linear-gradient(135deg, rgba(5,150,105,0.06), rgba(16,185,129,0.02));border:1px dashed rgba(5,150,105,0.25);border-radius:16px;padding:20px;text-align:center;">
          <h4 style="margin:0 0 6px;color:#047857;font-size:16px;font-weight:bold;">🔬 ${strings.supportTitle}</h4>
          <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.45;">${strings.supportText}</p>
          <a href="https://api.whatsapp.com/send?phone=50684046973" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;font-size:14px;box-shadow:0 2px 4px rgba(37,211,102,0.2);">
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
  try {
    const order = await request.json();

    if (!order?.customerName || !Array.isArray(order?.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'Invalid order notification payload' }, { status: 400 });
    }

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.warn('[Order notification] SMTP settings are not configured; email skipped.');
      return NextResponse.json({ sent: false, skipped: true });
    }

    // Determine customer language
    // Use order.lang if provided, otherwise check currency (CRC -> Spanish, USD -> English)
    const orderLang = order.lang || (order.currency === 'CRC' ? 'es' : 'en');
    
    // Format payment descriptions
    const paymentLabel = (paymentLabels[orderLang] || paymentLabels.en)[order.paymentMethod] || 
                         order.paymentMethod || 
                         (paymentLabels[orderLang] || paymentLabels.en).unknown;

    // Monetary conversions
    const totalPrimary = formatMoney(order.total, order.currency);
    const totalUsd = order.totalUsd ? formatMoney(order.totalUsd, 'USD') : null;
    const totalCrc = order.totalCrc ? formatMoney(order.totalCrc, 'CRC') : null;

    // Nodemailer transporter creation
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const results = {
      adminNotification: { sent: false },
      customerReceipt: { sent: false, skipped: true }
    };

    // ── 1. SEND ADMIN NOTIFICATION ──────────────────────────────────────────
    try {
      const adminSubject = `New Order ${order.orderNumber ? `#${order.orderNumber}` : ''} - ${order.customerName} [${order.paymentMethod?.toUpperCase()}]`;
      const adminHtml = buildAdminHtml(order, paymentLabel, totalPrimary, totalUsd, totalCrc);
      
      const adminText = [
        '🧪 Peptides Costa Rica - New Order Received',
        `Order Reference: ${order.orderNumber || 'N/A'}`,
        `Payment Method: ${paymentLabel}`,
        `Order Status: ${order.status || 'Paid'}`,
        `Total Amount: ${totalPrimary}${totalUsd && totalUsd !== totalPrimary ? ` / ${totalUsd}` : ''}${totalCrc && totalCrc !== totalPrimary ? ` / ${totalCrc}` : ''}`,
        '',
        `Customer Profile:`,
        `• Name: ${order.customerName}`,
        `• WhatsApp: ${order.customerPhone || 'N/A'}`,
        `• Email: ${order.customerEmail || 'N/A'}`,
        '',
        `Shipping Address:`,
        order.shippingAddress || 'N/A',
        '',
        `Items Summary:`,
        ...order.items.map(item => `• ${item.product} x${item.qty} (${formatMoney(Number(item.price || 0) * Number(item.qty || 0), order.currency)})`),
      ].join('\n');

      const adminInfo = await transporter.sendMail({
        from: `Peptides Costa Rica <info@peptidescostarica.net>`,
        to: NOTIFICATION_TO,
        subject: adminSubject,
        html: adminHtml,
        text: adminText,
        replyTo: order.customerEmail || undefined,
      });

      results.adminNotification = { sent: true, messageId: adminInfo.messageId };
      console.log(`[Order notification] Admin email dispatched: ${adminInfo.messageId}`);
    } catch (adminErr) {
      console.error('[Order notification] Admin notification failed to send:', adminErr);
      results.adminNotification = { sent: false, error: adminErr.message };
    }

    // ── 2. SEND CUSTOMER CONFIRMATION RECEIPT ───────────────────────────────
    if (order.customerEmail && order.customerEmail.trim() !== '') {
      try {
        const customerSubject = orderLang === 'en'
          ? `Order Confirmation #${order.orderNumber || ''} - Peptides Costa Rica`
          : `Confirmación de Pedido #${order.orderNumber || ''} - Péptidos Costa Rica`;
          
        const customerHtml = buildCustomerHtml(order, paymentLabel, totalPrimary, totalUsd, totalCrc, orderLang);
        
        const customerText = [
          orderLang === 'en' ? 'Thank you for your order!' : '¡Gracias por su compra!',
          '',
          `${orderLang === 'en' ? 'Order Summary' : 'Resumen de su Orden'}:`,
          `• ${orderLang === 'en' ? 'Reference' : 'Referencia'}: ${order.orderNumber || 'N/A'}`,
          `• ${orderLang === 'en' ? 'Payment Method' : 'Método de Pago'}: ${paymentLabel}`,
          `• ${orderLang === 'en' ? 'Total Paid' : 'Total Pagado'}: ${totalPrimary}${totalUsd && totalUsd !== totalPrimary ? ` / ${totalUsd}` : ''}${totalCrc && totalCrc !== totalPrimary ? ` / ${totalCrc}` : ''}`,
          '',
          `${orderLang === 'en' ? 'Delivery Details' : 'Detalles de Envío'}:`,
          order.shippingAddress || 'N/A',
          '',
          `${orderLang === 'en' ? 'Products' : 'Productos'}:`,
          ...order.items.map(item => `• ${item.product} x${item.qty} (${formatMoney(Number(item.price || 0) * Number(item.qty || 0), order.currency)})`),
          '',
          orderLang === 'en' 
            ? 'Need help? Contact our support desk at +506 8404-6973 or reply to this email.'
            : '¿Necesita ayuda? Contacte a soporte al +506 8404-6973 o responda a este correo.'
        ].join('\n');

        const customerInfo = await transporter.sendMail({
          from: `Peptides Costa Rica <info@peptidescostarica.net>`,
          replyTo: 'info@peptidescostarica.net',
          to: order.customerEmail.trim(),
          subject: customerSubject,
          html: customerHtml,
          text: customerText,
        });

        results.customerReceipt = { sent: true, messageId: customerInfo.messageId };
        console.log(`[Order notification] Customer receipt dispatched: ${customerInfo.messageId} to ${order.customerEmail}`);
      } catch (custErr) {
        console.error('[Order notification] Customer receipt failed to send:', custErr);
        results.customerReceipt = { sent: false, error: custErr.message };
      }
    }

    return NextResponse.json({
      success: results.adminNotification.sent || results.customerReceipt.sent,
      results
    });
  } catch (err) {
    console.error('[Order notification] Unexpected handler crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
