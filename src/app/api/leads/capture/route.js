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

    if (supabase) {
      // Security Check: Prevent duplicate promo codes for the same contact
      const { data: existingLead } = await supabase
        .from('catalog_leads')
        .select('id')
        .eq('contact_value', cleanContact)
        .maybeSingle();

      if (existingLead) {
        console.log(`[Leads Capture] Contact ${cleanContact} already exists. Skipping promo generation.`);
        return NextResponse.json({ success: true, message: 'Already registered' });
      }
    }

    // NOTE: The automatic 15%-off new-customer discount has been disabled.
    // We no longer generate a WELCOME- promo code or advertise a discount to new leads.

    if (supabase) {
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
          ? 'Welcome to Peptides Costa Rica!'
          : '¡Bienvenido a Péptidos Costa Rica!';

        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
            <h1 style="color:#0f172a;font-size:24px;">${language === 'en' ? 'Welcome to our Catalog!' : '¡Bienvenido a nuestro Catálogo!'}</h1>
            <p style="color:#334155;font-size:16px;">
              ${language === 'en'
                ? 'Thank you for signing up. Explore our full catalog of research peptides, live prices, and real-time availability.'
                : 'Gracias por registrarte. Explora nuestro catálogo completo de péptidos de investigación, precios en vivo y disponibilidad en tiempo real.'}
            </p>
            <a href="${links.catalogUrl}" style="display:inline-block;margin-top:20px;background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
              ${language === 'en' ? 'Shop Now' : 'Comprar Ahora'}
            </a>
          </div>
        `;

        try {
          await transporter.sendMail({
            bcc: process.env.BCC_EMAIL || 'info@peptidescostarica.net',
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
    // WhatsApp welcome disabled: the only approved Meta template (welcome_promo1)
    // advertises the 15% new-customer discount, so we no longer send it. New WhatsApp
    // leads are still captured above; a plain (no-discount) welcome would require a new
    // approved Meta template.
    else if (contact_method === 'whatsapp') {
      console.log(`[Leads Capture] WhatsApp lead captured (promo welcome disabled): ${cleanContact}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Leads Capture] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
