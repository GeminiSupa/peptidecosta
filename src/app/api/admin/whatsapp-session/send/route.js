import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { sendWAMessage } from '@/lib/waSession';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { phone, message } = await request.json();

    if (!phone || !message) {
      return NextResponse.json({ error: 'phone and message are required' }, { status: 400 });
    }

    await sendWAMessage(phone, message);
    return NextResponse.json({ ok: true, text: 'Message sent successfully.' });
  } catch (err) {
    console.error('[WA Send] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to send message' }, { status: 500 });
  }
}
