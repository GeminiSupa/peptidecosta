/**
 * The two order emails, as pure functions of an order.
 *
 * They used to live inside /api/order-notification, next to the SMTP
 * connection — which meant the wording customers actually receive could not be
 * rendered, diffed or asserted on without sending real mail. That is how
 * "Payment Blocked" came to be described to buyers as a payment still in
 * progress, and stayed that way. Out here they take an order and return a
 * string, so a test can read exactly what a declined card is told.
 */

import { ORDER_EMAIL_LOGO_SRC } from './orderEmailBranding.mjs';
import { classifyPaymentOutcome } from './paymentOutcome.mjs';

export const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₡${Math.round(amount).toLocaleString('en-US')}`;
};

export const paymentLabels = {
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

export const normalizePaymentMethod = (method = '') => String(method || '').toLowerCase();

// Never test the status string here. "Payment Blocked" is a refusal that fails
// an === 'Declined' check and used to fall through to "awaiting confirmation",
// which is how a card the gateway had refused got described to the buyer as
// still processing. paymentOutcome.mjs owns that judgement for every message.
export const isPaidStatus = (status = '') => classifyPaymentOutcome(status) === 'paid';
export const isDeclinedStatus = (status = '') => classifyPaymentOutcome(status) === 'declined';

export const isElectronicGatewayPayment = (method = '') => {
  const normalized = normalizePaymentMethod(method);
  return normalized === 'card';
};

export const buildItemsRows = (items = [], currency) => items.map((item) => {
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
export const buildAdminHtml = (order, paymentLabel, totalPrimary, totalUsd, totalCrc) => {

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
  const isDeclined = isDeclinedStatus(order.status);
  // A card order's alert is raised before the charge is attempted, so
  // "New Order Received!" over a PENDING - CARD badge was the only thing the
  // team ever saw — on approved and refused orders alike. A payment-result
  // send says which one it turned out to be.
  const isResult = order.notificationKind === 'payment-result';
  // A card order's alert is held until the charge answers, so this one mail is
  // both "an order came in" and "here is how it ended" — which is why it still
  // carries the full order detail rather than reading as a status ping.
  const isFirstSight = isResult && order.firstTeamAlert === true;
  const outcomeLine = isPaid ? 'Payment Approved' : isDeclined ? 'Card Declined' : 'Payment Update';
  const headline = isResult
    ? (isFirstSight ? `New Order — ${outcomeLine}` : outcomeLine)
    : 'New Order Received!';
  const subhead = isResult
    ? (isPaid
      ? `${isFirstSight ? 'A new order has been placed and the card cleared. ' : 'The card cleared. '}This order is paid and ready to fulfil.`
      : isDeclined
        ? `${isFirstSight ? 'A new order has been placed, but the card did not go through' : 'The card did not go through'}${order.declineReason ? ` — ${escapeHtml(order.declineReason)}` : ''}. Nothing was charged and the order is unpaid.`
        : 'The payment status for this order changed.')
    : 'A new order has been placed on the Peptides Costa Rica catalog.';
  const customerPhoneDigits = String(order.customerPhone || '').replace(/[^0-9]/g, '');

  return `
    <!--[if mso]>
    <table width="700" align="center" cellpadding="0" cellspacing="0" border="0" style="width:700px; margin:0 auto;"><tr><td align="center">
    <![endif]-->
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;width:100%;max-width:700px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);box-sizing:border-box;">
      
      <!-- Premium Admin Header Banner -->
      <div style="background-color:#0f172a;padding:40px 32px;text-align:center;">
        <img src="${ORDER_EMAIL_LOGO_SRC}" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 12px auto;border-radius:12px;color:#ffffff;">
        <div style="color:#ffffff;font-size:15px;font-weight:800;letter-spacing:1.2px;margin:0 0 16px;">PEPTIDES COSTA RICA</div>
        <h1 style="color:#ffffff !important;font-size:28px;font-weight:800;margin:0 0 10px;letter-spacing:-0.5px;">${headline}</h1>
        <p style="color:#e0e7ff !important;font-size:15px;margin:0;max-width:500px;margin:0 auto;line-height:1.5;">${subhead}</p>
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
              <span style="background-color:${isPaid ? '#dcfce7' : isDeclined ? '#fee2e2' : '#fef08a'};color:${isPaid ? '#15803d' : isDeclined ? '#991b1b' : '#854d0e'};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;border:1px solid ${isPaid ? '#bbf7d0' : isDeclined ? '#fecaca' : '#fde047'};">${escapeHtml(order.status || 'Pending')}</span>
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
/**
 * `promoCodesList` is accepted and deliberately unused.
 *
 * The receipt used to print every active code as an "Active Codes" footer.
 * That footer was advertising things that were never ours to give away — an
 * affiliate's referral code, which pays its owner 20% of whatever it is used
 * on, and single-use codes minted for one named customer each. Filtering it
 * down to genuine public offers left one code in it, which is not a promotion,
 * and the business would rather not turn a receipt into an advert at all.
 *
 * The parameter stays because every caller passes it positionally; removing it
 * would silently shift the arguments after it. The banner set in the admin
 * panel still shows — that one is written on purpose, for everyone.
 */
export const buildCustomerHtml = (order, paymentLabel, totalPrimary, totalUsd, totalCrc, lang, links, salesTextEn, salesTextEs, promoCodesList) => {

  const isEn = lang === 'en';
  const isPaid = isPaidStatus(order.status);
  // A receipt sent again on request. The wording stays general on purpose: it
  // is simply the customer's copy of the order as it stands, with no reference
  // to an earlier mail, no admission that anything was wrong, and nothing that
  // reads as an apology. Staff send these for all sorts of ordinary reasons.
  const isResend = order.isResend === true;
  // Was `order.status === 'Declined'`. Every other refusal the gateway can
  // return — "Payment Blocked", "Error", a cancelled sale — failed that test
  // and was shown to the customer as a payment still in progress.
  const isDeclined = isDeclinedStatus(order.status);
  const declineReason = isDeclined ? String(order.declineReason || '').trim() : '';
  const paymentMethod = normalizePaymentMethod(order.paymentMethod);
  const isGatewayPayment = isElectronicGatewayPayment(paymentMethod);
  const showManualPaymentAction = !isPaid && !isGatewayPayment && !isDeclined;
  // A decline with no button leaves the customer holding a refusal and no way
  // to act on it, which is the state they write in angry from.
  const showDeclinedHelpAction = isDeclined;
  const strings = {
    title: isResend
      ? (isEn ? 'Your Receipt' : 'Su Recibo')
      : isPaid
      ? (isEn ? 'Order Confirmed!' : '¡Pedido Confirmado!')
      : isDeclined
        ? (isEn ? 'Payment Declined' : 'Pago Rechazado')
        : isGatewayPayment
          ? (isEn ? 'Order Received - Payment Processing' : 'Pedido Recibido - Pago en Proceso')
          : (isEn ? 'Action Required: Complete Payment' : 'Acción Requerida: Completar Pago'),
    subtitle: isResend
      ? (isEn
        ? 'Here are the details of your order. Please keep this copy for your records.'
        : 'Aquí están los detalles de su pedido. Por favor conserve esta copia para sus registros.')
      : isPaid
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
    declinedHelpBtn: isEn ? 'Message Us on WhatsApp' : 'Escríbanos por WhatsApp',
    footer: isEn ? 'High-Purity Research Peptides · Base in Costa Rica' : 'Péptidos de Alta Pureza para Investigación · Con base en Costa Rica',
  };

  const whatsappPayLink = `https://api.whatsapp.com/send?phone=${links.whatsappNumber}&text=${encodeURIComponent(
    isDeclined
      ? (isEn
        ? `Hi, my card payment for Order ${order.orderNumber} was declined. Can you help me pay another way?`
        : `Hola, mi pago con tarjeta del Pedido ${order.orderNumber} fue rechazado. ¿Me pueden ayudar a pagar de otra forma?`)
      : isEn
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
        <img src="${ORDER_EMAIL_LOGO_SRC}" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 12px auto;border-radius:12px;color:#ffffff;">
        <div style="color:#ffffff;font-size:15px;font-weight:800;letter-spacing:1.2px;margin:0 0 16px;">PEPTIDES COSTA RICA</div>
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
                // "Reason given", not "your bank's reason" — "Card brand not
                // allowed" is the gateway refusing a card type we do not
                // accept, and the customer's bank never saw the transaction.
                ? `Your card was not charged and nothing has left your account.${declineReason ? ` Reason given: “${escapeHtml(declineReason)}”.` : ''} Please try again with another card, or message us on WhatsApp and we will take the order for you.`
                : `No se realizó ningún cargo a su tarjeta y no se ha debitado nada de su cuenta.${declineReason ? ` Motivo indicado: “${escapeHtml(declineReason)}”.` : ''} Intente nuevamente con otra tarjeta, o escríbanos por WhatsApp y tomamos su pedido.`)
              : isGatewayPayment
                ? (isEn
                  ? 'No WhatsApp payment action is needed for this order. We will update your order once the payment processor confirms the transaction.'
                  : 'No necesita completar el pago por WhatsApp para este pedido. Actualizaremos su orden cuando el procesador confirme la transacción.')
                : (isEn
                  ? 'To secure your order and schedule dispatch, please send your payment confirmation screenshot to our agent on WhatsApp.'
                  : 'Para asegurar su pedido y programar el envío, por favor envíe el comprobante de su pago a nuestro asesor por WhatsApp.')}
          </p>
          ${showManualPaymentAction || showDeclinedHelpAction ? `
          <a href="${whatsappPayLink}" style="display:inline-block;background-color:#22c55e;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:800;font-size:18px;text-transform:uppercase;letter-spacing:0.5px;">
             💬 ${showDeclinedHelpAction ? strings.declinedHelpBtn : strings.payNowBtn}
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

        ${(isEn ? salesTextEn : salesTextEs) ? `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:20px;margin:0 auto 32px;max-width:500px;text-align:center;">
          <h4 style="margin:0 0 10px;color:#b45309;font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">🎁 ${isEn ? 'Current Sales' : 'Ventas Actuales'}</h4>
          <p style="margin:0;color:#92400e;font-size:14px;line-height:1.5;font-weight:500;">${escapeHtml(isEn ? salesTextEn : salesTextEs)}</p>
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

