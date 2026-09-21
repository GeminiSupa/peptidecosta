import { NextResponse } from 'next/server';

import { purgeExpired } from '@/lib/recycleBinServer';

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
 */
const MAX_PURGE_PER_RUN = 500;

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

  if (!result.ok) {
    console.error('[cron/purge-recycle-bin] failed', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result });
}
