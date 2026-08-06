import { cleanPhoneNumber } from '@/lib/whatsapp';
import { insertWhatsAppMessage } from '@/lib/whatsappMessageLog';
import { upsertWhatsAppConversation } from '@/lib/whatsappConversations.mjs';

/**
 * One outbound WhatsApp send, shared by the admin route and the crons.
 *
 * The abandoned-cart cron used to reach this logic by POSTing to
 * /api/whatsapp/send over HTTP. That route is admin-only, so every cron send
 * came back 401 and the cron — which only counts `res.ok` — recorded it as
 * "nothing to do". Recovery messages had not gone out at all. Server code now
 * calls this directly and never crosses the network to talk to itself.
 */
export async function sendWhatsAppMessage({
  to,
  message,
  mediaUrl = null,
  customerName = null,
  orderId = null,
  sessionId = null,
  supabase = null,
}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.warn('[WhatsApp Outbound] Meta WhatsApp Cloud API credentials are not configured.');
    return { ok: false, status: 500, error: 'Meta WhatsApp credentials (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID) are not configured on the server.' };
  }

  if (!to || (!message && !mediaUrl)) {
    return { ok: false, status: 400, error: 'Missing required parameters: "to" and either "message" or "mediaUrl" are required' };
  }

  const cleanPhone = cleanPhoneNumber(to);

  if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
    return {
      ok: false,
      status: 400,
      error: `Invalid phone number: "${to}". WhatsApp numbers must be between 8 and 15 digits, including the country code (e.g. 50660626224 or 60626224).`,
    };
  }

  const metaPayload = { messaging_product: 'whatsapp', to: cleanPhone };

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

  console.log(`[WhatsApp Outbound] Sending message to ${cleanPhone} via Meta API...`);

  const metaResponse = await fetch(
    `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metaPayload),
    }
  );

  const metaData = await metaResponse.json().catch(() => ({}));

  if (!metaResponse.ok) {
    console.error('[WhatsApp Outbound] Meta API returned an error:', metaData);
    return {
      ok: false,
      status: metaResponse.status,
      error: metaData?.error?.message || 'Meta API delivery failed',
    };
  }

  const messageId = metaData?.messages?.[0]?.id || null;
  console.log('[WhatsApp Outbound] Meta API delivery successful:', messageId);

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

      const { error: logErr } = await insertWhatsAppMessage(supabase, {
        wa_id: cleanPhone,
        display_name: cleanDisplayName,
        message_text: message || '',
        media_url: mediaUrl || null,
        message_type: mediaUrl ? 'image' : 'text',
        direction: 'outbound',
        source: 'cloud_api',
        matched_order_id: orderId || null,
        raw_payload: metaData,
        meta_message_id: messageId,
        delivery_status: 'sent',
      });

      if (logErr) {
        console.error('[WhatsApp Outbound] Failed to log outbound message in DB:', logErr);
      } else {
        console.log('[WhatsApp Outbound] Successfully logged outbound message to DB');
      }

      if (sessionId) {
        const { error: cartErr } = await supabase
          .from('abandoned_carts')
          .update({
            recovery_whatsapp_sent: true,
            recovery_whatsapp_sent_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId);

        if (cartErr) {
          console.error('[WhatsApp Outbound] Failed to update abandoned cart status in DB:', cartErr);
        } else {
          console.log(`[WhatsApp Outbound] Successfully updated abandoned cart status for session ${sessionId}`);
        }
      }

      const { error: conversationErr } = await upsertWhatsAppConversation(supabase, {
        waId: cleanPhone,
        displayName: cleanDisplayName,
        direction: 'outbound',
        matchedOrderId: orderId || null,
        source: 'cloud_api',
        metadata: {
          session_id: sessionId || null,
          meta_message_id: messageId,
        },
      });

      if (conversationErr) {
        console.error('[WhatsApp Outbound] Failed to update conversation routing:', conversationErr);
      }
    } catch (dbCrash) {
      console.error('[WhatsApp Outbound] Unexpected crash during CRM DB logging:', dbCrash);
    }
  }

  return { ok: true, status: 200, messageId, cleanPhone };
}
