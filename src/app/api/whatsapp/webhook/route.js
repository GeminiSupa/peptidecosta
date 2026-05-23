import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase client (server-side with service role for writes) ───
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Use service role if available, otherwise fall back to anon key
const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

// ─── WhatsApp Cloud API Config ───
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// ─── GET: Webhook Verification (Meta handshake) ───
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] ✅ Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] ❌ Verification failed — token mismatch');
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ─── POST: Handle Incoming WhatsApp Events ───
export async function POST(request) {
  try {
    const body = await request.json();

    // Meta sends events under entry[].changes[].value
    const entries = body?.entry || [];

    for (const entry of entries) {
      const changes = entry?.changes || [];

      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        // ── Handle incoming messages ──
        const messages = value?.messages || [];
        const contacts = value?.contacts || [];

        for (const msg of messages) {
          const waId = msg.from; // Real WhatsApp number (e.g. "50612345678")
          const messageText = msg?.text?.body || '';
          const messageType = msg?.type || 'text';
          const timestamp = msg?.timestamp;

          // Get display name from contacts array
          const contact = contacts.find(c => c.wa_id === waId);
          const displayName = contact?.profile?.name || '';

          console.log(`[WhatsApp Webhook] 📩 Message from ${waId} (${displayName}): "${messageText.substring(0, 100)}..."`);

          // ── Try to match to an existing order ──
          let matchedOrderId = null;

          if (supabase) {
            // Strategy 1: Look for order number in the message text
            // Our checkout generates messages containing order numbers like WACR-XXXXX or PPCR-XXXXX
            const orderNumMatch = messageText.match(/(WACR|PPCR|TPCR)-[A-Z0-9]+/i);

            if (orderNumMatch) {
              const { data: orderData } = await supabase
                .from('orders')
                .select('id')
                .ilike('order_number', orderNumMatch[0])
                .limit(1)
                .single();

              if (orderData) {
                matchedOrderId = orderData.id;
              }
            }

            // Strategy 2: If no order number found, try to match by phone number
            // (customer_phone might have the same digits)
            if (!matchedOrderId) {
              const cleanWaId = waId.replace(/\D/g, '');
              const { data: phoneOrders } = await supabase
                .from('orders')
                .select('id')
                .or(`customer_phone.ilike.%${cleanWaId.slice(-8)}%,customer_phone.ilike.%${cleanWaId}%`)
                .order('created_at', { ascending: false })
                .limit(1);

              if (phoneOrders && phoneOrders.length > 0) {
                matchedOrderId = phoneOrders[0].id;
              }
            }

            // ── Update the matched order with the real WhatsApp number ──
            if (matchedOrderId) {
              const { error: updateError } = await supabase
                .from('orders')
                .update({ whatsapp_wa_id: waId })
                .eq('id', matchedOrderId);

              if (updateError) {
                console.error('[WhatsApp Webhook] Failed to update order:', updateError);
              } else {
                console.log(`[WhatsApp Webhook] ✅ Linked wa_id ${waId} to order ${matchedOrderId}`);
              }
            }

            // Also bulk-update any other orders from this customer that don't have wa_id yet
            const cleanNum = waId.replace(/\D/g, '');
            await supabase
              .from('orders')
              .update({ whatsapp_wa_id: waId })
              .is('whatsapp_wa_id', null)
              .or(`customer_phone.ilike.%${cleanNum.slice(-8)}%,customer_phone.ilike.%${cleanNum}%`);

            // ── Log the message to whatsapp_messages table ──
            const { error: insertError } = await supabase
              .from('whatsapp_messages')
              .insert({
                wa_id: waId,
                display_name: displayName,
                message_text: messageText,
                message_type: messageType,
                direction: 'inbound',
                matched_order_id: matchedOrderId,
                raw_payload: body,
              });

            if (insertError) {
              console.error('[WhatsApp Webhook] Failed to log message:', insertError);
            }
          }

          // ── Send auto-reply (within 24h service window — FREE) ──
          if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
            try {
              const replyText = matchedOrderId
                ? `¡Hola ${displayName || ''}! 👋 Hemos recibido tu pedido. Te contactaremos pronto para coordinar el envío. 🚀\n\nHi ${displayName || ''}! 👋 We've received your order. We'll be in touch shortly to coordinate delivery. 🚀`
                : `¡Hola ${displayName || ''}! 👋 Gracias por contactarnos. Un agente te responderá pronto.\n\nHi ${displayName || ''}! 👋 Thanks for reaching out. An agent will reply shortly.`;

              await fetch(
                `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: waId,
                    type: 'text',
                    text: { body: replyText },
                  }),
                }
              );

              console.log(`[WhatsApp Webhook] 📤 Auto-reply sent to ${waId}`);

              // Log the outbound reply
              if (supabase) {
                await supabase.from('whatsapp_messages').insert({
                  wa_id: waId,
                  display_name: 'Peptides Costa Rica',
                  message_text: replyText,
                  message_type: 'text',
                  direction: 'outbound',
                  matched_order_id: matchedOrderId,
                });
              }
            } catch (replyErr) {
              console.error('[WhatsApp Webhook] Auto-reply failed:', replyErr);
              // Don't fail the webhook — auto-reply is optional
            }
          }
        }

        // ── Handle message status updates (sent, delivered, read) ──
        const statuses = value?.statuses || [];
        for (const status of statuses) {
          console.log(`[WhatsApp Webhook] 📊 Status: ${status.status} for message ${status.id}`);
          // Could log delivery/read receipts in the future
        }
      }
    }

    // Always return 200 OK quickly — Meta requires this
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    console.error('[WhatsApp Webhook] Error processing event:', error);
    // Still return 200 to avoid Meta retries flooding
    return NextResponse.json({ status: 'error logged' }, { status: 200 });
  }
}
