import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { getBusinessLinks } from '@/lib/settings';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'omerforce@gmail.com'}>`;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

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

const buildItemsRows = (items = [], currency, exchangeRate = 454.48) => items.map((item) => {
  // Parse item price
  let price = 0;
  const usdPrice = item.priceUsd || item.price_usd;
  const rawPrice = usdPrice || item.price;
  if (rawPrice) {
    price = parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0;
  }
  
  if (currency === 'CRC' && usdPrice) {
    price = Math.round(price * exchangeRate);
  } else if (currency === 'CRC' && (item.priceCrc || item.price_crc)) {
    price = parseFloat(String(item.priceCrc || item.price_crc).replace(/[^0-9.]/g, '')) || 0;
  } else if (currency === 'CRC') {
    price = Math.round(price * exchangeRate);
  }

  const qty = Number(item.qty || 0);
  return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;text-align:left;">
        <strong>${escapeHtml(item.product || 'Premium Peptide')}</strong>
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:14px;color:#334155;width:60px;">
        x${qty}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;font-weight:600;color:#0f172a;width:100px;">
        ${formatMoney(price * qty, currency)}
      </td>
    </tr>
  `;
}).join('');

// Recovery Email Template Builder
const buildRecoveryHtml = (customerName, cartData, checkoutUrl, currency, lang, links) => {
  const isEn = lang === 'en';
  
  // Sanitize name to prevent literal 'null', 'undefined', 'n/a', etc.
  let cleanName = '';
  if (customerName && typeof customerName === 'string') {
    const trimmed = customerName.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed && !['null', 'undefined', 'n/a', 'unknown'].includes(lower)) {
      cleanName = trimmed;
    }
  }
  
  const strings = {
    title: isEn ? 'We saved your cart! 🧪' : '¡Guardamos tu carrito! 🧪',
    greeting: isEn ? `Hi ${cleanName || 'there'},` : `Hola ${cleanName || 'Hola'},`,
    body1: isEn 
      ? "We noticed you were browsing our selection of high-purity research peptides, but didn't get a chance to complete your order. Don't worry—we saved your cart so you can pick up right where you left off!" 
      : 'Notamos que estabas buscando en nuestra selección de péptidos de alta pureza para investigación, pero no tuviste la oportunidad de completar tu orden. ¡No te preocupes! Guardamos tu carrito para que puedas continuar justo donde lo dejaste.',
    body2: isEn
      ? "Ready to finalize your research order? Simply click the button below to review your cart and proceed to checkout. We accept convenient payment methods including SINPE Móvil, Credit/Debit cards, and PayPal."
      : '¿Listo para finalizar tu orden de investigación? Simplemente haz clic en el botón de abajo para revisar tu carrito y proceder al pago. Aceptamos métodos de pago convenientes que incluyen SINPE Móvil, tarjetas de crédito/débito y PayPal.',
    cta: isEn ? 'Complete Your Purchase' : 'Completar mi Compra',
    itemsLeft: isEn ? 'Items Left in Your Cart' : 'Artículos en tu Carrito',
    product: isEn ? 'Product' : 'Producto',
    qty: isEn ? 'Qty' : 'Cant',
    totalPrice: isEn ? 'Total Value' : 'Valor Total',
    supportTitle: isEn ? 'Need Assistance?' : '¿Necesitas Ayuda?',
    supportText: isEn 
      ? 'Our support desk is ready to answer any questions about reconstitution, supplies, or shipping details. Reply directly to this email or reach us on WhatsApp.' 
      : 'Nuestra mesa de soporte está lista para responder cualquier consulta sobre reconstitución, suministros o logística de envío. Responde directamente a este correo o contáctanos por WhatsApp.',
    whatsappBtn: isEn ? 'Chat on WhatsApp' : 'Chatear por WhatsApp',
    footer: isEn ? 'High-Purity Research Peptides · Base in Costa Rica' : 'Péptidos de Alta Pureza para Investigación · Con base en Costa Rica',
  };

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.03);">
      
      <!-- Premium Science Theme Header Banner -->
      <div style="background-color:#0f172a;background:linear-gradient(135deg, #0f172a, #022c22);padding:32px 24px;text-align:center;">
        <img src="https://catalog.peptidescostarica.net/logo.png" alt="Peptides Costa Rica" style="max-height:48px;border-radius:8px;margin-bottom:16px;background:rgba(255,255,255,0.08);padding:4px;">
        <h1 style="color:#ffffff !important;font-size:24px;font-weight:800;margin:0 0 8px;letter-spacing:-0.5px;">${strings.title}</h1>
      </div>

      <div style="padding:24px;">
        
        <p style="font-size:16px;font-weight:bold;color:#0f172a;margin-top:0;">${strings.greeting}</p>
        <p style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:16px;">${strings.body1}</p>
        <p style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:24px;">${strings.body2}</p>

        <!-- CTA Recovery Button -->
        <div style="text-align:center;margin-bottom:28px;">
          <a href="${checkoutUrl}" style="display:inline-block;background:linear-gradient(135deg, #10b981, #059669);color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold;font-size:15px;box-shadow:0 4px 6px rgba(16,185,129,0.25);transition:transform 0.15s ease;">
            ${strings.cta} →
          </a>
        </div>

        <!-- Cart Table -->
        <h3 style="font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;border-bottom:1px solid #cbd5e1;padding-bottom:6px;">📋 ${strings.itemsLeft}</h3>
        <table style="width:100%;max-width:440px;margin:0 auto 28px;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:2px solid #cbd5e1;">
              <th style="text-align:left;padding:8px 16px;font-size:12px;color:#64748b;text-transform:uppercase;">${strings.product}</th>
              <th style="text-align:center;padding:8px 16px;font-size:12px;color:#64748b;text-transform:uppercase;width:60px;">${strings.qty}</th>
              <th style="text-align:right;padding:8px 16px;font-size:12px;color:#64748b;text-transform:uppercase;width:100px;">${strings.totalPrice}</th>
            </tr>
          </thead>
          <tbody>
            ${buildItemsRows(cartData, currency)}
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
  try {
    const payload = await request.json();

    const {
      session_id,
      customer_name,
      customer_email,
      cart_data,
      lang = 'es',
      currency = 'CRC'
    } = payload;

    const links = await getBusinessLinks();

    if (!customer_email || !session_id || !Array.isArray(cart_data) || cart_data.length === 0) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.warn('[Abandoned Cart Notification] SMTP credentials not set. Recovery email skipped.');
      return NextResponse.json({ sent: false, error: 'SMTP settings missing' }, { status: 500 });
    }

    // Connect to SMTP
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      }
    });

    const isEn = lang === 'en';
    const customerSubject = isEn
      ? `Forgot something? 🧪 Your Peptides Costa Rica cart is waiting!`
      : `¿Olvidaste algo? 🧪 ¡Tu carrito de Péptidos Costa Rica te espera!`;

    // Dynamic checkout URL
    const origin = request.headers.get('origin') || 'https://catalog.peptidescostarica.net';
    const checkoutUrl = `${origin}/catalog?session_id=${session_id}&recovered=true`;

    // Sanitize customer name to prevent literal 'null', 'undefined', 'n/a', etc.
    let cleanCustomerName = '';
    if (customer_name && typeof customer_name === 'string') {
      const trimmed = customer_name.trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !['null', 'undefined', 'n/a', 'unknown'].includes(lower)) {
        cleanCustomerName = trimmed;
      }
    }

    const recoveryHtml = buildRecoveryHtml(customer_name, cart_data, checkoutUrl, currency, lang, links);

    const recoveryText = [
      isEn ? 'We saved your cart for you!' : '¡Guardamos tu carrito para ti!',
      '',
      isEn 
      ? `Hi ${cleanCustomerName || 'there'}, we noticed you left some items in your cart. You can complete your purchase using the following link:` 
      : `Hola ${cleanCustomerName || 'Hola'}, notamos que dejaste algunos artículos en tu carrito. Puedes completar tu compra usando el siguiente enlace:`,
      checkoutUrl,
      '',
      isEn ? 'Items in your cart:' : 'Artículos en tu carrito:',
      ...cart_data.map(item => `• ${item.product} x${item.qty}`),
      '',
      isEn 
        ? 'Need help? Contact support at +506 8404-6973 or reply to this email.'
        : '¿Necesita ayuda? Contacte a soporte al +506 8404-6973 o responda a este correo.'
    ].join('\n');

    const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'info@peptidescostarica.net'}>`;

    const mailInfo = await transporter.sendMail({
      from: NOTIFICATION_FROM,
      replyTo: SMTP_USER || 'info@peptidescostarica.net',
      to: customer_email.trim(),
      subject: customerSubject,
      html: recoveryHtml,
      text: recoveryText,
    });

    console.log(`[Abandoned Cart Notification] Recovery email sent to ${customer_email}: ${mailInfo.messageId}`);

    // Update database row
    if (supabase) {
      try {
        const { error: dbErr } = await supabase
          .from('abandoned_carts')
          .update({
            recovery_email_sent: true,
            recovery_email_sent_at: new Date().toISOString()
          })
          .eq('session_id', session_id);

        if (dbErr) {
          console.error('[Abandoned Cart Notification] Failed to update recovery status in DB:', dbErr);
        } else {
          console.log(`[Abandoned Cart Notification] DB updated for session ${session_id}`);
        }
      } catch (dbCrash) {
        console.error('[Abandoned Cart Notification] Crash updating DB status:', dbCrash);
      }
    }

    return NextResponse.json({
      success: true,
      messageId: mailInfo.messageId
    });
  } catch (err) {
    console.error('[Abandoned Cart Notification] Unexpected handler crash:', err);
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
