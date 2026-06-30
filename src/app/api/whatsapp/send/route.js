import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/lib/adminAuth';
import { cleanPhoneNumber } from '@/lib/whatsapp';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { to, message, customerName, orderId, sessionId, mediaUrl } = payload;

    if (!to || (!message && !mediaUrl)) {
      return NextResponse.json({ error: 'Missing required parameters: "to" and either "message" or "mediaUrl" are required' }, { status: 400 });
    }

    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.warn('[WhatsApp Outbound] Meta WhatsApp Cloud API credentials are not configured.');
      return NextResponse.json({ error: 'Meta WhatsApp credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured on the server.' }, { status: 500 });
    }

    const cleanPhone = cleanPhoneNumber(to);

    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
      return NextResponse.json({ 
        error: `Invalid phone number: "${to}". WhatsApp numbers must be between 8 and 15 digits, including the country code (e.g. 50684046973 or 84046973).` 
      }, { status: 400 });
    }

    console.log(`[WhatsApp Outbound] Sending message to ${cleanPhone} via Meta API...`);

    // Construct the payload for Meta based on message type
    const metaPayload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
    };

    if (mediaUrl) {
      metaPayload.type = 'image';
      metaPayload.image = { link: mediaUrl };
      if (message && message.trim() !== '') {
        metaPayload.image.caption = message.trim();
      }
    } else {
      metaPayload.type = 'text';
      metaPayload.text = { body: message };
    }

    // Invoke Meta Cloud API
    const metaResponse = await fetch(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaPayload),
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
        let cleanDisplayName = 'Peptides Customer';
        if (customerName && typeof customerName === 'string') {
          const trimmed = customerName.trim();
          const lower = trimmed.toLowerCase();
          if (trimmed && !['null', 'undefined', 'n/a', 'unknown'].includes(lower)) {
            cleanDisplayName = trimmed;
          }
        }

        const metaMessageId = metaData?.messages?.[0]?.id || null;
        const { error: logErr } = await supabase
          .from('whatsapp_messages')
          .insert({
            wa_id: cleanPhone,
            display_name: cleanDisplayName,
            message_text: message || '',
            media_url: mediaUrl || null,
            message_type: mediaUrl ? 'image' : 'text',
            direction: 'outbound',
            matched_order_id: orderId || null,
            raw_payload: metaData,
            meta_message_id: metaMessageId,
            delivery_status: 'sent'
          });

        if (logErr) {
          console.error('[WhatsApp Outbound] Failed to log outbound message in DB:', logErr);
        } else {
          console.log('[WhatsApp Outbound] Successfully logged outbound message to DB');
        }

        // If a sessionId is provided, update the abandoned cart status in the database
        if (sessionId) {
          const { error: cartErr } = await supabase
            .from('abandoned_carts')
            .update({
              recovery_whatsapp_sent: true,
              recovery_whatsapp_sent_at: new Date().toISOString()
            })
            .eq('session_id', sessionId);

          if (cartErr) {
            console.error('[WhatsApp Outbound] Failed to update abandoned cart status in DB:', cartErr);
          } else {
            console.log(`[WhatsApp Outbound] Successfully updated abandoned cart status for session ${sessionId}`);
          }
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
