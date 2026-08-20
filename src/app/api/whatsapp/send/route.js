import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/lib/adminAuth';
import { sendWhatsAppMessage } from '@/lib/whatsappOutbound';
import {
  claimWhatsAppConversation,
  normalizeWaId,
  upsertWhatsAppConversation,
} from '@/lib/whatsappConversations.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && (supabaseServiceKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)
  : null;

/**
 * Admin-triggered WhatsApp send. The sending itself lives in
 * @/lib/whatsappOutbound so server-side callers (the crons) can reach it
 * without going through this route's admin session check.
 */
export async function POST(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['whatsapp_ai', 'wa_session'] });
  if (auth.error) return auth.error;

  try {
    const { to, message, customerName, orderId, sessionId, mediaUrl, channelId } = await request.json();
    const waId = normalizeWaId(to);
    if (!waId) return NextResponse.json({ error: 'A valid WhatsApp recipient is required.' }, { status: 400 });
    if (!String(message || '').trim() && !String(mediaUrl || '').trim()) {
      return NextResponse.json({ error: 'Enter a message or attach an image.' }, { status: 400 });
    }

    const ensured = await upsertWhatsAppConversation(supabase, { waId, source: 'cloud_api', channelId });
    if (!ensured.available || ensured.error || !ensured.data) {
      return NextResponse.json({
        error: ensured.error?.message || 'WhatsApp conversation routing is unavailable.',
      }, { status: 503 });
    }

    const conversation = ensured.data;
    if (conversation.assigned_to && conversation.assigned_to !== auth.profile.user_id && !auth.profile.is_superadmin) {
      return NextResponse.json({
        error: `This conversation belongs to ${conversation.assigned_to_name || conversation.assigned_to_email || 'another agent'}.`,
      }, { status: 409 });
    }
    if (!conversation.assigned_to) {
      const claim = await claimWhatsAppConversation(supabase, {
        conversation,
        profile: auth.profile,
        actorEmail: auth.user.email || auth.profile.email || '',
      });
      if (claim.error) {
        return NextResponse.json({ error: claim.error.message }, { status: claim.conflict ? 409 : 500 });
      }
    }

    const result = await sendWhatsAppMessage({
      to: waId,
      message,
      mediaUrl,
      customerName,
      orderId,
      sessionId,
      channelId,
      supabase,
      isHumanOutbound: true,
      senderName: auth.profile.name || auth.profile.email || auth.user.email || 'Sales agent',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      channelId: result.channelId,
      phoneNumberId: result.phoneNumberId,
    });
  } catch (err) {
    console.error('[WhatsApp Outbound] Unexpected crash in POST send handler:', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
