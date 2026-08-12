import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/lib/adminAuth';
import { sendWhatsAppMessage } from '@/lib/whatsappOutbound';

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
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { to, message, customerName, orderId, sessionId, mediaUrl, channelId } = await request.json();

    const result = await sendWhatsAppMessage({
      to,
      message,
      mediaUrl,
      customerName,
      orderId,
      sessionId,
      channelId,
      supabase,
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
