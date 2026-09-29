import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getReviewSettings } from '@/lib/reviewSettings.mjs';
import { dailyReviewSeries, DEFAULT_DAILY_WINDOW, summariseReviewAsks } from '@/lib/reviewStats.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the review requests have actually done.
 *
 * Until now none of this was knowable: clicks were never recorded, so the only
 * measure of the review system was whether emails left the building. The
 * numbers here are the first real feedback on it.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const settings = await getReviewSettings(supabase);

    // Newest first and capped: this is a dashboard, not an export. At the
    // current rate the cap is years of history.
    const { data, error } = await supabase
      .from('review_asks')
      .select('customer_email, platforms, clicked_platform, clicked_at, asked_at, order_number')
      .order('asked_at', { ascending: false })
      .limit(5000);

    if (error) {
      // The table arrives via add-review-asks.sql. Say so plainly rather than
      // showing zeroes, which would read as "nobody ever clicked".
      return NextResponse.json({
        available: false,
        reason: 'The review history table does not exist yet. Run add-review-asks.sql.',
      });
    }

    const now = Date.now();
    const summary = summariseReviewAsks(data || [], {
      maxAsksWithoutClick: settings.maxAsksWithoutClick,
      now,
    });

    // The window is a query parameter so the same endpoint can feed the small
    // chart on the Social Reviews tab and a longer one on Analytics, rather
    // than two routes drifting into two different definitions of "a day".
    const requestedDays = Number(new URL(request.url).searchParams.get('days'));
    const days = Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.min(Math.floor(requestedDays), 180)
      : DEFAULT_DAILY_WINDOW;

    return NextResponse.json({
      available: true,
      ...summary,
      daily: dailyReviewSeries(data || [], { days, now }),
      dailyWindowDays: days,
      trustpilotCap: settings.trustpilotMonthlyCap,
    });
  } catch (err) {
    console.error('[admin/reviews/stats]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
