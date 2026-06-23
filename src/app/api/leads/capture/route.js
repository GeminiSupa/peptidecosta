import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { getBusinessLinks } from '@/lib/settings';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

export async function POST(request) {
  try {
    const payload = await request.json();
    const {
      contact_method,
      contact_value,
      language = 'es',
      ip_address,
      city,
      region,
      country,
      utm_source,
      utm_medium,
      utm_campaign,
      referrer
    } = payload;

    if (!contact_value) {
      return NextResponse.json({ error: 'Missing contact value' }, { status: 400 });
    }

    const cleanContact = contact_method === 'email' 
      ? contact_value.trim() 
      : cleanPhoneNumber(contact_value.trim());

    // Generate unique promo code
    const promoCode = 'WELCOME-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    if (supabase) {
      // Insert into promo_codes
      const { error: promoErr } = await supabase.from('promo_codes').insert([{
        code: promoCode,
        discount_pct: 0.15, // 15% off
        usage_limit: 1,
        usage_count: 0,
        is_active: true
      }]);

      if (promoErr) console.error('[Leads Capture] Error saving promo code:', promoErr);

      // Insert into catalog_leads
      const { error: leadErr } = await supabase.from('catalog_leads').insert([{
        contact_method,
        contact_value: cleanContact,
        language,
        ip_address,
        city,
        region,
        country,
        utm_source,
        utm_medium,
        utm_campaign,
        referrer
      }]);

      if (leadErr) console.error('[Leads Capture] Error saving lead:', leadErr);
    }

    const links = await getBusinessLinks();

    // Send Welcome Email
    if (contact_method === 'email') {
      if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        console.warn('[Leads Capture] SMTP not configured. Cannot send welcome email.');
      } else {
        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_SECURE,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
          tls: { rejectUnauthorized: false }
        });

        const subject = language === 'en' 
          ? 'Welcome to Peptides Costa Rica! Here is your 15% off code.' 
          : '¡Bienvenido a Péptidos Costa Rica! Aquí tienes tu código de 15% de descuento.';

        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
            <h1 style="color:#0f172a;font-size:24px;">${language === 'en' ? 'Welcome to our Catalog!' : '¡Bienvenido a nuestro Catálogo!'}</h1>
            <p style="color:#334155;font-size:16px;">
              ${language === 'en' 
                ? 'Thank you for signing up. As a special gift, here is a one-time use promo code for 15% off your first purchase:' 
                : 'Gracias por registrarte. Como regalo especial, aquí tienes un código de descuento de un solo uso para obtener un 15% de descuento en tu primera compra:'}
            </p>
            <div style="background:#e0f2fe;padding:20px;text-align:center;border-radius:8px;margin:20px 0;">
              <span style="font-size:24px;font-weight:bold;color:#0284c7;letter-spacing:2px;">${promoCode}</span>
            </div>
            <p style="color:#334155;font-size:14px;">
              ${language === 'en' 
                ? 'You can apply this code during checkout. Valid for one purchase only.' 
                : 'Puedes aplicar este código durante el pago. Válido para una sola compra.'}
            </p>
            <a href="${links.catalogUrl}" style="display:inline-block;margin-top:20px;background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
              ${language === 'en' ? 'Shop Now' : 'Comprar Ahora'}
            </a>
          </div>
        `;

        try {
          await transporter.sendMail({
            from: `Peptides Costa Rica <${SMTP_USER}>`,
            to: cleanContact,
            subject,
            html,
          });
          console.log(`[Leads Capture] Welcome email sent to ${cleanContact}`);
        } catch (mailErr) {
          console.error('[Leads Capture] Welcome email failed:', mailErr);
        }
      }
    } 
    // Send WhatsApp Message
    else if (contact_method === 'whatsapp') {
      if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        console.warn('[Leads Capture] WhatsApp API credentials missing.');
      } else {
        try {
          const metaResponse = await fetch(
            `https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: cleanContact,
                type: 'template',
                template: {
                  name: 'welcome_promo', // Ensure this template is approved in Meta
                  language: { code: language === 'en' ? 'en_US' : 'es' },
                  components: [
                    {
                      type: 'body',
                      parameters: [
                        { type: 'text', text: promoCode }
                      ]
                    }
                  ]
                }
              }),
            }
          );
          const metaData = await metaResponse.json();
          if (!metaResponse.ok) {
            console.error('[Leads Capture] Meta API error:', metaData);
          } else {
            console.log('[Leads Capture] WhatsApp welcome sent:', metaData.messages?.[0]?.id);
            if (supabase) {
              await supabase.from('whatsapp_messages').insert([{
                wa_id: cleanContact,
                display_name: 'Catalog Lead',
                message_text: `Welcome! Your 15% promo code is: ${promoCode}`,
                message_type: 'template',
                direction: 'outbound',
                raw_payload: metaData
              }]);
            }
          }
        } catch (waErr) {
          console.error('[Leads Capture] WhatsApp message failed:', waErr);
        }
      }
    }

    return NextResponse.json({ success: true, promoCode });
  } catch (err) {
    console.error('[Leads Capture] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
