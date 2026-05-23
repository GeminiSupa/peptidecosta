import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const NOTIFICATION_FROM = process.env.ORDER_NOTIFICATION_FROM || `Peptides Costa Rica <${SMTP_USER || 'info@peptidescostarica.net'}>`;

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
  const rawPrice = item.priceUsd || item.price_usd || item.price;
  if (rawPrice) {
    price = parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0;
  }
  
  if (currency === 'CRC' && (item.priceCrc || item.price_crc)) {
    price = parseFloat(String(item.priceCrc || item.price_crc).replace(/[^0-9.]/g, '')) || 0;
  } else if (currency === 'CRC') {
    // Fallback if price is only USD
    price = Math.round(price * exchangeRate);
  }

  const qty = Number(item.qty || 0);
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">
        <strong>${escapeHtml(item.product || 'Premium Peptide')}</strong>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:center;font-size:14px;color:#334155;">
        x${qty}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">
        ${formatMoney(price * qty, currency)}
      </td>
    </tr>
  `;
}).join('');

// Recovery Email Template Builder
const buildRecoveryHtml = (cartData, customerName, checkoutUrl, currency, lang) => {
  const isEn = lang === 'en';
  
  const strings = {
    title: isEn ? 'We saved your cart! 🧪' : '¡Guardamos tu carrito! 🧪',
    greeting: isEn ? `Hi ${customerName || 'there'},` : `Hola ${customerName || 'Hola'},`,
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
      <div style="background:linear-gradient(135deg, #0f172a, #022c22);padding:32px 24px;text-align:center;">
        <img src="https://peptidecosta.vercel.app/logo.png" alt="Peptides Costa Rica" style="max-height:48px;border-radius:8px;margin-bottom:16px;background:rgba(255,255,255,0.08);padding:4px;">
        <h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0 0 8px;letter-spacing:-0.5px;">${strings.title}</h1>
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
        <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
          <thead>
            <tr style="border-bottom:2px solid #cbd5e1;">
              <th style="text-align:left;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase;">${strings.product}</th>
              <th style="text-align:center;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase;width:50px;">${strings.qty}</th>
              <th style="text-align:right;padding:8px 0;font-size:12px;color:#64748b;text-transform:uppercase;width:90px;">${strings.totalPrice}</th>
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
          <a href="https://wa.me/50684046973" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;font-size:14px;box-shadow:0 2px 4px rgba(37,211,102,0.2);transition:transform 0.15s ease;">
            <svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:middle;margin-right:6px;display:inline-block;fill:#ffffff;">
              <path d="M12.031 2a9.967 9.967 0 00-9.953 9.953c0 1.93.55 3.73 1.5 5.27L2 22l4.91-1.28A9.917 9.917 0 0012.03 22c5.492 0 9.97-4.478 9.97-9.97C22 6.54 17.52 2.03 12.03 2.03zm5.72 13.06c-.24.68-1.2 1.25-1.63 1.29-.42.04-.84.22-2.73-.52a10.025 10.025 0 01-4.88-4.29c-.58-.8-1.03-1.77-1.03-2.78 0-2.02 1.05-3.02 1.43-3.41.3-.3.79-.47 1.23-.47.14 0 .28.01.39.01.33.02.5.04.72.56.28.66.95 2.31 1.03 2.48.08.17.14.37.02.6-.12.23-.18.37-.36.58-.18.2-.38.46-.54.62-.18.18-.37.38-.16.74.21.36.95 1.57 2.04 2.54 1.4 1.25 2.58 1.63 2.94 1.81.36.18.57.16.78-.08.21-.24.91-1.06 1.16-1.42.25-.36.5-.3.84-.18.34.12 2.16 1.02 2.53 1.21.37.19.62.29.7.43.09.15.09.84-.15 1.52z"/>
            </svg>
            ${strings.whatsappBtn}
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
      },
    });

    const isEn = lang === 'en';
    const customerSubject = isEn
      ? `Forgot something? 🧪 Your Peptides Costa Rica cart is waiting!`
      : `¿Olvidaste algo? 🧪 ¡Tu carrito de Péptidos Costa Rica te espera!`;

    // Dynamic checkout URL
    const origin = request.headers.get('origin') || 'https://peptidecosta.vercel.app';
    const checkoutUrl = `${origin}/catalog?session_id=${session_id}&recovered=true`;

    const recoveryHtml = buildRecoveryHtml(cart_data, customer_name, checkoutUrl, currency, lang);

    const recoveryText = [
      isEn ? 'We saved your cart for you!' : '¡Guardamos tu carrito para ti!',
      '',
      isEn 
        ? `Hi ${customer_name || 'there'}, we noticed you left some items in your cart. You can complete your purchase using the following link:` 
        : `Hola ${customer_name || 'Hola'}, notamos que dejaste algunos artículos en tu carrito. Puedes completar tu compra usando el siguiente enlace:`,
      checkoutUrl,
      '',
      isEn ? 'Items in your cart:' : 'Artículos en tu carrito:',
      ...cart_data.map(item => `• ${item.product} x${item.qty}`),
      '',
      isEn 
        ? 'Need help? Contact support at +506 8404-6973 or reply to this email.'
        : '¿Necesita ayuda? Contacte a soporte al +506 8404-6973 o responda a este correo.'
    ].join('\n');

    const mailInfo = await transporter.sendMail({
      from: NOTIFICATION_FROM,
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
