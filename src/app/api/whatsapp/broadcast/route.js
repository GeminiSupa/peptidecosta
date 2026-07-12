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

const MAX_DIRECT_BROADCAST_RECIPIENTS = Number(process.env.WHATSAPP_DIRECT_BROADCAST_LIMIT || 25);
const OPTOUT_PATTERN = /\b(baja|stop|unsubscribe|desuscribir|dejar de recibir|no recibir promociones)\b/i;
const UNSAFE_CONTENT_PATTERNS = [
  /\b(cura|curar|cura[rn]?|trata|tratamiento|previene|reversa|diagn[oó]stic[oa])\b/i,
  /\b(dosis|dosificaci[oó]n|inyectar|inyecci[oó]n|uso humano|prescripci[oó]n|receta)\b/i,
  /\b(p[eé]rdida de peso|bajar de peso|adelgazar|quema grasa|quemar grasa|anti[-\s]?obesidad)\b/i,
  /\b(glp[-\s]?1|gip|agonista|terap[eé]utico|cl[ií]nico comprobado)\b/i,
];

function getBroadcastSafetyError(message, recipientCount) {
  if (recipientCount > MAX_DIRECT_BROADCAST_RECIPIENTS) {
    return `Direct WhatsApp broadcasts are capped at ${MAX_DIRECT_BROADCAST_RECIPIENTS} recipients. Use scheduled template broadcasts for larger sends.`;
  }
  if (!OPTOUT_PATTERN.test(message)) {
    return 'Add an opt-out line before sending, e.g. "Para dejar de recibir promociones, responda BAJA."';
  }
  if (UNSAFE_CONTENT_PATTERNS.some((pattern) => pattern.test(message))) {
    return 'Message contains high-risk medical, dosage, body-outcome, or therapeutic claims. Keep WhatsApp broadcasts neutral and service-oriented.';
  }
  return null;
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const payload = await request.json();
    const { recipients, message } = payload;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !message) {
      return NextResponse.json({ error: 'Missing required parameters: "recipients" (array) and "message" are required' }, { status: 400 });
    }

    const safetyError = getBroadcastSafetyError(message, recipients.length);
    if (safetyError) {
      return NextResponse.json({ error: safetyError }, { status: 400 });
    }

    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.warn('[WhatsApp Broadcast] Meta WhatsApp Cloud API credentials are not configured.');
      return NextResponse.json({ error: 'Meta WhatsApp credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured on the server.' }, { status: 500 });
    }

    const results = {
      successCount: 0,
      failCount: 0,
      suppressedCount: 0,
      errors: []
    };

    console.log(`[WhatsApp Broadcast] Starting bulk send to ${recipients.length} recipients...`);

    for (const recipient of recipients) {
      const { phone, name } = recipient;
      if (!phone) {
        results.failCount++;
        results.errors.push({ phone: 'unknown', error: 'Missing phone' });
        continue;
      }

      const cleanPhone = cleanPhoneNumber(phone);

      if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
        results.failCount++;
        results.errors.push({ phone: phone, error: 'Invalid format' });
        continue;
      }

      // Compliance: only send marketing to numbers that explicitly opted in
      // (and have not opted out). Everything else is skipped, not sent.
      const gate = await canSendWhatsAppMarketing(supabase, cleanPhone);
      if (!gate.ok) {
        results.suppressedCount++;
        continue;
      }

      try {
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
          results.failCount++;
          results.errors.push({ phone: cleanPhone, error: metaData.error?.message || 'Meta API failed' });
        } else {
          results.successCount++;
          
          // Log to DB
          if (supabase) {
            await supabase.from('whatsapp_messages').insert({
              wa_id: cleanPhone,
              display_name: name || 'Peptides Customer',
              message_text: message,
              message_type: 'text',
              direction: 'outbound',
              raw_payload: metaData
            });
          }
        }
      } catch (err) {
        results.failCount++;
        results.errors.push({ phone: cleanPhone, error: err.message });
      }

      // 250ms delay to respect rate limits
      await new Promise(r => setTimeout(r, 250));
    }

    console.log(`[WhatsApp Broadcast] Finished. Success: ${results.successCount}, Fail: ${results.failCount}`);
    
    return NextResponse.json({ 
      success: true, 
      successCount: results.successCount,
      failCount: results.failCount,
      suppressedCount: results.suppressedCount,
      errors: results.errors 
    });

  } catch (err) {
    console.error('[WhatsApp Broadcast] Unexpected crash in POST send handler:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
