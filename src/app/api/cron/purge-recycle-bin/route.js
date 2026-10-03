import { NextResponse } from 'next/server';

import { purgeExpired } from '@/lib/recycleBinServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ADMIN_ACTIVITY_RETENTION_DAYS, purgeOldActivity } from '@/lib/adminActivityLog.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel limit

/**
 * Erase Bin entries past the retention a superadmin set.
 *
 * Runs once a day. Capped per run so a Bin that has been left to grow is
 * cleared over several nights rather than in one statement that times out and
 * clears nothing — the pattern every other cron here follows.
 *
 * This is the only scheduled job in the app that destroys data, so it does
 * nothing at all unless the retention setting says to: `purgeExpired` reads
 * that first and returns early when it is set to never.
 *
 * It also trims the activity log, which has its own fixed retention and no
 * setting — the two are here together because "delete what is past its keep-by"
 * is one job, and a second nightly cron doing the same kind of work is a second
 * place to look when something is not being cleared.
 */
const MAX_PURGE_PER_RUN = 500;
// The log holds far more rows than the Bin and they are small, so it is capped
// higher — but still capped, for the same reason.
const MAX_ACTIVITY_PURGE_PER_RUN = 5000;

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    request.headers.get('x-vercel-cron') !== '1'
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await purgeExpired({ limit: MAX_PURGE_PER_RUN });

  // Independent of the Bin: a failure there must not leave the activity log
  // growing for ever, and a failure here must not stop the Bin being cleared.
  const activity = await purgeOldActivity(getSupabaseAdmin(), { limit: MAX_ACTIVITY_PURGE_PER_RUN });
  if (!activity.ok) console.error('[cron/purge-recycle-bin] activity log purge failed', activity.error);

  if (!result.ok) {
    console.error('[cron/purge-recycle-bin] failed', result.error);
    return NextResponse.json({ error: result.error, activityLog: activity }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    ...result,
    activityLog: { ...activity, retentionDays: ADMIN_ACTIVITY_RETENTION_DAYS },
  });
}
