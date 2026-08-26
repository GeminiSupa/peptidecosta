import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getBusinessLinks } from '@/lib/settings';
import { sendTaxRecordsCopy } from '@/lib/taxRecordsEmail.mjs';
import { resolveTaxRecordsMailer } from '@/lib/taxRecordsSmtp.mjs';
import { buildOrderEmailAddressing, getOrderNotificationRecipients } from '@/lib/orderNotificationRecipients';
import { getOrderEmailLogoAttachment } from '@/lib/orderEmailBranding.mjs';
import { withBacGiftLines } from '@/lib/bacWater.mjs';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getTransactionalSmtpConfig, readEnv } from '@/lib/transactionalSmtp';
import { orderEmailActivity, recordOrderEmails } from '@/lib/orderEmailLog.mjs';
import { classifyPaymentOutcome } from '@/lib/paymentOutcome.mjs';
import {
  buildAdminHtml,
  buildCustomerHtml,
  formatMoney,
  isElectronicGatewayPayment,
  isPaidStatus,
  paymentLabels,
} from '@/lib/orderEmailTemplates.mjs';

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
  // Order mail always presents the verified company inbox as the sender. The
  // SMTP login may be an Elastic Email account and must never leak into From.
  const fromEmail = 'info@peptidescostarica.net';
  const from = `Peptides Costa Rica <${fromEmail}>`;
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
    // before it posts, so only the vials nobody has granted yet are filled in
    // here. Injecting the whole allowance unconditionally would bill the
    // customer for vials and then gift them the same count on top.
    //
    // What is granted is counted, not merely whether any water is present: an
    // order carrying two paid vials and no gift line is still owed its free
    // ones, and the earlier all-or-nothing check dropped them silently.
    order.items = withBacGiftLines(order.items, orderLang);

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
        // The team sorts by subject line. A result mail that also opened with
        // "New Order" would read as a second order for the same customer.
        const adminOutcome = classifyPaymentOutcome(order.status);
        const adminLead = order.notificationKind === 'payment-result'
          ? `${order.firstTeamAlert === true ? 'New Order ' : ''}${adminOutcome === 'paid' ? 'PAID' : adminOutcome === 'declined' ? 'DECLINED' : 'Payment update'}`
          : 'New Order';
        const adminSubject = `${adminLead} ${order.orderNumber ? `#${order.orderNumber}` : ''} - ${order.customerName} [${order.paymentMethod?.toUpperCase()}]`;
      const adminHtml = buildAdminHtml(order, paymentLabel, totalPrimary, totalUsd, totalCrc);
      
      const adminText = [
        order.notificationKind === 'payment-result'
          ? ` Peptides Costa Rica - Payment ${adminOutcome === 'paid' ? 'Approved' : adminOutcome === 'declined' ? 'Declined' : 'Update'}`
          : ' Peptides Costa Rica - New Order Received',
        ...(order.declineReason ? [`Gateway reason: ${order.declineReason}`] : []),
        `Order Reference: ${order.orderNumber || 'N/A'}`,
        `Payment Method: ${paymentLabel}`,
        `Order Status: ${order.status || 'Pending'}`,
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
      const addressing = buildOrderEmailAddressing(recipients);

      const adminInfo = await transporter.sendMail({
        from: smtp.from,
        to: addressing.to,
        cc: addressing.cc,
        bcc: addressing.bcc,
        subject: adminSubject,
        html: adminHtml,
        text: adminText,
        replyTo: order.customerEmail || undefined,
        attachments: [getOrderEmailLogoAttachment()],
      });

      const recipientCount = 1 + addressing.cc.length + addressing.bcc.length;
      results.adminNotification = { sent: true, messageId: adminInfo.messageId, recipients: recipientCount };
      console.log(`[Order notification] Admin email dispatched to ${recipientCount} recipients: ${adminInfo.messageId}`);
    } catch (adminErr) {
      console.error('[Order notification] Admin notification failed to send:', adminErr);
      results.adminNotification = { sent: false, error: adminErr.message };
    }
    }

    //  2. SEND CUSTOMER CONFIRMATION RECEIPT 
    if (!skipCustomer && order.customerEmail && order.customerEmail.trim() !== '') {
      // Declared out here so the accounting copy below can reuse the same body
      // after the customer's try/catch has closed.
      let customerHtml = '';
      let customerText = '';

      try {
        // The subject is the only part most customers read before deciding
        // whether anything is wrong. "Order Confirmation" over a refused card
        // is the whole complaint in one line, so it tracks the outcome.
        const outcome = classifyPaymentOutcome(order.status);
        const customerSubject = outcome === 'declined'
          ? (orderLang === 'en'
            ? `Payment declined - Order #${order.orderNumber || ''} - Peptides Costa Rica`
            : `Pago rechazado - Pedido #${order.orderNumber || ''} - Péptidos Costa Rica`)
          : outcome === 'paid'
            ? (orderLang === 'en'
              ? `Payment confirmed - Order #${order.orderNumber || ''} - Peptides Costa Rica`
              : `Pago confirmado - Pedido #${order.orderNumber || ''} - Péptidos Costa Rica`)
            : (orderLang === 'en'
              ? `Order received #${order.orderNumber || ''} - Peptides Costa Rica`
              : `Pedido recibido #${order.orderNumber || ''} - Péptidos Costa Rica`);

        customerHtml = buildCustomerHtml(order, paymentLabel, totalPrimary, totalUsd, totalCrc, orderLang, links, salesTextEn, salesTextEs, promoCodesList);

        customerText = [
          isPaid
            ? (orderLang === 'en' ? 'Thank you for your order and payment!' : 'Gracias por su pedido y su pago!')
            : outcome === 'declined'
              ? (orderLang === 'en'
                ? `Your card payment for this order was declined and nothing was charged.${order.declineReason ? ` Reason given: ${order.declineReason}` : ''}`
                : `Su pago con tarjeta fue rechazado y no se realizó ningún cargo.${order.declineReason ? ` Motivo indicado: ${order.declineReason}` : ''}`)
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

        // No accounting CC: the accountant's copy is sent separately below, so
        // a failure here cannot take it down and customers never see the
        // address in their headers.
        const customerInfo = await transporter.sendMail({
          from: smtp.from,
          replyTo: smtp.replyTo,
          to: order.customerEmail.trim(),
          subject: customerSubject,
          html: customerHtml,
          text: customerText,
          attachments: [getOrderEmailLogoAttachment()],
        });

        results.customerReceipt = { sent: true, messageId: customerInfo.messageId };
        console.log(`[Order notification] Customer receipt dispatched: ${customerInfo.messageId} to ${order.customerEmail}`);
      } catch (custErr) {
        console.error('[Order notification] Customer receipt failed to send:', custErr);
        results.customerReceipt = { sent: false, error: custErr.message };
      }

      // Outside the customer try/catch on purpose — accounting's copy of a
      // completed sale must go out whether or not the customer's own receipt
      // did. Never throws, so it cannot break this route either.
      const accountingMailer = resolveTaxRecordsMailer();
      results.accountingCopy = await sendTaxRecordsCopy({
        transporter: accountingMailer.transporter,
        from: accountingMailer.from,
        order: {
          status: order.status,
          order_number: order.orderNumber || order.order_number,
          customer_name: order.customerName || order.customer_name,
        },
        html: customerHtml,
        text: customerText,
        logPrefix: '[Order notification]',
      });
      results.accountingCopy.transport = accountingMailer.source;
    }

    //  3. SEND CUSTOMER WHATSAPP NOTIFICATION (DISABLED)
    // Note: Meta WhatsApp Business API requires a pre-approved template for business-initiated 
    // messages (outside the 24h customer window). Sending a free-form 'text' message will be 
    // blocked by Meta with error 131047. The frontend catalog already opens a
    // WhatsApp window for the user to initiate the chat, which is the correct approach.

    // One write for every email this handler sent, so the order carries its own
    // delivery history and the customer timeline can show it. Never throws.
    await recordOrderEmails(
      isSupabaseConfigured ? supabase : null,
      { order_number: order.orderNumber || order.order_number },
      [
        skipAdmin ? null : orderEmailActivity({
          kind: order.notificationKind === 'payment-result' ? 'payment-result' : 'admin-alert',
          sent: results.adminNotification.sent,
          error: results.adminNotification.error,
        }),
        results.customerReceipt.skipped ? null : orderEmailActivity({
          kind: 'customer-receipt',
          to: order.customerEmail,
          sent: results.customerReceipt.sent,
          error: results.customerReceipt.error,
        }),
        results.accountingCopy && !results.accountingCopy.skipped ? orderEmailActivity({
          kind: 'accounting-copy',
          to: results.accountingCopy.to,
          sent: results.accountingCopy.sent,
          error: results.accountingCopy.error,
        }) : null,
      ],
      '[Order notification]',
    );

    const responseBody = {
      success: results.adminNotification.sent || results.customerReceipt.sent,
      results
    };

    // An admin-only call is the durable new-order alert. Surface its failure as
    // an HTTP failure so the caller and deployment logs cannot report success.
    if (order.adminNotificationOnly === true && !results.adminNotification.sent) {
      return NextResponse.json(responseBody, { status: 502 });
    }

    return NextResponse.json(responseBody);
  } catch (err) {
    console.error('[Order notification] Unexpected handler crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
