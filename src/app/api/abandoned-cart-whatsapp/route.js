import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

export async function POST(request) {
  try {
    const payload = await request.json();
    const { session_id, customer_name, customer_phone, lang = 'es' } = payload;

    if (!session_id || !customer_phone) {
      return NextResponse.json({ error: 'Missing required parameters: session_id and customer_phone are required' }, { status: 400 });
    }

    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.warn('[Abandoned Cart WhatsApp] Meta WhatsApp Cloud API credentials are not configured.');
      return NextResponse.json({ error: 'Meta WhatsApp credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured on the server.' }, { status: 500 });
    }

    let cleanPhone = customer_phone.replace(/[^0-9]/g, '');
    
    // Auto-remove leading zeros if it starts with 00 followed by country code
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.substring(2);
    }
    
    // If it's a standard Costa Rican 8-digit phone number, automatically prepend the '506' country code
    if (cleanPhone.length === 8) {
      cleanPhone = '506' + cleanPhone;
    }

    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
      return NextResponse.json({ 
        error: `Invalid phone number: "${customer_phone}". WhatsApp numbers must be between 8 and 15 digits, including the country code (e.g. 50684046973 or 84046973).` 
      }, { status: 400 });
    }

    // Dynamic checkout URL to allow recovery
    const origin = request.headers.get('origin') || 'https://peptidecosta.vercel.app';
    const checkoutUrl = `${origin}/catalog?session_id=${session_id}&recovered=true`;

    const isEn = lang === 'en';
    const message = isEn
      ? `Hi ${customer_name || ''}, we saved your cart at Peptides Costa Rica! You can review your items and complete your purchase here:\n${checkoutUrl}\n\nLet us know if you have any questions or need help!`
      : `Hola ${customer_name || ''}, ¡guardamos tu carrito en Péptidos Costa Rica! Puedes revisar tus artículos y completar tu compra aquí:\n${checkoutUrl}\n\n¡Escríbenos si tienes dudas o necesitas ayuda!`;

    console.log(`[Abandoned Cart WhatsApp] Sending automated WhatsApp recovery to ${cleanPhone}...`);

    // Invoke Meta Cloud API
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
          type: 'text',
          text: { body: message },
        }),
      }
    );

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error('[Abandoned Cart WhatsApp] Meta API returned an error:', metaData);
      return NextResponse.json({ error: metaData.error?.message || 'Meta API delivery failed' }, { status: metaResponse.status });
    }

    console.log('[Abandoned Cart WhatsApp] Meta API delivery successful:', metaData.messages?.[0]?.id);

    // Update Supabase database
    if (supabase) {
      try {
        const { error: dbErr } = await supabase
          .from('abandoned_carts')
          .update({
            recovery_whatsapp_sent: true,
            recovery_whatsapp_sent_at: new Date().toISOString()
          })
          .eq('session_id', session_id);

        if (dbErr) {
          console.error('[Abandoned Cart WhatsApp] Failed to update recovery status in DB:', dbErr);
        } else {
          console.log(`[Abandoned Cart WhatsApp] DB status updated for session ${session_id}`);
        }

        // Log the outbound reply to CRM messages
        const { error: logErr } = await supabase
          .from('whatsapp_messages')
          .insert({
            wa_id: cleanPhone,
            display_name: customer_name || 'Peptides Customer',
            message_text: message,
            message_type: 'text',
            direction: 'outbound',
            matched_order_id: null,
            raw_payload: metaData
          });

        if (logErr) {
          console.error('[Abandoned Cart WhatsApp] Failed to log outbound message in DB:', logErr);
        }
      } catch (dbCrash) {
        console.error('[Abandoned Cart WhatsApp] Unexpected crash during DB updates:', dbCrash);
      }
    }

    return NextResponse.json({ success: true, messageId: metaData.messages?.[0]?.id });
  } catch (err) {
    console.error('[Abandoned Cart WhatsApp] Unexpected crash:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
