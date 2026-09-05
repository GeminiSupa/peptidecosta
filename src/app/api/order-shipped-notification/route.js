import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getBusinessLinks } from '@/lib/settings';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTaxRecordsCopy } from '@/lib/taxRecordsEmail.mjs';
import { resolveTaxRecordsMailer } from '@/lib/taxRecordsSmtp.mjs';
import { getTransactionalSmtpConfig } from '@/lib/transactionalSmtp';
import { orderEmailActivity, recordOrderEmails } from '@/lib/orderEmailLog.mjs';
import { withBacGiftLines } from '@/lib/bacWater.mjs';
import { CORREOS_TRACKING_URL, correosTrackingStrings, hasTrackingNumber } from '@/lib/correosTracking.mjs';
import { pickReviewPlatform } from '@/lib/reviewPlatformSplit.mjs';
import { getReviewSettings } from '@/lib/reviewSettings.mjs';
import { decideForOrder, recordReviewAsk } from '@/lib/reviewAskHistory.mjs';
import { writeDroppingMissingColumns, ORDER_REVIEW_PLATFORM_COLUMNS } from '@/lib/optionalColumns.mjs';

// Read at request time, never at module scope.
//
// Next.js evaluates a route module once, at load. Destructuring the SMTP config
// up here froze whatever process.env held at that moment — and a deployment
// whose build ran before ORDER_SMTP_* existed captured `undefined` and kept it
// for the life of the deployment. Every completion mail then hit the guard
// below and skipped, silently, on an HTTP 200.
//
// That was survivable while /api/admin/orders/update also mailed the customer
// on completion, because that route builds its config inside the handler. Once
// the duplicate-receipt fix made this route the only seat for the completion
// mail AND the accountant's tax copy, the frozen config took both with it.
function getMailSettings() {
  const smtp = getTransactionalSmtpConfig();
  return {
    smtp,
    from: process.env.ORDER_NOTIFICATION_FROM
      || `Peptides Costa Rica <${smtp.user || 'omerforce@gmail.com'}>`,
  };
}

// Trustpilot Automatic Feedback Service (AFS): BCC this address on the
// order-complete email and Trustpilot sends the customer a verified review
// invitation (default 7-day delay, configured in the Trustpilot dashboard).
const TRUSTPILOT_AFS_BCC = process.env.TRUSTPILOT_AFS_BCC || 'peptidescostarica.net+7777886f21@invite.trustpilot.com';

/**
 * How many Trustpilot invitations have gone out this calendar month.
 *
 * Counted against `review_platform`, which arrives via add-review-platform.sql.
 * If that migration has not been run the column is missing and the query fails;
 * the fallback counts every invitation stamped this month instead. That
 * over-counts — Google-half orders are stamped too — which spends the allowance
 * sooner and pushes more orders to Google. Wrong in the safe direction: the
 * failure worth preventing is Trustpilot silently dropping invitations, not
 * sending a few too few.
 *
 * Returns null when the count cannot be established at all, which the caller
 * reads as "assume there is room" rather than blocking the receipt.
 */
async function countTrustpilotInvitesThisMonth(supabase) {
  if (!supabase) return null;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const since = monthStart.toISOString();

  try {
    const exact = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('review_platform', 'trustpilot')
      .gte('review_requested_at', since);
    if (!exact.error) return exact.count ?? 0;

    const fallback = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .not('review_requested_at', 'is', null)
      .gte('review_requested_at', since);
    if (!fallback.error) return fallback.count ?? 0;
  } catch (err) {
    console.error('[Order Shipped Notification] Trustpilot cap lookup failed:', err.message);
  }
  return null;
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
  const correos = correosTrackingStrings(lang);
  
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
        <img src="https://catalog.peptidescostarica.net/logo.png?v=2" alt="Peptides Costa Rica" width="140" height="118" style="display:block;width:140px;height:118px;margin:0 auto 16px auto;border-radius:12px;">
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

        ${hasTrackingNumber(order.tracking_number) ? `
        <!-- Where to actually use that number -->
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px;margin-bottom:24px;text-align:center;">
          <h3 style="font-size:14px;font-weight:800;color:#1e40af;margin:0 0 6px;">📍 ${correos.heading}</h3>
          <p style="font-size:13px;color:#334155;margin:0 0 14px;line-height:1.5;">${correos.body}</p>
          <a href="${CORREOS_TRACKING_URL}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1d4ed8;color:#ffffff !important;font-weight:bold;padding:12px 22px;border-radius:9px;text-decoration:none;font-size:13.5px;">
            ${correos.button}
          </a>
        </div>
        ` : ''}

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

  let deliveryStateUpdater = null;
  let accountingOnlyRequest = false;
  try {
    const payload = await request.json();
    const accountingOnly = payload?.accountingOnly === true;
    accountingOnlyRequest = accountingOnly;
    const supabase = getSupabaseAdmin();
    let order = payload;
    if (payload?.id || payload?.order_number) {
      let lookup = supabase.from('orders').select('*');
      lookup = payload.id ? lookup.eq('id', payload.id) : lookup.eq('order_number', payload.order_number);
      const { data: storedOrder, error: lookupError } = await lookup.maybeSingle();
      if (lookupError) {
        return NextResponse.json({ error: `Could not load the saved order: ${lookupError.message}` }, { status: 500 });
      }
      if (storedOrder) order = storedOrder;
    }
    const updateDeliveryState = async (status, error = null, sentAt = undefined) => {
      if (!order?.id && !order?.order_number) return;
      const deliveryPatch = {
        completion_notification_status: status,
        completion_notification_error: error ? String(error).slice(0, 2000) : null,
        completion_notification_last_attempt_at: new Date().toISOString(),
      };
      if (sentAt !== undefined) deliveryPatch.completion_notification_sent_at = sentAt;
      let update = supabase.from('orders').update(deliveryPatch);
      update = order.id ? update.eq('id', order.id) : update.eq('order_number', order.order_number);
      const { error: stateError } = await update;
      if (stateError) console.error('[Order Shipped Notification] Could not save delivery state:', stateError.message);
    };
    deliveryStateUpdater = updateDeliveryState;
    const links = await getBusinessLinks();

    if (!order?.customer_name || !Array.isArray(order?.items) || order.items.length === 0) {
      return NextResponse.json({ error: 'Invalid order notification payload' }, { status: 400 });
    }

    const hasCustomerEmail = Boolean(String(order.customer_email || '').trim());
    const shouldSendCustomer = hasCustomerEmail && !accountingOnly;

    // A phone-only order still belongs in the accounting record. The old early
    // return skipped both recipients merely because there was no customer
    // address. Accounting-only replays also deliberately skip the customer.
    if (!accountingOnly) await updateDeliveryState('sending');

    const { smtp, from: notificationFrom } = getMailSettings();

    const orderLang = order.lang || (order.currency === 'CRC' ? 'es' : 'en');
    const totalPrimary = formatMoney(order.total_crc || order.total_usd, order.currency);
    const totalUsd = order.total_usd ? formatMoney(order.total_usd, 'USD') : null;
    const totalCrc = order.total_crc ? formatMoney(order.total_crc, 'CRC') : null;

    const transporter = smtp.configured ? nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      }
    }) : null;
    const accountingMailer = resolveTaxRecordsMailer();

    const customerSubject = orderLang === 'en'
      ? `Your Order ${order.order_number || ''} has Shipped! - Peptides Costa Rica`
      : `¡Su pedido ${order.order_number || ''} ha sido enviado! - Péptidos Costa Rica`;
      
    // The free vials, whether or not the stored order lists them.
    //
    // This route renders the row exactly as the table holds it, and orders
    // typed in by an agent — plus everything placed before the gift became an
    // explicit line — never had one. Both the customer's shipping receipt and
    // the accountant's copy of it, which reuses this same body, were therefore
    // describing a smaller box than the one that shipped.
    const emailItems = withBacGiftLines(order.items, orderLang);

    const normalizedOrder = {
      orderNumber: order.order_number || order.id?.substring(0,8),
      shippingAddress: order.shipping_address,
      items: emailItems,
      currency: order.currency,
      tracking_number: order.tracking_number
    };

    const customerHtml = buildCustomerShippedHtml(normalizedOrder, totalPrimary, totalUsd, totalCrc, orderLang, links);

    // Only BCC Trustpilot the FIRST time an order is completed. Re-marking an
    // order (Completed -> Processing -> Completed, or resending the receipt)
    // must not burn another monthly invitation or spam the customer.
    let alreadyInvited = false;
    if (hasCustomerEmail && !accountingOnly) {
      try {
        let query = supabase.from('orders').select('id, review_requested_at');
        query = order.id ? query.eq('id', order.id) : query.eq('order_number', order.order_number);
        const { data: existing } = await query.maybeSingle();
        alreadyInvited = Boolean(existing?.review_requested_at);
      } catch (err) {
        // If the lookup fails we fall back to sending the invitation (previous behavior).
        console.error('[Order Shipped Notification] review_requested_at lookup failed:', err.message);
      }
    }

    // One review site per customer, not both. An order in the Trustpilot half
    // is BCC'd below and stamped as invited; an order in the Google half is
    // deliberately left unstamped so the review-requests cron picks it up five
    // days later with the Google/Facebook email. Stable per order number, so
    // re-marking an order complete cannot move it into the other half and get
    // the customer asked twice. Ratio: REVIEW_TRUSTPILOT_SHARE, default 50.
    //
    // The month's Trustpilot usage is counted first, because the plan caps how
    // many invitations it will actually deliver; past the cap everyone goes to
    // Google rather than being handed an invitation that never arrives.
    //
    // The customer's own history decides first: someone already asked is not
    // asked again on a later order, and someone who clicked is offered a site
    // they have not used. The split and the cap only choose for a customer with
    // no history at all.
    const reviewSettings = await getReviewSettings(supabase);
    const trustpilotThisMonth = await countTrustpilotInvitesThisMonth(supabase);
    const trustpilotHasRoom = !Number.isFinite(trustpilotThisMonth)
      || trustpilotThisMonth < reviewSettings.trustpilotMonthlyCap;

    // The split and the cap are panel settings, so they are handed to
    // pickReviewPlatform as its environment rather than read from process.env.
    const firstChoice = pickReviewPlatform(
      order,
      {
        REVIEW_GOOGLE_SHARE: String(reviewSettings.googleSharePct),
        REVIEW_TRUSTPILOT_MONTHLY_CAP: String(reviewSettings.trustpilotMonthlyCap),
      },
      { trustpilotThisMonth },
    );

    const reviewDecision = hasCustomerEmail
      ? await decideForOrder(supabase, order, {
        firstChoice,
        trustpilotHasRoom,
        policy: {
          reaskAfterDays: reviewSettings.reaskAfterDays,
          maxAsksWithoutClick: reviewSettings.maxAsksWithoutClick,
        },
      })
      : { ask: false, platform: null, offer: [], reason: 'no customer email' };

    const reviewPlatform = reviewDecision.platform;
    const useTrustpilot = reviewPlatform === 'trustpilot';

    // Trustpilot AFS structured data (read by Trustpilot from the BCC'd copy).
    // Not visible to the customer; gives Trustpilot the name, order ref, and language.
    const trustpilotSnippet = `
<script type="application/json+trustpilot">
{
  "recipientEmail": ${JSON.stringify(String(order.customer_email || '').trim())},
  "recipientName": ${JSON.stringify(order.customer_name || 'Cliente')},
  "referenceId": ${JSON.stringify(normalizedOrder.orderNumber || '')},
  "locale": ${JSON.stringify(orderLang === 'en' ? 'en-US' : 'es-ES')}
}
</script>`;
    const customerHtmlWithTrustpilot = shouldSendCustomer && !alreadyInvited && useTrustpilot
      ? customerHtml + trustpilotSnippet
      : customerHtml;

    const customerText = [
      orderLang === 'en' ? 'Your order is on the way!' : '¡Su pedido está en camino!',
      '',
      `${orderLang === 'en' ? 'Tracking Number' : 'Número de Rastreo'}: ${order.tracking_number || 'N/A'}`,
      ...(hasTrackingNumber(order.tracking_number) ? [correosTrackingStrings(orderLang).textLine] : []),
      '',
      `${orderLang === 'en' ? 'Order Summary' : 'Resumen de su Orden'}:`,
      `• ${orderLang === 'en' ? 'Reference' : 'Referencia'}: ${normalizedOrder.orderNumber}`,
      `• ${orderLang === 'en' ? 'Total Paid' : 'Total Pagado'}: ${totalPrimary}`,
      '',
      `${orderLang === 'en' ? 'Delivery Details' : 'Detalles de Envío'}:`,
      normalizedOrder.shippingAddress || 'N/A',
      '',
      `${orderLang === 'en' ? 'Products' : 'Productos'}:`,
      ...emailItems.map(item => `• ${item.product} x${item.qty} (${formatMoney(Number(item.price || 0) * Number(item.qty || 0), order.currency)})`),
      '',
      orderLang === 'en' 
        ? `Need help? Contact our support desk at ${links.whatsappDisplay} or reply to this email.`
        : `¿Necesita ayuda? Contacte a soporte al ${links.whatsappDisplay} o responda a este correo.`
    ].join('\n');

    // Customer-facing mail carries no internal BCC. Trustpilot stays: the AFS
    // invitation is triggered by that BCC'd copy, not by an internal watcher.
    const bccList = [
      alreadyInvited || !useTrustpilot ? null : TRUSTPILOT_AFS_BCC,
    ].filter(Boolean);

    // The customer's receipt carries no accounting CC. This route is still the
    // one the admin panel always calls on completion — /api/order-notification
    // only fires on a not-paid -> paid transition, so an order that sat in
    // "Paid" before being marked "Order Complete" never reaches it — but
    // accounting now gets its own message below rather than a header on this one.
    let customerInfo = null;
    let customerError = null;
    if (shouldSendCustomer) {
      if (!transporter) {
        customerError = 'Transactional SMTP is not configured';
        console.error('[Order Shipped Notification] Transactional SMTP is not configured; customer receipt NOT sent.');
      } else {
        try {
          customerInfo = await transporter.sendMail({
            bcc: bccList,
            from: notificationFrom,
            to: order.customer_email.trim(),
            subject: customerSubject,
            html: customerHtmlWithTrustpilot,
            text: customerText,
          });
          console.log(`[Order Shipped Notification] Customer receipt dispatched: ${customerInfo.messageId} to ${order.customer_email}`);
        } catch (custErr) {
          // Caught rather than thrown so a bad customer address cannot also cost
          // accounting its copy of the sale — the exact failure mode the CC had.
          customerError = custErr.message;
          console.error('[Order Shipped Notification] Customer receipt failed to send:', custErr);
        }
      }
    }

    // PBAG is a Rackspace mailbox, so its configured accounting/Rackspace SMTP
    // is primary. Elastic acceptance does not prove final delivery to PBAG and
    // must not hide an accounting-mailbox failure.
    const taxCopy = await sendTaxRecordsCopy({
      transporter: accountingMailer.transporter,
      from: accountingMailer.from,
      order,
      html: customerHtmlWithTrustpilot,
      text: customerText,
      logPrefix: '[Order Shipped Notification]',
    });
    taxCopy.transport = accountingMailer.source;

    // Record that the Trustpilot invitation went out so later resends (and the
    // review-requests cron, which checks the same column) never duplicate it.
    // Guarded on the send actually landing: the customer send no longer throws,
    // so without this a failed receipt would still be marked as invited and the
    // cron would never retry it.
    // Only the Trustpilot half is stamped here. Stamping the Google half too
    // would close the very door the cron looks through, which is how the
    // Google/Facebook email came to never send at all.
    if (customerInfo && !alreadyInvited && supabase && !reviewDecision.retry && (useTrustpilot || !reviewDecision.ask)) {
      // Two cases stamp the order here. A Trustpilot invitation has just gone
      // out with the BCC above. And a decision NOT to ask is stamped too, so
      // the cron does not pick the order up later and ask anyway — the column
      // is the only thing standing between "already handled" and "still owed".
      // The Google half is deliberately left unstamped for the cron.
      const platform = useTrustpilot ? 'trustpilot' : 'skipped';
      try {
        // review_platform is what the monthly cap is counted against. It comes
        // from a hand-run migration, so it is dropped rather than allowed to
        // fail the stamp: losing the count is recoverable, losing the dedupe
        // would re-invite the customer on the next resend.
        await writeDroppingMissingColumns(
          { review_requested_at: new Date().toISOString(), review_platform: platform },
          ORDER_REVIEW_PLATFORM_COLUMNS,
          (row) => {
            let update = supabase.from('orders').update(row);
            update = order.id ? update.eq('id', order.id) : update.eq('order_number', order.order_number);
            return update;
          },
        );
        if (useTrustpilot) {
          await recordReviewAsk(supabase, {
            email: order.customer_email,
            order,
            platforms: ['trustpilot'],
          });
        }
      } catch (err) {
        console.error('[Order Shipped Notification] Failed to mark review_requested_at:', err.message);
      }
    }

    const deliveryStatus = customerInfo
      ? (taxCopy?.sent === false ? 'partial' : 'sent')
      : (!hasCustomerEmail && taxCopy?.sent ? 'skipped' : 'failed');
    const deliveryError = customerInfo
      ? (taxCopy?.sent === false ? `Accounting copy failed: ${taxCopy.error || 'unknown error'}` : null)
      : (!hasCustomerEmail
        ? `No customer email; accounting copy ${taxCopy?.sent ? 'sent' : `failed: ${taxCopy?.error || 'unknown error'}`}`
        : customerError);
    if (!accountingOnly) {
      await updateDeliveryState(
        deliveryStatus,
        deliveryError,
        customerInfo ? new Date().toISOString() : undefined,
      );
    }

    // An accounting-only resend leaves completion_notification_* alone, because
    // that field describes the customer's receipt and this send never touched
    // it. That is why those resends used to vanish without trace. They are
    // recorded here instead, on the order's own activity log.
    await recordOrderEmails(
      supabase,
      { id: order.id, order_number: order.order_number },
      [
        shouldSendCustomer ? orderEmailActivity({
          kind: 'completion-receipt',
          to: order.customer_email,
          sent: Boolean(customerInfo),
          error: customerError,
        }) : null,
        taxCopy?.skipped ? null : orderEmailActivity({
          kind: 'accounting-copy',
          to: taxCopy?.to,
          sent: Boolean(taxCopy?.sent),
          error: taxCopy?.error,
        }),
      ],
      '[Order Shipped Notification]',
    );

    const requestSucceeded = accountingOnly
      ? Boolean(taxCopy?.sent)
      : (shouldSendCustomer
        ? Boolean(customerInfo) && Boolean(taxCopy?.sent)
        : Boolean(taxCopy?.sent));

    // Reports both sends separately, so "did accounting get it?" is answerable
    // from the response and the logs rather than by asking the accountant.
    return NextResponse.json({
      success: requestSucceeded,
      messageId: customerInfo?.messageId || null,
      customerReceipt: customerInfo
        ? { sent: true, messageId: customerInfo.messageId }
        : {
            sent: false,
            skipped: accountingOnly ? 'accounting-only' : (!hasCustomerEmail ? 'no-customer-email' : undefined),
            error: customerError,
          },
      accountingCopy: taxCopy,
      trustpilotInvited: Boolean(customerInfo) && !alreadyInvited && useTrustpilot,
      reviewPlatform,
      completionNotificationStatus: accountingOnly ? undefined : deliveryStatus,
      completionNotificationError: accountingOnly ? undefined : deliveryError,
      accountingOnly,
    }, { status: requestSucceeded ? 200 : 502 });
  } catch (err) {
    if (deliveryStateUpdater && !accountingOnlyRequest) {
      await deliveryStateUpdater('failed', err.message).catch(() => {});
    }
    console.error('[Order Shipped Notification] Unexpected handler crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
