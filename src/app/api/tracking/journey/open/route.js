import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyJourneyTrackingToken } from '@/lib/marketingTokens';

const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('t');
  const payload = verifyJourneyTrackingToken(token);
  if (payload?.journeyId && payload?.contactKey) {
    const eventHash = crypto.createHash('sha256').update(`open:${token}`).digest('hex');
    getSupabaseAdmin().from('journey_engagement_events').upsert({
      event_hash: eventHash,
      journey_id: payload.journeyId,
      enrollment_id: payload.enrollmentId || null,
      broadcast_id: payload.broadcastId || null,
      step_id: payload.stepId || null,
      contact_key: payload.contactKey,
      event_type: 'open',
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      user_agent: request.headers.get('user-agent') || null,
    }, { onConflict: 'event_hash', ignoreDuplicates: true }).then(({ error }) => {
      if (error) console.error('[Journey open tracking]', error);
    });
  }
  return new NextResponse(TRANSPARENT_GIF, { status: 200, headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' } });
}
