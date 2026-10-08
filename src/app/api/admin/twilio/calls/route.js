import { NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/adminAuth';
import { getTwilioCallLogs } from '@/lib/twilio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/twilio/calls
 * Returns recent Twilio call logs.
 */
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

  const result = await getTwilioCallLogs({ limit });

  if (!result.success) {
    return NextResponse.json({ calls: [], error: result.error }, { status: result.calls ? 200 : 422 });
  }

  return NextResponse.json({ calls: result.calls, count: result.count });
}
