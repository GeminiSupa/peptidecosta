import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google's Realtime report headlines "active users in the last 30 minutes".
// Five is the tighter of the two windows it shows, and on a store with a
// couple of dozen visitors an hour it is the shortest window that is not
// almost always zero. The 45-second window this panel used before reported no
// one on a site with nine people reading the catalog.
export const DEFAULT_LIVE_WINDOW_MINUTES = 5;
const MAX_LIVE_WINDOW_MINUTES = 30;
const ROW_LIMIT = 200;

/**
 * Who is on the site right now — and nothing else.
 *
 * The analytics tab already loads visitor sessions, but it loads them once,
 * alongside orders, carts, click events and campaigns, for whatever date range
 * is selected. That payload is far too heavy to poll, so the live panel sat on
 * a snapshot and counted down to zero. This returns one small, already-filtered
 * slice so the panel can refresh itself every few seconds cheaply.
 *
 * The window is applied here rather than in the browser on purpose: an admin
 * laptop with a skewed clock would otherwise filter out live visitors, or
 * invent them.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const minutes = Math.min(
      MAX_LIVE_WINDOW_MINUTES,
      Math.max(1, Number(url.searchParams.get('minutes')) || DEFAULT_LIVE_WINDOW_MINUTES),
    );
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    const { data, error } = await getSupabaseAdmin()
      .from('visitor_sessions')
      .select('session_id, visitor_id, hostname, current_path, page_title, known_customer, customer_name, cart_items, first_touch_source, last_touch_source, utm_source, utm_medium, utm_campaign, city, country, last_active, created_at')
      .gte('last_active', since)
      .order('last_active', { ascending: false })
      .limit(ROW_LIMIT);

    if (error) throw error;

    return NextResponse.json({
      sessions: data || [],
      windowMinutes: minutes,
      since,
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[admin/live-visitors]', error.message);
    return NextResponse.json({ error: 'live_visitors_failed' }, { status: 500 });
  }
}
