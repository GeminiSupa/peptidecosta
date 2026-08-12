import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { insertWhatsAppMessage } from '@/lib/whatsappMessageLog';
import { isWhatsAppSuppressed } from '@/lib/whatsappCompliance';
import { upsertWhatsAppConversation } from '@/lib/whatsappConversations.mjs';
import { resolveOutboundWhatsAppChannel } from '@/lib/whatsappChannels.mjs';
import {
  buildWhatsAppTemplateComponents,
  getWhatsAppTemplateDefinition,
  renderWhatsAppTemplateBody,
} from '@/lib/whatsappTemplates.mjs';

export const runtime = 'nodejs';

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['whatsapp_ai'] });
  if (auth.error) return auth.error;

  try {
    const {
      to,
      templateId,
      values = {},
      customerName = null,
      orderId = null,
      sessionId = null,
      channelId = null,
    } = await request.json();
    const template = getWhatsAppTemplateDefinition(templateId);
    if (!template) return jsonError('Choose an approved WhatsApp template.', 400);

    const cleanPhone = cleanPhoneNumber(to);
    if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
      return jsonError('A valid WhatsApp phone number is required.', 400);
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const supabase = getSupabaseAdmin();
    const outboundChannel = await resolveOutboundWhatsAppChannel(supabase, { channelId });
    const phoneNumberId = outboundChannel.phoneNumberId;
    if (!accessToken || !phoneNumberId) {
      return jsonError('Meta WhatsApp credentials are not configured on the server.', 500);
    }
    if (await isWhatsAppSuppressed(supabase, cleanPhone)) {
      return jsonError('This customer has opted out of WhatsApp messages.', 409);
    }

    const missingVariables = (template.variables || []).filter((variable) => {
      const resolved = values[variable.key] || variable.fallback;
      return !String(resolved || '').trim();
    });
    if (missingVariables.length > 0) {
      return jsonError(`Missing template field: ${missingVariables[0].label}`, 400);
    }

    const components = buildWhatsAppTemplateComponents(template, values);
    const metaPayload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        ...(components.length ? { components } : {}),
      },
    };

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
      console.error('[admin/whatsapp-template] Meta API returned an error:', metaData);
      return jsonError(metaData?.error?.message || 'Meta API delivery failed', metaResponse.status);
    }

    const messageId = metaData?.messages?.[0]?.id || null;
    const messageText = renderWhatsAppTemplateBody(template, values);
    const displayName = String(customerName || values.customerName || 'Peptides Customer').trim();

    const { error: logErr } = await insertWhatsAppMessage(supabase, {
      wa_id: cleanPhone,
      display_name: displayName || 'Peptides Customer',
      message_text: messageText,
      message_type: 'template',
      direction: 'outbound',
      source: 'cloud_api',
      channel_id: outboundChannel.channelId,
      matched_order_id: orderId || null,
      raw_payload: {
        ...metaData,
        template: {
          id: template.id,
          name: template.name,
          language: template.language,
          category: template.category,
        },
      },
      meta_message_id: messageId,
      delivery_status: 'sent',
    });
    if (logErr) {
      console.error('[admin/whatsapp-template] Failed to log template message:', logErr);
    }

    const { error: conversationErr } = await upsertWhatsAppConversation(supabase, {
      waId: cleanPhone,
      displayName: displayName || null,
      direction: 'outbound',
      matchedOrderId: orderId || null,
      source: 'cloud_api',
      channelId: outboundChannel.channelId,
      metadata: {
        session_id: sessionId || null,
        meta_message_id: messageId,
        template_id: template.id,
      },
    });
    if (conversationErr) {
      console.error('[admin/whatsapp-template] Failed to update conversation routing:', conversationErr);
    }

    return NextResponse.json({
      success: true,
      messageId,
      template: {
        id: template.id,
        name: template.name,
        language: template.language,
      },
      messageText,
      channelId: outboundChannel.channelId,
      phoneNumberId,
    });
  } catch (err) {
    console.error('[admin/whatsapp-template] Unexpected crash:', err);
    return jsonError(err.message || 'Internal Server Error', 500);
  }
}
