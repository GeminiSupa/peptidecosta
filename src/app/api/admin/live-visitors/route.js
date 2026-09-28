import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Two figures, the way Google's Realtime report shows them: a tight "right
// now" number and a wider one that is still there when the site is quiet. On a
// store with roughly ten visitors an hour, five minutes alone reads zero about
// a third of the time and two minutes reads zero more than half the time, so
// the thirty-minute figure is what stops the panel looking broken. The 45
// seconds this panel used before read zero 82% of the time.
export const LIVE_WINDOW_MINUTES = 5;
export const LIVE_WINDOW_LONG_MINUTES = 30;
const MAX_WINDOW_MINUTES = 60;
const ROW_LIMIT = 500;

const windowMinutes = (raw, fallback) => Math.min(
  MAX_WINDOW_MINUTES,
  Math.max(1, Number(raw) || fallback),
);

/**
 * Who is on the site right now — and nothing else.
 *
 * The analytics tab already loads visitor sessions, but it loads them once,
 * alongside orders, carts, click events and campaigns, for whatever date range
 * is selected. That payload is far too heavy to poll, so the live panel sat on
 * a snapshot and counted down to zero. This returns one small, already-filtered
 * slice so the panel can refresh itself every few seconds cheaply.
 *
 * One query covers both windows: the rows for the wider one are fetched, and
 * each is flagged for the tighter one. Both flags are decided here rather than
 * in the browser, because an admin laptop with a skewed clock would otherwise
 * filter out live visitors, or invent them.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const recentMinutes = windowMinutes(url.searchParams.get('minutes'), LIVE_WINDOW_MINUTES);
    const longMinutes = Math.max(
      recentMinutes,
      windowMinutes(url.searchParams.get('longMinutes'), LIVE_WINDOW_LONG_MINUTES),
    );

    const now = Date.now();
    const since = new Date(now - longMinutes * 60 * 1000).toISOString();
    const recentCutoff = now - recentMinutes * 60 * 1000;

    const { data, error } = await getSupabaseAdmin()
      .from('visitor_sessions')
      .select('session_id, visitor_id, hostname, current_path, page_title, known_customer, customer_name, cart_items, first_touch_source, last_touch_source, utm_source, utm_medium, utm_campaign, city, country, last_active, created_at')
      .gte('last_active', since)
      .order('last_active', { ascending: false })
      .limit(ROW_LIMIT);

    if (error) throw error;

    const sessions = (data || []).map((session) => ({
      ...session,
      active_recent: new Date(session.last_active).getTime() >= recentCutoff,
    }));

    return NextResponse.json({
      sessions,
      recentMinutes,
      longMinutes,
      recentCount: sessions.filter((session) => session.active_recent).length,
      longCount: sessions.length,
      since,
      serverNow: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error('[admin/live-visitors]', error.message);
    return NextResponse.json({ error: 'live_visitors_failed' }, { status: 500 });
  }
}
