import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getReviewSettings } from '@/lib/reviewSettings.mjs';
import { summariseReviewAsks } from '@/lib/reviewStats.mjs';

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

    const summary = summariseReviewAsks(data || [], {
      maxAsksWithoutClick: settings.maxAsksWithoutClick,
      now: Date.now(),
    });

    return NextResponse.json({
      available: true,
      ...summary,
      trustpilotCap: settings.trustpilotMonthlyCap,
    });
  } catch (err) {
    console.error('[admin/reviews/stats]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
