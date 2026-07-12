import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/lib/adminAuth';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { canSendWhatsAppMarketing } from '@/lib/whatsappCompliance';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

export async function POST(request) {
  // Was public: anyone could send WhatsApp template messages to arbitrary
  // numbers. Restricted to admins to prevent spam/ban and API cost abuse.
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { phone, lang = 'es' } = payload;

    if (!phone) {
      return NextResponse.json({ error: 'Missing required parameter: phone is required' }, { status: 400 });
    }

    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.warn('[Welcome WhatsApp] Meta WhatsApp Cloud API credentials are not configured.');
      return NextResponse.json({ error: 'Meta WhatsApp credentials are not configured on the server.' }, { status: 500 });
    }

    const cleanPhone = cleanPhoneNumber(phone);

    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
      return NextResponse.json({
        error: `Invalid phone number format.`
      }, { status: 400 });
    }

    // Compliance: only message people who explicitly opted in (and not opted out).
    const gate = await canSendWhatsAppMarketing(supabase, cleanPhone);
    if (!gate.ok) {
      return NextResponse.json({ success: false, skipped: true, reason: gate.reason });
    }

    const origin = request.headers.get('origin') || 'https://catalog.peptidescostarica.net';
    const catalogUrl = `${origin}/catalog`;
    
    // Fallback message text for DB logging
    const message = `¡Bienvenido a Péptidos Costa Rica! Accede al catálogo aquí: ${catalogUrl}. Para consultas 24/7 contáctanos al +506 8404-6973.`;

    console.log(`[Welcome WhatsApp] Sending automated WhatsApp template welcome to ${cleanPhone}...`);

    // Invoke Meta Cloud API with the approved template
    const metaResponse = await fetch(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: {
            // TODO: Replace 'hello_world' with your actual approved template name (e.g. 'catalog_welcome')
            name: 'hello_world',
            language: { code: 'en_US' }
          }
        }),
      }
    );

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error('[Welcome WhatsApp] Meta API returned an error:', metaData);
      return NextResponse.json({ error: metaData.error?.message || 'Meta API delivery failed' }, { status: metaResponse.status });
    }

    console.log('[Welcome WhatsApp] Meta API delivery successful:', metaData.messages?.[0]?.id);

    // Update Supabase database
    if (supabase) {
      try {
        // Log the outbound reply to CRM messages
        const { error: logErr } = await supabase
          .from('whatsapp_messages')
          .insert({
            wa_id: cleanPhone,
            display_name: 'Catalog Lead',
            message_text: message, // Log what the template theoretically means
            message_type: 'template',
            direction: 'outbound',
            matched_order_id: null,
            raw_payload: metaData
          });

        if (logErr) {
          console.error('[Welcome WhatsApp] Failed to log outbound message in DB:', logErr);
        }
      } catch (dbCrash) {
        console.error('[Welcome WhatsApp] Unexpected crash during DB updates:', dbCrash);
      }
    }

    return NextResponse.json({ success: true, messageId: metaData.messages?.[0]?.id });
  } catch (err) {
    console.error('[Welcome WhatsApp] Unexpected crash:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
