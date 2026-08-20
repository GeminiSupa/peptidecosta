import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { sendWAMessage } from '@/lib/waSession';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { claimWhatsAppConversation, normalizeWaId, upsertWhatsAppConversation } from '@/lib/whatsappConversations.mjs';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  // Same gate as the session route: sending from the linked business number is a
  // privileged action — require the wa_session permission, not just any admin.
  const { profile } = auth;
  if (!profile.is_superadmin && !profile.permissions?.includes('wa_session')) {
    return NextResponse.json({ error: 'Forbidden: wa_session access required' }, { status: 403 });
  }

  try {
    const { phone, message, allowColdSend } = await request.json();

    if (!phone || !message) {
      return NextResponse.json({ error: 'phone and message are required' }, { status: 400 });
    }

    const waId = normalizeWaId(phone);
    const supabase = getSupabaseAdmin();
    const ensured = await upsertWhatsAppConversation(supabase, { waId, source: 'baileys_session' });
    if (!ensured.available || ensured.error || !ensured.data) {
      return NextResponse.json({ error: ensured.error?.message || 'WhatsApp conversation routing is unavailable.' }, { status: 503 });
    }
    const conversation = ensured.data;
    if (conversation.source !== 'baileys_session') {
      return NextResponse.json({ error: 'This conversation belongs to the Sales WhatsApp channel.' }, { status: 409 });
    }
    if (conversation.assigned_to && conversation.assigned_to !== profile.user_id && !profile.is_superadmin) {
      return NextResponse.json({
        error: `This conversation belongs to ${conversation.assigned_to_name || conversation.assigned_to_email || 'another agent'}.`,
      }, { status: 409 });
    }
    if (!conversation.assigned_to) {
      const claim = await claimWhatsAppConversation(supabase, {
        conversation,
        profile,
        actorEmail: auth.user.email || profile.email || '',
      });
      if (claim.error) {
        return NextResponse.json({ error: claim.error.message }, { status: claim.conflict ? 409 : 500 });
      }
    }

    // allowColdSend lets an admin deliberately message someone who hasn't messaged
    // first (e.g. an order follow-up). Off by default so the inbox stays inbound-only.
    await sendWAMessage(waId, message, {
      allowColdSend: Boolean(allowColdSend),
      sentBy: profile.name || profile.email || auth.user?.email || auth.user?.id || 'unknown-admin',
    });
    return NextResponse.json({ ok: true, text: 'Message sent successfully.' });
  } catch (err) {
    console.error('[WA Send] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to send message' }, { status: 500 });
  }
}
