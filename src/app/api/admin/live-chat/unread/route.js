import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isMissingLiveChatTable } from '@/lib/liveChat';

export const runtime = 'nodejs';

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requireAnyPermission: ['live_chat'] });
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from('live_chat_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('unread_for_agent', true);

    if (error) throw error;

    return NextResponse.json({ unreadCount: count || 0 });
  } catch (err) {
    if (isMissingLiveChatTable(err)) {
      return NextResponse.json({ unreadCount: 0, error: 'Live chat tables are not installed yet.' }, { status: 409 });
    }
    console.error('[admin/live-chat/unread] GET failed:', err);
    return NextResponse.json({ error: 'Could not load unread count.' }, { status: 500 });
  }
}
