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
    const { recipients, message } = payload;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !message) {
      return NextResponse.json({ error: 'Missing required parameters: "recipients" (array) and "message" are required' }, { status: 400 });
    }

    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
      console.warn('[WhatsApp Broadcast] Meta WhatsApp Cloud API credentials are not configured.');
      return NextResponse.json({ error: 'Meta WhatsApp credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured on the server.' }, { status: 500 });
    }

    const results = {
      successCount: 0,
      failCount: 0,
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
      errors: results.errors 
    });

  } catch (err) {
    console.error('[WhatsApp Broadcast] Unexpected crash in POST send handler:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
