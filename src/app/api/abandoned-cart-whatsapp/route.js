import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/lib/adminAuth';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { canSendWhatsAppMarketing } from '@/lib/whatsappCompliance';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

export async function POST(request) {
  // Was public: anyone could blast WhatsApp messages to arbitrary numbers,
  // driving spam reports and Meta cost. Recovery sends are an admin action.
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

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

    const cleanPhone = cleanPhoneNumber(customer_phone);

    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
      return NextResponse.json({
        error: `Invalid phone number: "${customer_phone}". WhatsApp numbers must be between 8 and 15 digits, including the country code (e.g. 50684046973 or 84046973).`
      }, { status: 400 });
    }

    // Compliance: only message people who explicitly opted in (and not opted out).
    const gate = await canSendWhatsAppMarketing(supabase, cleanPhone);
    if (!gate.ok) {
      return NextResponse.json({ success: false, skipped: true, reason: gate.reason });
    }

    // Dynamic checkout URL to allow recovery
    const origin = request.headers.get('origin') || 'https://catalog.peptidescostarica.net';
    const checkoutUrl = `${origin}/catalog?recover_session=${encodeURIComponent(session_id)}`;

    // Sanitize customer name to prevent literal 'null', 'undefined', 'n/a', etc.
    let customerDisplayName = 'Cliente';
    if (customer_name && typeof customer_name === 'string') {
      const trimmed = customer_name.trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !['null', 'undefined', 'n/a', 'unknown'].includes(lower)) {
        customerDisplayName = trimmed;
      }
    }

    const message = `Hola ${customerDisplayName}, dejaste algunos productos en tu carrito en Peptides Costa Rica.\n\nTus productos seleccionados aún están disponibles. Puedes completar tu pedido aquí:\n${checkoutUrl}\n\nSi tienes alguna pregunta antes de ordenar, nuestro equipo con gusto te ayuda.`;

    console.log(`[Abandoned Cart WhatsApp] Sending automated WhatsApp template recovery to ${cleanPhone}...`);

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
            name: 'abandoned_cart_recovery_v1',
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: customerDisplayName },
                  { type: 'text', text: checkoutUrl }
                ]
              }
            ]
          }
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
          const metaMessageId = metaData?.messages?.[0]?.id || null;
          const { error: logErr } = await supabase
            .from('whatsapp_messages')
            .insert({
              wa_id: cleanPhone,
              display_name: customerDisplayName === 'Cliente' ? 'Peptides Customer' : customerDisplayName,
              message_text: message,
              message_type: 'text',
              direction: 'outbound',
              matched_order_id: null,
              raw_payload: metaData,
              meta_message_id: metaMessageId,
              delivery_status: 'sent'
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
