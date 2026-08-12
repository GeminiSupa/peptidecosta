import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getBusinessLinks } from '@/lib/settings';
import { withTaxRecordsCc } from '@/lib/taxRecordsEmail.mjs';
import { getOrderNotificationRecipients } from '@/lib/orderNotificationRecipients';
import { splitCartUnits } from '@/lib/bacWater.mjs';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getTransactionalSmtpConfig, readEnv } from '@/lib/transactionalSmtp';

// Environment variables will be read inside the POST handler
// to ensure they are always fresh in serverless environments.

export const runtime = 'nodejs';
export const maxDuration = 60;

// Nodemailer's defaults (2 min to connect, 10 min socket) outlive any
// serverless invocation, so a stalled handshake reads as "no email was sent"
// with nothing in the logs. Fail fast and loudly instead.
const SMTP_TIMEOUTS = {
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
};

function getOrderSmtpConfig() {
  const { host, port, secure, user, pass, configured } = getTransactionalSmtpConfig();
  const fromEmail = readEnv('ORDER_NOTIFICATION_FROM_EMAIL') || readEnv('SMTP_FROM') || user || 'info@peptidescostarica.net';
  const from = readEnv('ORDER_NOTIFICATION_FROM') || `Peptides Costa Rica <${fromEmail}>`;
  const replyTo = readEnv('ORDER_NOTIFICATION_REPLY_TO') || readEnv('SMTP_REPLY_TO') || fromEmail;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    replyTo,
    configured,
  };
}

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
    sinpe: 'SINPE Móvil',
    card: 'Credit / Debit Card via Shield Hub Pay',
    unknown: 'Standard Payment Method',
  },
  es: {
    whatsapp: 'Coordinación Manual por WhatsApp',
    sinpe: 'SINPE Móvil',
    card: 'Tarjeta de Crédito / Débito vía Shield Hub Pay',
    unknown: 'Método de Pago Estándar',
  }
};

const normalizePaymentMethod = (method = '') => String(method || '').toLowerCase();

const isPaidStatus = (status = '') => {
  const normalized = String(status || '').toLowerCase();
  return normalized.includes('paid') || normalized.includes('complet');
};

const isElectronicGatewayPayment = (method = '') => {
  const normalized = normalizePaymentMethod(method);
  return normalized === 'card';
};

const buildItemsRows = (items = [], currency) => items.map((item) => {
  const price = Number(item.price || 0);
  const qty = Number(item.qty || 0);
  const total = price * qty;
  const isFree = price === 0;
  const freeLabel = currency === 'CRC' ? 'GRATIS' : 'FREE';

  return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:left;">
        <strong>${escapeHtml(item.product || 'Premium Peptide')}</strong>
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:14px;color:#334155;width:60px;">
        ${qty}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;font-weight:600;color:${isFree ? '#15803d' : '#0f172a'};width:100px;">
        ${isFree ? freeLabel : formatMoney(total, currency)}
      </td>
    </tr>
  `;
}).join('');

// Admin HTML Template Builder
const buildAdminHtml = (order, paymentLabel, totalPrimary, totalUsd, totalCrc) => {

  const shippingAmount = order.shipping !== undefined ? Number(order.shipping || 0) : undefined;
  const itemsAfterDiscounts = shippingAmount !== undefined
    ? Number(order.total || 0) - shippingAmount
    : Number(order.total || 0);
  const shippingLabel = shippingAmount === undefined
    ? 'N/A'
    : shippingAmount === 0
      ? 'FREE'
      : formatMoney(shippingAmount, order.currency);
      
  const isPaid = isPaidStatus(order.status);
  const customerPhoneDigits = (order.customerPhone || '').replace(/[^0-9]/g, '');

  return `
    <!--[if mso]>
    <table width="700" align="center" cellpadding="0" cellspacing="0" border="0" style="width:700px; margin:0 auto;"><tr><td align="center">
    <![endif]-->
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;width:100%;max-width:700px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);box-sizing:border-box;">
      
      <!-- Premium Admin Header Banner -->
      <div style="background-color:#0f172a;padding:40px 32px;text-align:center;">
        <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 16px auto;border-radius:12px;">
        <h1 style="color:#ffffff !important;font-size:28px;font-weight:800;margin:0 0 10px;letter-spacing:-0.5px;">New Order Received!</h1>
        <p style="color:#e0e7ff !important;font-size:15px;margin:0;max-width:500px;margin:0 auto;line-height:1.5;">A new order has been placed on the Peptides Costa Rica catalog.</p>
      </div>

      <div style="padding:32px;background-color:#f8fafc;">
        
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 24px;margin-bottom:24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);text-align:center;">
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Reference</div>
            <div style="font-family:monospace;font-weight:bold;color:#4338ca;font-size:20px;margin-top:4px;">${escapeHtml(order.orderNumber || 'N/A')}</div>
          </div>
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Payment Method</div>
            <div style="font-weight:bold;color:#0f172a;font-size:18px;margin-top:4px;">${escapeHtml(paymentLabel)}</div>
          </div>
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Order Status</div>
            <div>
              <span style="background-color:${isPaid ? '#dcfce7' : '#fef08a'};color:${isPaid ? '#15803d' : '#854d0e'};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;border:1px solid ${isPaid ? '#bbf7d0' : '#fde047'};">${escapeHtml(order.status || 'Pending')}</span>
            </div>
          </div>
          
          <div style="border-top:2px solid #e2e8f0;margin:24px auto 0;padding-top:24px;max-width:350px;">
            <div style="display:table;width:100%;margin-bottom:8px;font-size:14.5px;">
              <div style="display:table-cell;text-align:left;color:#64748b;font-weight:600;">Items Amount</div>
              <div style="display:table-cell;text-align:right;font-weight:700;color:#0f172a;">${formatMoney(itemsAfterDiscounts, order.currency)}</div>
            </div>
            <div style="display:table;width:100%;margin-bottom:8px;font-size:14.5px;">
              <div style="display:table-cell;text-align:left;color:#64748b;font-weight:600;">Shipping Fee</div>
              <div style="display:table-cell;text-align:right;font-weight:700;color:${shippingAmount === 0 ? '#15803d' : '#0f172a'};">${shippingLabel}</div>
            </div>
            
            <div style="margin-top:16px;padding-top:16px;border-top:1px dashed #cbd5e1;text-align:center;">
              <div style="font-size:14px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Grand Total</div>
              <div style="font-size:26px;font-weight:900;color:#0f172a;">${totalPrimary}</div>
              ${totalUsd && totalUsd !== totalPrimary ? `<div style="font-size:14px;color:#64748b;font-weight:700;margin-top:4px;">${totalUsd}</div>` : ''}
              ${totalCrc && totalCrc !== totalPrimary ? `<div style="font-size:14px;color:#64748b;font-weight:700;margin-top:4px;">${totalCrc}</div>` : ''}
            </div>
          </div>
        </div>

        <h2 style="font-size:14px;font-weight:800;color:#0f172a;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;text-align:center;">Customer Profile</h2>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:0 auto 24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);max-width:500px;text-align:center;">
          <div style="margin-bottom:12px;"><span style="color:#64748b;font-size:13px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;">Name</span> <span style="font-weight:600;font-size:16px;color:#0f172a;">${escapeHtml(order.customerName)}</span></div>
          ${order.customerIdNumber ? `
            <div style="margin-bottom:12px;"><span style="color:#64748b;font-size:13px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;">ID Number</span> <span style="font-weight:600;font-size:15px;color:#0f172a;">${escapeHtml(order.customerIdNumber)} (${escapeHtml(
              order.customerIdType === '1' ? 'National ID' :
              order.customerIdType === '6' ? 'DIMEX' :
              order.customerIdType === '5' ? 'Passport' :
              order.customerIdType === '2' ? 'Corporate ID' :
              order.customerIdType || 'N/A'
            )})</span></div>
          ` : ''}
          <div style="margin-bottom:12px;"><span style="color:#64748b;font-size:13px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;">Telephone</span> <a href="tel:${customerPhoneDigits}" style="color:#0f172a;text-decoration:none;font-weight:800;font-size:16px;">${escapeHtml(order.customerPhone || 'N/A')}</a></div>
          <div><span style="color:#64748b;font-size:13px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;">Email</span> <span style="font-weight:600;font-size:15px;color:#0f172a;">${escapeHtml(order.customerEmail || 'N/A')}</span></div>
        </div>

        <h2 style="font-size:14px;font-weight:800;color:#0f172a;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;text-align:center;">Shipping Coordinates</h2>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14.5px;color:#334155;margin:0 auto 24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);max-width:500px;text-align:center;">
          ${escapeHtml(order.shippingAddress || 'N/A').replace(/\n/g, '<br/>')}
        </div>

        <h2 style="font-size:14px;font-weight:800;color:#0f172a;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;text-align:center;">Purchased Items</h2>
        <div style="max-width:500px;margin:0 auto 20px;">
          <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
            <thead>
              <tr style="background-color:#f8fafc;">
                <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #e2e8f0;font-size:12px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;">Product</th>
                <th style="text-align:center;padding:12px 16px;border-bottom:2px solid #e2e8f0;font-size:12px;text-transform:uppercase;color:#64748b;font-weight:700;width:70px;letter-spacing:0.5px;">Qty</th>
                <th style="text-align:right;padding:12px 16px;border-bottom:2px solid #e2e8f0;font-size:12px;text-transform:uppercase;color:#64748b;font-weight:700;width:100px;letter-spacing:0.5px;">Total</th>
              </tr>
            </thead>
            <tbody style="padding:0 16px;">
              ${buildItemsRows(order.items, order.currency)}
              ${order.subtotal ? `
              <tr style="border-top:2px solid #e2e8f0;">
                <td colspan="2" style="text-align:right;padding:12px 16px;font-size:14px;color:#475569;font-weight:600;">Subtotal</td>
                <td style="text-align:right;padding:12px 16px;font-size:14px;color:#0f172a;font-weight:700;">${formatMoney(order.subtotal, order.currency)}</td>
              </tr>` : ''}
              ${order.volumeDiscount ? `
              <tr>
                <td colspan="2" style="text-align:right;padding:8px 16px;font-size:14px;color:#15803d;font-weight:600;">Volume Discount</td>
                <td style="text-align:right;padding:8px 16px;font-size:14px;color:#15803d;font-weight:700;">-${formatMoney(order.volumeDiscount, order.currency)}</td>
              </tr>` : ''}
              ${order.promoDiscount ? `
              <tr>
                <td colspan="2" style="text-align:right;padding:8px 16px;font-size:14px;color:#0284c7;font-weight:600;">Promo Discount</td>
                <td style="text-align:right;padding:8px 16px;font-size:14px;color:#0284c7;font-weight:700;">-${formatMoney(order.promoDiscount, order.currency)}</td>
              </tr>` : ''}
              ${order.manualDiscount ? `
              <tr>
                <td colspan="2" style="text-align:right;padding:8px 16px;font-size:14px;color:#7e22ce;font-weight:600;">Order Discount${order.manualDiscountReason ? ` (${escapeHtml(order.manualDiscountReason)})` : ''}</td>
                <td style="text-align:right;padding:8px 16px;font-size:14px;color:#7e22ce;font-weight:700;">-${formatMoney(order.manualDiscount, order.currency)}</td>
              </tr>` : ''}
              ${order.shipping !== undefined ? `
              <tr>
                <td colspan="2" style="text-align:right;padding:8px 16px;font-size:14px;color:#475569;font-weight:600;">Shipping</td>
                <td style="text-align:right;padding:8px 16px;font-size:14px;color:#0f172a;font-weight:700;">${order.shipping === 0 ? 'FREE' : formatMoney(order.shipping, order.currency)}</td>
              </tr>` : ''}
            </tbody>
          </table>
        </div>

        <div style="text-align:center;padding-top:20px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
          Peptides Costa Rica Admin Notification System
        </div>
      </div>
    </div>
    <!--[if mso]>
    </td></tr></table>
    <![endif]-->
  `;
};

// Customer HTML Receipt Builder
const buildCustomerHtml = (order, paymentLabel, totalPrimary, totalUsd, totalCrc, lang, links, salesTextEn, salesTextEs, promoCodesList) => {

  const isEn = lang === 'en';
  const isPaid = isPaidStatus(order.status);
  const isDeclined = order.status === 'Declined';
  const paymentMethod = normalizePaymentMethod(order.paymentMethod);
  const isGatewayPayment = isElectronicGatewayPayment(paymentMethod);
  const showManualPaymentAction = !isPaid && !isGatewayPayment && !isDeclined;
  const strings = {
    title: isPaid
      ? (isEn ? 'Order Confirmed!' : '¡Pedido Confirmado!')
      : isDeclined
        ? (isEn ? 'Payment Declined' : 'Pago Rechazado')
        : isGatewayPayment
          ? (isEn ? 'Order Received - Payment Processing' : 'Pedido Recibido - Pago en Proceso')
          : (isEn ? 'Action Required: Complete Payment' : 'Acción Requerida: Completar Pago'),
    subtitle: isPaid 
      ? (isEn ? "We've received your order and payment. Here are your transaction details." : 'Hemos recibido su pedido y su pago. A continuación encontrará los detalles.') 
      : isDeclined
        ? (isEn ? "Your card payment was declined. Please try again or choose a different payment method." : 'Su pago con tarjeta fue rechazado. Por favor intente nuevamente o elija un método de pago distinto.')
        : isGatewayPayment
          ? (isEn ? "We've received your order and are waiting for the payment processor's final confirmation." : 'Hemos recibido su pedido y estamos esperando la confirmación final del procesador de pago.')
          : (isEn ? "We've received your order! Please submit your payment to complete processing." : '¡Hemos recibido su pedido! Por favor envíe su pago para procesarlo.'),
    ref: isEn ? 'Order Reference' : 'Referencia del Pedido',
    method: isEn ? 'Payment Method' : 'Método de Pago',
    status: isEn ? 'Payment Status' : 'Estado del Pago',
    paidStatus: isEn ? 'Paid / Completed' : 'Pagado / Completado',
    pendingStatus: isDeclined
      ? (isEn ? 'Declined' : 'Rechazado')
      : isGatewayPayment
        ? (isEn ? 'Awaiting Processor Confirmation' : 'Esperando Confirmación del Procesador')
        : (isEn ? 'Pending Payment' : 'Pago Pendiente'),
    shippingTo: isEn ? 'Shipping Destination' : 'Destinatario de Envío',
    orderSummary: isEn ? 'Order Summary' : 'Resumen de su Orden',
    product: isEn ? 'Product' : 'Producto',
    qty: isEn ? 'Qty' : 'Cant',
    totalPrice: isEn ? 'Total Price' : 'Precio Total',
    supportTitle: isEn ? 'Need Assistance?' : '¿Necesita Ayuda?',
    supportText: isEn ? 'Our scientific support desk is ready to answer any questions about reconstitution, supplies, or shipping details.' : 'Nuestra mesa de soporte científico está lista para responder cualquier consulta sobre reconstitución, suministros o logística de envío.',
    whatsappBtn: isEn ? 'Chat with Support on WhatsApp' : 'Chatear con Soporte por WhatsApp',
    payNowBtn: isEn ? 'Complete Payment on WhatsApp' : 'Completar Pago por WhatsApp',
    footer: isEn ? 'High-Purity Research Peptides · Base in Costa Rica' : 'Péptidos de Alta Pureza para Investigación · Con base en Costa Rica',
  };

  const whatsappPayLink = `https://api.whatsapp.com/send?phone=${links.whatsappNumber}&text=${encodeURIComponent(
    isEn 
      ? `Hi, I need to complete payment for Order ${order.orderNumber}. My selected method was ${paymentLabel}.`
      : `Hola, necesito completar el pago de mi Pedido ${order.orderNumber}. Mi método seleccionado fue ${paymentLabel}.`
  )}`;

  return `
    <!--[if mso]>
    <table width="700" align="center" cellpadding="0" cellspacing="0" border="0" style="width:700px; margin:0 auto;"><tr><td align="center">
    <![endif]-->
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;width:100%;max-width:700px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);box-sizing:border-box;">
      
      <!-- Premium Science Theme Header Banner -->
      <div style="background-color:#0f172a;padding:40px 32px;text-align:center;">
        <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 16px auto;border-radius:12px;">
        <h1 style="color:#ffffff !important;font-size:28px;font-weight:800;margin:0 0 10px;letter-spacing:-0.5px;">${strings.title}</h1>
        <p style="color:#e2e8f0 !important;font-size:15px;margin:0;max-width:500px;margin:0 auto;line-height:1.5;">${strings.subtitle}</p>
      </div>

      <div style="padding:32px;">
        
        ${!isPaid ? `
        <div style="background-color:${isDeclined ? '#fef2f2' : '#f0fdf4'}; border:1px solid ${isDeclined ? '#fecaca' : '#bbf7d0'}; border-radius:16px; padding:24px; text-align:center; margin-bottom:32px;">
          <h2 style="color:${isDeclined ? '#991b1b' : '#166534'}; font-size:18px; font-weight:800; margin:0 0 8px; line-height:1.3;">
            ${isDeclined
              ? (isEn ? 'Card Declined' : 'Tarjeta Rechazada')
              : isGatewayPayment
                ? (isEn ? 'Payment Processing' : 'Pago en Proceso')
                : (isEn ? 'Action Required: Complete Your Payment' : 'Acción Requerida: Complete su Pago')}
          </h2>
          <p style="color:${isDeclined ? '#991b1b' : '#166534'}; font-size:14px; margin:0 0 18px; font-weight:500; line-height:1.5;">
            ${isDeclined
              ? (isEn
                ? 'Your transaction could not be completed. Please return to the site to try again, or contact your bank.'
                : 'No se pudo completar su transacción. Por favor regrese al sitio para intentar nuevamente, o contacte a su banco.')
              : isGatewayPayment
                ? (isEn
                  ? 'No WhatsApp payment action is needed for this order. We will update your order once the payment processor confirms the transaction.'
                  : 'No necesita completar el pago por WhatsApp para este pedido. Actualizaremos su orden cuando el procesador confirme la transacción.')
                : (isEn
                  ? 'To secure your order and schedule dispatch, please send your payment confirmation screenshot to our agent on WhatsApp.'
                  : 'Para asegurar su pedido y programar el envío, por favor envíe el comprobante de su pago a nuestro asesor por WhatsApp.')}
          </p>
          ${showManualPaymentAction ? `
          <a href="${whatsappPayLink}" style="display:inline-block;background-color:#22c55e;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:800;font-size:18px;text-transform:uppercase;letter-spacing:0.5px;">
             💬 ${strings.payNowBtn}
          </a>
          ` : ''}
        </div>
        ` : ''}

        <!-- Summary Dashboard Grid -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px 24px;margin-bottom:32px;text-align:center;">
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;">${strings.ref}</div>
            <div style="font-family:monospace;font-weight:bold;color:#059669;font-size:20px;margin-top:4px;">${escapeHtml(order.orderNumber || 'N/A')}</div>
          </div>
          
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;">${strings.method}</div>
            <div style="font-weight:bold;color:#0f172a;font-size:18px;margin-top:4px;">${escapeHtml(paymentLabel)}</div>
          </div>
          
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">${strings.status}</div>
            <div>
              <span style="background-color:${isPaid ? '#dcfce7' : isDeclined ? '#fee2e2' : '#fef08a'};color:${isPaid ? '#15803d' : isDeclined ? '#991b1b' : '#854d0e'};font-weight:800;font-size:13px;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;border:1px solid ${isPaid ? '#bbf7d0' : isDeclined ? '#fecaca' : '#fde047'};">
                ${isPaid ? strings.paidStatus : strings.pendingStatus}
              </span>
            </div>
          </div>

          <div style="border-top:2px solid #e2e8f0;margin:24px auto 0;padding-top:24px;max-width:350px;">
            ${order.subtotal ? `
            <div style="display:table;width:100%;margin-bottom:8px;font-size:14.5px;">
              <div style="display:table-cell;text-align:left;color:#64748b;font-weight:600;">Subtotal</div>
              <div style="display:table-cell;text-align:right;font-weight:700;color:#0f172a;">${formatMoney(order.subtotal, order.currency)}</div>
            </div>
            ` : ''}
            ${order.volumeDiscount ? `
            <div style="display:table;width:100%;margin-bottom:8px;font-size:14.5px;">
              <div style="display:table-cell;text-align:left;color:#15803d;font-weight:600;">${isEn ? 'Volume Discount' : 'Descuento por Volumen'}</div>
              <div style="display:table-cell;text-align:right;font-weight:700;color:#15803d;">-${formatMoney(order.volumeDiscount, order.currency)}</div>
            </div>
            ` : ''}
            ${order.promoDiscount ? `
            <div style="display:table;width:100%;margin-bottom:8px;font-size:14.5px;">
              <div style="display:table-cell;text-align:left;color:#0284c7;font-weight:600;">${isEn ? 'Promo Discount' : 'Descuento Promocional'}</div>
              <div style="display:table-cell;text-align:right;font-weight:700;color:#0284c7;">-${formatMoney(order.promoDiscount, order.currency)}</div>
            </div>
            ` : ''}
            ${order.manualDiscount ? `
            <div style="display:table;width:100%;margin-bottom:8px;font-size:14.5px;">
              <div style="display:table-cell;text-align:left;color:#7e22ce;font-weight:600;">${isEn ? 'Order Discount' : 'Descuento del Pedido'}${order.manualDiscountReason ? ` (${escapeHtml(order.manualDiscountReason)})` : ''}</div>
              <div style="display:table-cell;text-align:right;font-weight:700;color:#7e22ce;">-${formatMoney(order.manualDiscount, order.currency)}</div>
            </div>
            ` : ''}
            ${order.shipping !== undefined ? `
            <div style="display:table;width:100%;margin-bottom:8px;font-size:14.5px;">
              <div style="display:table-cell;text-align:left;color:#64748b;font-weight:600;">${isEn ? 'Shipping' : 'Envío'}</div>
              <div style="display:table-cell;text-align:right;font-weight:700;color:#0f172a;">${order.shipping === 0 ? (isEn ? 'FREE' : 'GRATIS') : formatMoney(order.shipping, order.currency)}</div>
            </div>
            ` : ''}
            
            <div style="margin-top:16px;padding-top:16px;border-top:1px dashed #cbd5e1;text-align:center;">
              <div style="font-size:14px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${strings.totalPrice}</div>
              <div style="font-size:26px;font-weight:900;color:#059669;">${totalPrimary}</div>
              ${totalUsd && totalUsd !== totalPrimary ? `<div style="font-size:14px;color:#64748b;font-weight:700;margin-top:4px;">${totalUsd}</div>` : ''}
              ${totalCrc && totalCrc !== totalPrimary ? `<div style="font-size:14px;color:#64748b;font-weight:700;margin-top:4px;">${totalCrc}</div>` : ''}
            </div>
          </div>
        </div>

        <h3 style="font-size:15px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;text-align:center;">📦 ${strings.shippingTo}</h3>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14.5px;color:#475569;margin:0 auto 32px;line-height:1.6;text-align:center;max-width:500px;">
          ${escapeHtml(order.shippingAddress || 'N/A').replace(/\n/g, '<br/>')}
        </div>

        <h3 style="font-size:15px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;text-align:center;">📋 ${strings.orderSummary}</h3>
        <div style="max-width:500px;margin:0 auto 32px;">
          <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <thead style="background:#f8fafc;">
              <tr>
                <th style="text-align:left;padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;border-bottom:2px solid #e2e8f0;letter-spacing:0.5px;">${strings.product}</th>
                <th style="text-align:center;padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;border-bottom:2px solid #e2e8f0;width:60px;letter-spacing:0.5px;">${strings.qty}</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;border-bottom:2px solid #e2e8f0;width:90px;letter-spacing:0.5px;">Total</th>
              </tr>
            </thead>
            <tbody style="padding:0 16px;">
              ${buildItemsRows(order.items, order.currency)}
            </tbody>
          </table>
        </div>

        ${showManualPaymentAction ? `
        <div style="text-align:center;margin-bottom:32px;border-top:1px solid #e2e8f0;padding-top:32px;">
          <h4 style="margin:0 0 8px;color:#0f172a;font-size:17px;font-weight:800;">
            ${isEn ? 'Ready to complete your order?' : '¿Listo para completar su pedido?'}
          </h4>
          <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.4;">
            ${isEn ? 'Tap the button below to connect with us on WhatsApp instantly.' : 'Toque el botón a continuación para comunicarse por WhatsApp al instante.'}
          </p>
          <a href="${whatsappPayLink}" style="display:inline-block;background-color:#22c55e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:800;font-size:16px;">
             💬 ${strings.payNowBtn}
          </a>
        </div>
        ` : ''}

        ${(promoCodesList && promoCodesList.length > 0) || (isEn ? salesTextEn : salesTextEs) ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:20px;margin:0 auto 32px;max-width:500px;text-align:center;">
          <h4 style="margin:0 0 10px;color:#b45309;font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">🎁 ${isEn ? 'Current Sales & Promo Codes' : 'Ventas Actuales y Códigos Promocionales'}</h4>
          ${(isEn ? salesTextEn : salesTextEs) ? `<p style="margin:0 0 10px;color:#92400e;font-size:14px;line-height:1.5;font-weight:500;">${escapeHtml(isEn ? salesTextEn : salesTextEs)}</p>` : ''}
          ${promoCodesList && promoCodesList.length > 0 ? `<p style="margin:0;color:#92400e;font-size:14px;line-height:1.5;"><strong>${isEn ? 'Active Codes:' : 'Códigos Activos:'}</strong> <br/> ${promoCodesList.map(p => `<span style="background:#fef3c7;padding:2px 6px;border-radius:4px;border:1px solid #fde68a;"><strong>${p.code}</strong> (${p.discount_pct * 100}% off)</span>`).join(' ')}</p>` : ''}
        </div>
        ` : ''}

        <!-- Support CTA Block -->
        <div style="background:#f0fdf4;border:1px dashed #059669;border-radius:16px;padding:24px;text-align:center;max-width:500px;margin:0 auto;">
          <h4 style="margin:0 0 8px;color:#047857;font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">🔬 ${strings.supportTitle}</h4>
          <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5;font-weight:500;">${strings.supportText}</p>
          <p style="margin:0 0 20px;color:#0f172a;font-size:14.5px;line-height:1.6;font-weight:600;">
            <strong>Costa Rica:</strong> +506 8404-6973<br/>
            
          </p>
          <a href="https://api.whatsapp.com/send?phone=${links.whatsappNumber}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;">
             💬 ${strings.whatsappBtn}
          </a>
        </div>

      </div>

      <div style="background:#f1f5f9;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
        ${strings.footer}
      </div>

    </div>
    <!--[if mso]>
    </td></tr></table>
    <![endif]-->
  `;
};

export async function POST(request) {
  // Read env vars inside the handler to prevent Next.js caching issues
  const smtp = getOrderSmtpConfig();

  try {
    const order = await request.json();
    const links = await getBusinessLinks();

    if (!order?.customerName || !Array.isArray(order?.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'Invalid order notification payload' }, { status: 400 });
    }

    // Fetch sales and promos
    let salesTextEn = '';
    let salesTextEs = '';
    let promoCodesList = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: lpData } = await supabase.from('site_settings').select('value').eq('id', 'landing_page').single();
        if (lpData && lpData.value && lpData.value.bannerActive) {
          salesTextEn = lpData.value.bannerTextEn || '';
          salesTextEs = lpData.value.bannerTextEs || '';
        }

        const now = new Date().toISOString();
        const { data: promos } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('is_active', true)
          .or(`valid_until.is.null,valid_until.gt.${now}`)
          .or(`usage_limit.is.null,usage_limit.gt.usage_count`);
        
        if (promos && promos.length > 0) {
          // Never surface hidden codes (private mailer-only codes) in emails.
          promoCodesList = promos.filter((p) => !p.hidden);
        }
      } catch (err) {
        console.warn('Could not fetch sales/promos for email:', err.message);
      }
    }

    // Determine customer language
    // Use order.lang if provided, otherwise check currency (CRC -> Spanish, USD -> English)
    const orderLang = order.lang || (order.currency === 'CRC' ? 'es' : 'en');

    // Add the free Bac Water entitlement — one vial per peptide.
    //
    // The storefront already resolves this into explicit paid and gift lines
    // before it posts, so only orders that arrived without any BAC line at all
    // (agent-entered orders, older clients) need it filled in here. Injecting
    // unconditionally would bill the customer for vials and then gift them the
    // same count on top.
    const { peptideUnits, bacUnits } = splitCartUnits(order.items);

    if (peptideUnits > 0 && bacUnits === 0) {
      const productName = orderLang === 'en'
        ? 'Bacteriostatic Water 3ml (Free Gift)'
        : 'Agua Bacteriostática 3ml (Regalo)';

      order.items.push({
        product: productName,
        qty: peptideUnits,
        price: 0
      });
    }

    if (!smtp.configured) {
      console.warn('[Order notification] Transactional SMTP settings are not configured; email skipped.');
      return NextResponse.json({ sent: false, skipped: true, error: 'Transactional SMTP settings missing' }, { status: 500 });
    }

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
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
      ...SMTP_TIMEOUTS,
    });

    const results = {
      adminNotification: { sent: false },
      customerReceipt: { sent: false, skipped: true }
    };

    const isPaid = isPaidStatus(order.status);
    const skipAdmin = order.customerReceiptOnly === true;
    const skipCustomer = order.adminNotificationOnly === true && order.forceCustomerReceipt !== true;

    //  1. SEND ADMIN NOTIFICATION 
    if (!skipAdmin) {
      try {
        const adminSubject = `New Order ${order.orderNumber ? `#${order.orderNumber}` : ''} - ${order.customerName} [${order.paymentMethod?.toUpperCase()}]`;
      const adminHtml = buildAdminHtml(order, paymentLabel, totalPrimary, totalUsd, totalCrc);
      
      const adminText = [
        ' Peptides Costa Rica - New Order Received',
        `Order Reference: ${order.orderNumber || 'N/A'}`,
        `Payment Method: ${paymentLabel}`,
        `Order Status: ${order.status || 'Paid'}`,
        ...(order.shipping !== undefined ? [
          `Items Amount: ${formatMoney(Number(order.total || 0) - Number(order.shipping || 0), order.currency)}`,
          `Shipping Fee: ${order.shipping === 0 ? 'FREE' : formatMoney(order.shipping, order.currency)}`,
        ] : []),
        `Grand Total: ${totalPrimary}${totalUsd && totalUsd !== totalPrimary ? ` / ${totalUsd}` : ''}${totalCrc && totalCrc !== totalPrimary ? ` / ${totalCrc}` : ''}`,
        '',
        `Customer Profile:`,
        ` Name: ${order.customerName}`,
        ` Telephone: ${order.customerPhone || 'N/A'}`,
        ` Email: ${order.customerEmail || 'N/A'}`,
        '',
        `Shipping Address:`,
        order.shippingAddress || 'N/A',
        '',
        `Items Summary:`,
        ...order.items.map(item => {
          const total = Number(item.price || 0) * Number(item.qty || 0);
          const isFree = Number(item.price || 0) === 0;
          return ` ${item.product} x${item.qty} (${isFree ? 'FREE' : formatMoney(total, order.currency)})`;
        }),
        ...(order.subtotal ? [`Subtotal: ${formatMoney(order.subtotal, order.currency)}`] : []),
        ...(order.volumeDiscount ? [`Volume Discount: -${formatMoney(order.volumeDiscount, order.currency)}`] : []),
        ...(order.promoDiscount ? [`Promo Discount: -${formatMoney(order.promoDiscount, order.currency)}`] : []),
        ...(order.manualDiscount ? [`Order Discount${order.manualDiscountReason ? ` (${order.manualDiscountReason})` : ''}: -${formatMoney(order.manualDiscount, order.currency)}`] : []),
        ...(order.shipping !== undefined ? [`Shipping: ${order.shipping === 0 ? 'FREE' : formatMoney(order.shipping, order.currency)}`] : []),
        `Total: ${totalPrimary}`,
      ].join('\n');

      const recipients = await getOrderNotificationRecipients();

      const adminInfo = await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'omerforce@gmail.com',
        from: smtp.from,
        to: recipients.join(', '),
        subject: adminSubject,
        html: adminHtml,
        text: adminText,
        replyTo: order.customerEmail || undefined,
      });

      results.adminNotification = { sent: true, messageId: adminInfo.messageId, recipients: recipients.length };
      console.log(`[Order notification] Admin email dispatched to ${recipients.length} recipients: ${adminInfo.messageId}`);
    } catch (adminErr) {
      console.error('[Order notification] Admin notification failed to send:', adminErr);
      results.adminNotification = { sent: false, error: adminErr.message };
    }
    }

    //  2. SEND CUSTOMER CONFIRMATION RECEIPT 
    if (!skipCustomer && order.customerEmail && order.customerEmail.trim() !== '') {
      try {
        const customerSubject = orderLang === 'en'
          ? `Order Confirmation #${order.orderNumber || ''} - Peptides Costa Rica`
          : `Confirmación de Pedido #${order.orderNumber || ''} - Péptidos Costa Rica`;
          
        const customerHtml = buildCustomerHtml(order, paymentLabel, totalPrimary, totalUsd, totalCrc, orderLang, links, salesTextEn, salesTextEs, promoCodesList);
        
        const customerText = [
          isPaid
            ? (orderLang === 'en' ? 'Thank you for your order and payment!' : 'Gracias por su pedido y su pago!')
            : isElectronicGatewayPayment(order.paymentMethod)
              ? (orderLang === 'en' ? 'We received your order and are waiting for payment processor confirmation.' : 'Recibimos su pedido y estamos esperando la confirmación del procesador de pago.')
              : (orderLang === 'en' ? 'Thank you for your order!' : 'Gracias por su pedido!'),
          '',
          `${orderLang === 'en' ? 'Order Summary' : 'Resumen de su Orden'}:`,
          ` ${orderLang === 'en' ? 'Reference' : 'Referencia'}: ${order.orderNumber || 'N/A'}`,
          ` ${orderLang === 'en' ? 'Payment Method' : 'Método de Pago'}: ${paymentLabel}`,
          ` ${isPaid ? (orderLang === 'en' ? 'Total Paid' : 'Total Pagado') : (orderLang === 'en' ? 'Order Total' : 'Total del Pedido')}: ${totalPrimary}${totalUsd && totalUsd !== totalPrimary ? ` / ${totalUsd}` : ''}${totalCrc && totalCrc !== totalPrimary ? ` / ${totalCrc}` : ''}`,
          '',
          `${orderLang === 'en' ? 'Delivery Details' : 'Detalles de Envío'}:`,
          order.shippingAddress || 'N/A',
          '',
          `${orderLang === 'en' ? 'Products' : 'Productos'}:`,
          ...order.items.map(item => {
            const total = Number(item.price || 0) * Number(item.qty || 0);
            const isFree = Number(item.price || 0) === 0;
            const freeLabel = orderLang === 'en' ? 'FREE' : 'GRATIS';
            return ` ${item.product} x${item.qty} (${isFree ? freeLabel : formatMoney(total, order.currency)})`;
          }),
          ...(order.subtotal ? [`Subtotal: ${formatMoney(order.subtotal, order.currency)}`] : []),
          ...(order.volumeDiscount ? [`${orderLang === 'en' ? 'Volume Discount' : 'Descuento Volumen'}: -${formatMoney(order.volumeDiscount, order.currency)}`] : []),
          ...(order.promoDiscount ? [`${orderLang === 'en' ? 'Promo Discount' : 'Descuento Promocional'}: -${formatMoney(order.promoDiscount, order.currency)}`] : []),
          ...(order.manualDiscount ? [`${orderLang === 'en' ? 'Order Discount' : 'Descuento del Pedido'}${order.manualDiscountReason ? ` (${order.manualDiscountReason})` : ''}: -${formatMoney(order.manualDiscount, order.currency)}`] : []),
          ...(order.shipping !== undefined ? [`${orderLang === 'en' ? 'Shipping' : 'Envío'}: ${order.shipping === 0 ? 'FREE / GRATIS' : formatMoney(order.shipping, order.currency)}`] : []),
          '',
          orderLang === 'en' 
            ? `Need help? Contact our support desk at +506 8404-6973 or reply to this email.`
            : `Necesita ayuda? Contacte a soporte al +506 8404-6973 o responda a este correo.`
        ].join('\n');

        const customerInfo = await transporter.sendMail({
          from: smtp.from,
          replyTo: smtp.replyTo,
          to: order.customerEmail.trim(),
          cc: withTaxRecordsCc(),
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

    //  3. SEND CUSTOMER WHATSAPP NOTIFICATION (DISABLED)
    // Note: Meta WhatsApp Business API requires a pre-approved template for business-initiated 
    // messages (outside the 24h customer window). Sending a free-form 'text' message will be 
    // blocked by Meta with error 131047. The frontend catalog already opens a
    // WhatsApp window for the user to initiate the chat, which is the correct approach.

    return NextResponse.json({
      success: results.adminNotification.sent || results.customerReceipt.sent,
      results
    });
  } catch (err) {
    console.error('[Order notification] Unexpected handler crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
