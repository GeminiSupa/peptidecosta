import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getBusinessLinks } from '@/lib/settings';
import { sendTaxRecordsCopy } from '@/lib/taxRecordsEmail.mjs';
import { resolveTaxRecordsMailer } from '@/lib/taxRecordsSmtp.mjs';
import { buildOrderEmailAddressing, getOrderNotificationRecipients } from '@/lib/orderNotificationRecipients';
import { getOrderEmailLogoAttachment } from '@/lib/orderEmailBranding.mjs';
import { withBacGiftLines } from '@/lib/bacWater.mjs';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getTransactionalSmtpConfig, readEnv } from '@/lib/transactionalSmtp';
import { orderEmailActivity, recordOrderEmails } from '@/lib/orderEmailLog.mjs';
import { classifyPaymentOutcome } from '@/lib/paymentOutcome.mjs';
import { verifyAdminSession } from '@/lib/adminAuth';
import { verifyInternalRequest } from '@/lib/internalRequestAuth.mjs';
import { readLimitedJson, RequestBodyError } from '@/lib/publicApiSecurity.mjs';
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

  // A silent copy of every receipt a customer is sent, for whoever needs to be
  // able to answer "what exactly did they get?" without asking them to forward
  // it. BCC, never CC: the customer's own headers must not name anyone else,
  // which is the mistake the accounting copy was pulled out of the receipt to
  // fix. Comma-separated for more than one watcher; unset means no copy.
  const receiptBcc = readEnv('ORDER_RECEIPT_BCC') || '';

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    replyTo,
    receiptBcc,
    configured,
  };
}

export async function POST(request) {
  try {
    const { rawBody, body: order } = await readLimitedJson(request, 96 * 1024);
    const internal = verifyInternalRequest(request, rawBody, '/api/order-notification');
    if (!internal) {
      const auth = await verifyAdminSession(request, {
        requirePermission: 'orders',
        skipPathPermission: true,
      });
      if (auth.error) return auth.error;
    }

    // Read env vars inside the handler to prevent Next.js caching issues.
    const smtp = getOrderSmtpConfig();
    const links = await getBusinessLinks();

    if (!order?.customerName
        || String(order.customerName).length > 200
        || !Array.isArray(order?.items)
        || order.items.length === 0
        || order.items.length > 100) {
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
        // The usage check is done here, not in the query. PostgREST has no way
        // to compare one column against another, so `usage_limit.gt.usage_count`
        // was read as the literal string "usage_count" and the request failed
        // with `invalid input syntax for type integer`. That error was caught
        // below and swallowed, which took the whole promo list down with it —
        // so the "Active Codes" block has never once rendered in a receipt.
        const { data: promos, error: promoError } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('is_active', true)
          .or(`valid_until.is.null,valid_until.gt.${now}`);

        if (promoError) throw new Error(promoError.message);

        if (promos && promos.length > 0) {
          promoCodesList = promos.filter((p) => (
            // Never surface hidden codes (private mailer-only codes) in emails.
            !p.hidden
            && (p.usage_limit === null || p.usage_limit === undefined
              || Number(p.usage_count || 0) < Number(p.usage_limit))
          ));
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
        const adminSubject = `${adminLead} ${order.orderNumber ? `#${order.orderNumber}` : ''} - ${order.customerName} [${String(order.paymentMethod || '').toUpperCase()}]`;
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
        replyTo: order.customerEmail ? String(order.customerEmail).trim() : undefined,
        attachments: [getOrderEmailLogoAttachment()],
      });

      // A server can accept the submission and still refuse individual
      // addresses, and nodemailer reports that in `info.rejected` rather than
      // by throwing. Nothing here used to read it, so the team alert recorded
      // "sent" even when the company inbox was the address being turned away —
      // which is exactly how a silent outage survives. The accounting copy
      // learned this the hard way; the same rule applies here.
      const refused = (adminInfo?.rejected || []).map((entry) => String(entry));
      const accepted = (adminInfo?.accepted || []).map((entry) => String(entry));

      // Nobody took it. Fall into the catch below so the caller sees a failure
      // rather than a message id for a message that reached no one.
      if (accepted.length === 0) {
        throw new Error(`the mail server refused every recipient${refused.length ? ` (${refused.join(', ')})` : ''}`);
      }

      results.adminNotification = {
        sent: true,
        messageId: adminInfo.messageId,
        recipients: accepted.length,
        ...(refused.length ? { refused } : {}),
      };
      if (refused.length) {
        console.error(`[Order notification] Admin email REFUSED for ${refused.join(', ')} (accepted: ${accepted.join(', ')})`);
      }
      console.log(`[Order notification] Admin email dispatched to ${accepted.length} recipients: ${adminInfo.messageId}`);
    } catch (adminErr) {
      console.error('[Order notification] Admin notification failed to send:', adminErr);
      results.adminNotification = { sent: false, error: adminErr.message };
    }
    }

    //  2. SEND CUSTOMER CONFIRMATION RECEIPT 
    if (!skipCustomer && order.customerEmail && String(order.customerEmail).trim() !== '') {
      // Declared out here so the accounting copy below can reuse the same body
      // after the customer's try/catch has closed.
      let customerHtml = '';
      let customerText = '';

      try {
        // The subject is the only part most customers read before deciding
        // whether anything is wrong. "Order Confirmation" over a refused card
        // is the whole complaint in one line, so it tracks the outcome.
        const outcome = classifyPaymentOutcome(order.status);
        const customerSubject = order.isResend === true
          ? (orderLang === 'en'
            ? `Updated receipt - Order #${order.orderNumber || ''} - Peptides Costa Rica`
            : `Recibo actualizado - Pedido #${order.orderNumber || ''} - Péptidos Costa Rica`)
          : outcome === 'declined'
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
          to: String(order.customerEmail).trim(),
          // Hidden from the customer, and never allowed to be the reason a
          // receipt counts as delivered — that is judged on `to` alone below.
          ...(smtp.receiptBcc ? { bcc: smtp.receiptBcc } : {}),
          subject: customerSubject,
          html: customerHtml,
          text: customerText,
          attachments: [getOrderEmailLogoAttachment()],
        });

        // A server can accept the message and still refuse one address. With a
        // BCC on it, "somebody was accepted" no longer means the customer was,
        // so the customer's own address is checked by name.
        const refused = (customerInfo?.rejected || []).map((entry) => String(entry).toLowerCase());
        if (refused.includes(String(order.customerEmail).trim().toLowerCase())) {
          throw new Error(`the mail server refused ${String(order.customerEmail).trim()}`);
        }

        results.customerReceipt = { sent: true, messageId: customerInfo.messageId };
        console.log(`[Order notification] Customer receipt dispatched: ${customerInfo.messageId} to ${order.customerEmail}`);
      } catch (custErr) {
        console.error('[Order notification] Customer receipt failed to send:', custErr);
        results.customerReceipt = { sent: false, error: custErr.message };
      }

      // Outside the customer try/catch on purpose — accounting's copy of a
      // completed sale must go out whether or not the customer's own receipt
      // did. Never throws, so it cannot break this route either.
      //
      // A resend is the exception. The accountant already holds this sale, and
      // an unlabelled second copy of it reads as a second sale — the exact
      // double-booking the separate accounting send was built to end. The
      // "Resend accounting only" button covers the case where they genuinely
      // need the corrected figures.
      if (order.suppressAccountingCopy === true) {
        results.accountingCopy = { sent: false, skipped: 'resend' };
      } else {
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
    }

    //  3. SEND CUSTOMER WHATSAPP NOTIFICATION (DISABLED)
    // Note: Meta WhatsApp Business API requires a pre-approved template for business-initiated 
    // messages (outside the 24h customer window). Sending a free-form 'text' message will be 
    // blocked by Meta with error 131047. The frontend catalog already opens a
    // WhatsApp window for the user to initiate the chat, which is the correct approach.

    // One write for every email this handler sent, so the order carries its own
    // delivery history and the customer timeline can show it. Never throws.
    // The service-role client, not the anon one. `orders` denies anon writes
    // outright ("permission denied for table orders"), so every entry written
    // here was silently discarded — which is why no team alert or customer
    // receipt has ever appeared in an order's history while the completion
    // receipt, written by an admin client, always did.
    let logClient = null;
    try {
      logClient = getSupabaseAdmin();
    } catch (adminClientErr) {
      console.warn('[Order notification] No service-role client for the email log:', adminClientErr.message);
      logClient = isSupabaseConfigured ? supabase : null;
    }

    await recordOrderEmails(
      logClient,
      { order_number: order.orderNumber || order.order_number },
      [
        skipAdmin ? null : orderEmailActivity({
          kind: order.notificationKind === 'payment-result' ? 'payment-result' : 'admin-alert',
          sent: results.adminNotification.sent,
          error: results.adminNotification.error,
        }),
        // Named separately so a refused company inbox is visible on the order
        // even though the alert did reach the rest of the team.
        results.adminNotification.refused?.length ? orderEmailActivity({
          kind: 'admin-alert',
          to: results.adminNotification.refused.join(', '),
          sent: false,
          error: 'the mail server refused this recipient',
        }) : null,
        results.customerReceipt.skipped ? null : orderEmailActivity({
          kind: order.isResend === true ? 'receipt-resend' : 'customer-receipt',
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
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
