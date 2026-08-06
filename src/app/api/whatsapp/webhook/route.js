import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_WHATSAPP_AI_PROMPT } from '@/lib/whatsappRecovery';
import { buildWhatsAppCustomerContext } from '@/lib/whatsappAiContext';
import { insertWhatsAppMessage } from '@/lib/whatsappMessageLog';
import { upsertWhatsAppConversation } from '@/lib/whatsappConversations.mjs';
import {
  detectWhatsAppIntent,
  setWhatsAppSuppression,
  OPT_OUT_CONFIRMATION,
  OPT_IN_CONFIRMATION,
} from '@/lib/whatsappCompliance';

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

  // A bare GET with no handshake params is a bot scanning a public URL, not a
  // misconfiguration. Logging both cases as "token mismatch" buried the real
  // signal under dozens of false alarms an hour.
  if (mode === 'subscribe') {
    console.warn('[WhatsApp Webhook] ❌ Verification failed — token mismatch');
  }
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
          const receivedAt = new Date().toISOString();

          // Get display name from contacts array
          const contact = contacts.find(c => c.wa_id === waId);
          let rawDisplayName = contact?.profile?.name || '';
          if (rawDisplayName && typeof rawDisplayName === 'string') {
            const trimmed = rawDisplayName.trim();
            const lower = trimmed.toLowerCase();
            if (['null', 'undefined', 'n/a', 'unknown'].includes(lower)) {
              rawDisplayName = '';
            } else {
              rawDisplayName = trimmed;
            }
          }
          const displayName = rawDisplayName;

          console.log(`[WhatsApp Webhook] 📩 Message from ${waId} (${displayName || 'Unknown'}): "${messageText.substring(0, 100)}..."`);

          // ── Try to match to an existing order ──
          let matchedOrderId = null;
          let routedConversation = null;

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
            const { error: insertError } = await insertWhatsAppMessage(supabase, {
                wa_id: waId,
                display_name: displayName,
                message_text: messageText,
                message_type: messageType,
                direction: 'inbound',
                source: 'cloud_api',
                matched_order_id: matchedOrderId,
                raw_payload: body,
              });

            if (insertError) {
              console.error('[WhatsApp Webhook] Failed to log message:', insertError);
            }

            const { data: conversationData, error: conversationError } = await upsertWhatsAppConversation(supabase, {
              waId,
              displayName,
              messageAt: receivedAt,
              direction: 'inbound',
              source: 'cloud_api',
              matchedOrderId,
              metadata: {
                webhook_message_id: msg.id || null,
                webhook_timestamp: timestamp || null,
              },
            });
            if (conversationError) {
              console.error('[WhatsApp Webhook] Failed to route conversation:', conversationError);
            } else {
              routedConversation = conversationData;
            }
          }

          // ── Forward notification to the support team ──
          const supportNotificationNumbers = ['50684046973', '50660604775', '18314715559'];
          if (ACCESS_TOKEN && PHONE_NUMBER_ID && !supportNotificationNumbers.includes(waId)) {
            const ownerLabel = routedConversation?.assigned_to_name || routedConversation?.assigned_to_email || 'Unassigned';
            const adminNotificationText = `🚨 *New Inbound Message*\n\n*From:* ${displayName || 'Unknown'} (+${waId})\n*Owner:* ${ownerLabel}\n*Find it:* Sales WhatsApp → ${ownerLabel === 'Unassigned' ? 'Unassigned' : ownerLabel}\n*Message:* ${messageText}`;
            supportNotificationNumbers.forEach((supportNumber) => fetch(
              `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${ACCESS_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: supportNumber,
                  type: 'text',
                  text: { body: adminNotificationText },
                }),
              }
            ).catch(err => console.error('[WhatsApp Webhook] Failed to send admin notification:', err)));
          }

          // ── Honor opt-out (STOP/BAJA) and opt-in (ALTA) requests ──
          // Meta requires opt-out requests to be respected. When detected, we
          // update the marketing suppression list, send a Spanish confirmation,
          // and skip the AI auto-reply for this message.
          const intent = detectWhatsAppIntent(messageText);
          if (intent && supabase) {
            const isOptOut = intent === 'opt_out';
            await setWhatsAppSuppression(supabase, waId, isOptOut, {
              reason: isOptOut ? 'user_optout' : 'user_optin',
              source: 'whatsapp_inbound',
            });
            const confirmation = isOptOut ? OPT_OUT_CONFIRMATION : OPT_IN_CONFIRMATION;

            if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
              try {
                await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: waId,
                    type: 'text',
                    text: { body: confirmation },
                  }),
                });
                if (supabase) {
                  await insertWhatsAppMessage(supabase, {
                    wa_id: waId,
                    display_name: 'System',
                    message_text: confirmation,
                    message_type: 'text',
                    direction: 'outbound',
                    source: 'cloud_api',
                    raw_payload: { compliance: intent },
                  });
                  await upsertWhatsAppConversation(supabase, {
                    waId,
                    displayName: 'System',
                    direction: 'outbound',
                    source: 'cloud_api',
                    metadata: { compliance: intent },
                  });
                }
              } catch (confirmErr) {
                console.error('[WhatsApp Webhook] Failed to send opt-out confirmation:', confirmErr);
              }
            }

            console.log(`[WhatsApp Webhook] 🔕 Handled ${intent} for ${waId}; skipping AI reply.`);
            continue; // do not run AI auto-reply for opt-out/opt-in messages
          }

          // ── Send auto-reply (within 24h service window — FREE) ──
          if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
            try {
              let aiAutoReply = !!process.env.GEMINI_API_KEY;
              let aiSystemPrompt = DEFAULT_WHATSAPP_AI_PROMPT;
              
              // 1. Fetch settings from Supabase
              if (supabase) {
                try {
                  const { data: settingsData } = await supabase
                    .from('site_settings')
                    .select('value')
                    .eq('id', 'whatsapp_settings')
                    .limit(1)
                    .single();
                  
                  if (settingsData && settingsData.value) {
                    aiAutoReply = settingsData.value.ai_auto_reply !== false;
                    if (settingsData.value.ai_system_prompt) {
                      aiSystemPrompt = settingsData.value.ai_system_prompt;
                    }
                  }
                } catch (err) {
                  console.warn('[WhatsApp Webhook] Failed to fetch site_settings, using defaults:', err.message);
                }
              }

              // 2. Fetch Catalog Context
              let catalogContext = "";
              if (supabase && aiAutoReply) {
                try {
                  const { data: products } = await supabase
                    .from('products')
                    .select('product, category, price_usd, price_crc, status, description_es');
                  if (products && products.length > 0) {
                    catalogContext = "Active Products in Catalog:\n" + products.map(p => 
                      `- ${p.product} (Category: ${p.category}, Price: ${p.price_usd} USD / ${p.price_crc || 'N/A'} CRC, Stock Status: ${p.status}, Description: ${p.description_es || 'No description'})`
                    ).join('\n');
                  }
                } catch (err) {
                  console.error('[WhatsApp Webhook] Failed to load products for AI context:', err);
                }
              }

              // 3. Customer CRM context (orders + active abandoned carts)
              let customerContext = '';
              if (supabase && aiAutoReply) {
                customerContext = await buildWhatsAppCustomerContext(supabase, waId);
              }

              // 4. Fetch Conversation Memory (last 8 messages, excluding current inbound)
              let memoryContext = '';
              if (supabase && aiAutoReply) {
                try {
                  const { data: pastMessages } = await supabase
                    .from('whatsapp_messages')
                    .select('direction, message_text, display_name, created_at')
                    .eq('wa_id', waId)
                    .order('created_at', { ascending: false })
                    .limit(10);
                  const filtered = (pastMessages || []).filter(
                    (m) => !(m.direction === 'inbound' && m.message_text === messageText)
                  ).slice(0, 8);
                  if (filtered.length > 0) {
                    const chronological = [...filtered].reverse();
                    memoryContext = 'Recent Conversation History:\n' + chronological.map((m) =>
                      `${m.direction === 'inbound' ? 'Customer' : `Store Assistant (${m.display_name || 'AI'})`}: "${m.message_text}"`
                    ).join('\n');
                  }
                } catch (err) {
                  console.error('[WhatsApp Webhook] Failed to load conversation history for AI memory:', err);
                }
              }

              // 5. Generate AI Reply or fallback
              let replyText = "";
              let isAiGenerated = false;

              if (aiAutoReply && (process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)) {
                try {
                  const prompt = `
System Instructions:
${aiSystemPrompt}

${catalogContext}

${customerContext}

${memoryContext}

Customer Information:
- Display Name: ${displayName || 'Valued Customer'}
- WhatsApp ID/Phone: ${waId}
${matchedOrderId ? `- Matched Order ID: ${matchedOrderId}` : ''}

New Inbound Customer Message:
"${messageText}"

Reply in the same language the customer used (Spanish or English). If they have an active abandoned cart in context, you may share their recovery link when helpful. Please reply naturally, keeping the tone warm, professional, helpful, and highly scientific yet accessible. 

CRITICAL INSTRUCTION: If the customer asks a question that you do not know the answer to, or if the information is not explicitly provided in the context above, do NOT guess or invent an answer. Instead, politely inform them that you are an AI assistant and tell them to contact our human support directly at +506 8404-6973.

Output ONLY the response text to send back. Do not include any JSON wrapping or markdown preamble. Keep under 1000 characters if possible.
`;

                  if (process.env.OPENAI_API_KEY) {
                    const response = await fetch('https://api.openai.com/v1/chat/completions', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                      },
                      body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'user', content: prompt }],
                      }),
                    });

                    if (response.ok) {
                      const resData = await response.json();
                      const aiText = resData.choices?.[0]?.message?.content;
                      if (aiText) {
                        replyText = aiText.trim();
                        isAiGenerated = true;
                        console.log('[WhatsApp Webhook] ✅ OpenAI generated response successfully!');
                      }
                    } else {
                      const errData = await response.json();
                      console.error('[WhatsApp Webhook] OpenAI API failed with error status:', response.status, errData);
                    }
                  } else {
                    const response = await fetch(
                      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          contents: [
                            { parts: [{ text: prompt }] }
                          ]
                        })
                      }
                    );

                    if (response.ok) {
                      const resData = await response.json();
                      const aiText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
                      if (aiText) {
                        replyText = aiText.trim();
                        isAiGenerated = true;
                        console.log('[WhatsApp Webhook] ✅ Gemini generated response successfully!');
                      }
                    } else {
                      const errData = await response.json();
                      console.error('[WhatsApp Webhook] Gemini API failed with error status:', response.status, errData);
                    }
                  }
                } catch (aiErr) {
                  console.error('[WhatsApp Webhook] Failed to generate AI reply:', aiErr);
                }
              }

              // Fallback if AI reply failed or was disabled
              if (!replyText) {
                const greetingEs = displayName ? `¡Hola ${displayName}!` : '¡Hola!';
                const greetingEn = displayName ? `Hi ${displayName}!` : 'Hi!';
                replyText = matchedOrderId
                  ? `${greetingEs} 👋 Hemos recibido tu pedido. Te contactaremos pronto para coordinar el envío. Para hablar con un agente real, contáctanos al +506 8404-6973. 🚀\n\n${greetingEn} 👋 We've received your order. We'll be in touch shortly to coordinate delivery. For a real agent, contact +506 8404-6973. 🚀`
                  : `${greetingEs} 👋 Gracias por contactarnos. Un agente te responderá pronto. Si es urgente, puedes contactar a un agente real al +506 8404-6973.\n\n${greetingEn} 👋 Thanks for reaching out. An agent will reply shortly. For immediate assistance from a real agent, contact +506 8404-6973.`;
              }

              // Send the reply via WhatsApp Cloud API
              const metaRes = await fetch(
                `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
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
              const metaData = await metaRes.json();

              console.log(`[WhatsApp Webhook] 📤 Auto-reply sent to ${waId}`);

              // Log the outbound reply in Supabase
              if (supabase) {
                const metaMessageId = metaData?.messages?.[0]?.id || null;
                await insertWhatsAppMessage(supabase, {
                  wa_id: waId,
                  display_name: isAiGenerated ? 'AI Copilot' : 'Peptides Costa Rica',
                  message_text: replyText,
                  message_type: 'text',
                  direction: 'outbound',
                  source: 'cloud_api',
                  matched_order_id: matchedOrderId,
                  meta_message_id: metaMessageId,
                  delivery_status: 'sent'
                });
                await upsertWhatsAppConversation(supabase, {
                  waId,
                  displayName: displayName || (isAiGenerated ? 'AI Copilot' : 'Peptides Costa Rica'),
                  direction: 'outbound',
                  source: 'cloud_api',
                  matchedOrderId,
                  metadata: { meta_message_id: metaMessageId },
                });
              }
            } catch (replyErr) {
              console.error('[WhatsApp Webhook] Auto-reply failed:', replyErr);
            }
          }
        }

        // ── Handle message status updates (sent, delivered, read) ──
        const statuses = value?.statuses || [];
        for (const status of statuses) {
          console.log(`[WhatsApp Webhook] 📊 Status: ${status.status} for message ${status.id}`);
          if (supabase && status.id && status.status) {
            // Update the delivery_status for the message
            await supabase
              .from('whatsapp_messages')
              .update({ delivery_status: status.status })
              .eq('meta_message_id', status.id);
          }
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
