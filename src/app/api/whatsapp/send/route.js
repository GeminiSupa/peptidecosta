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
    const { to, message, customerName, orderId } = payload;

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing required parameters: "to" and "message" are required' }, { status: 400 });
    }

    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.warn('[WhatsApp Outbound] Meta WhatsApp Cloud API credentials are not configured.');
      return NextResponse.json({ error: 'Meta WhatsApp credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured on the server.' }, { status: 500 });
    }

    const cleanPhone = to.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }

    console.log(`[WhatsApp Outbound] Sending message to ${cleanPhone} via Meta API...`);

    // Invoke Meta Cloud API
    const metaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
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
      console.error('[WhatsApp Outbound] Meta API returned an error:', metaData);
      return NextResponse.json({ error: metaData.error?.message || 'Meta API delivery failed' }, { status: metaResponse.status });
    }

    console.log('[WhatsApp Outbound] Meta API delivery successful:', metaData.messages?.[0]?.id);

    // Log the outbound message in Supabase
    if (supabase) {
      try {
        const { error: logErr } = await supabase
          .from('whatsapp_messages')
          .insert({
            wa_id: cleanPhone,
            display_name: customerName || 'Peptides Customer',
            message_text: message,
            message_type: 'text',
            direction: 'outbound',
            matched_order_id: orderId || null,
            raw_payload: metaData
          });

        if (logErr) {
          console.error('[WhatsApp Outbound] Failed to log outbound message in DB:', logErr);
        } else {
          console.log('[WhatsApp Outbound] Successfully logged outbound message to DB');
        }
      } catch (dbCrash) {
        console.error('[WhatsApp Outbound] Unexpected crash during CRM DB logging:', dbCrash);
      }
    }

    return NextResponse.json({ success: true, messageId: metaData.messages?.[0]?.id });
  } catch (err) {
    console.error('[WhatsApp Outbound] Unexpected crash in POST send handler:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
