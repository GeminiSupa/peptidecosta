import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { sendWAMessage } from '@/lib/waSession';

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

    // allowColdSend lets an admin deliberately message someone who hasn't messaged
    // first (e.g. an order follow-up). Off by default so the inbox stays inbound-only.
    await sendWAMessage(phone, message, {
      allowColdSend: Boolean(allowColdSend),
      sentBy: auth.user?.email || auth.user?.id || 'unknown-admin',
    });
    return NextResponse.json({ ok: true, text: 'Message sent successfully.' });
  } catch (err) {
    console.error('[WA Send] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to send message' }, { status: 500 });
  }
}
