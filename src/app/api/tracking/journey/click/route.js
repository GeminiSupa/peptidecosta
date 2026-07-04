import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyJourneyTrackingToken } from '@/lib/marketingTokens';

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get('t');
  const rawTarget = requestUrl.searchParams.get('url');
  const payload = verifyJourneyTrackingToken(token);

  let target;
  try {
    target = new URL(rawTarget);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Invalid protocol');
  } catch {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (payload?.journeyId && payload?.contactKey) {
    target.searchParams.set('utm_source', 'journey');
    target.searchParams.set('utm_medium', 'email');
    target.searchParams.set('utm_campaign', payload.journeyId);
    target.searchParams.set('utm_content', payload.stepId || 'journey_step');
    if (payload.enrollmentId) target.searchParams.set('journey_enrollment', payload.enrollmentId);
    const eventHash = crypto.createHash('sha256').update(`click:${token}:${target.toString()}`).digest('hex');
    getSupabaseAdmin().from('journey_engagement_events').upsert({
      event_hash: eventHash,
      journey_id: payload.journeyId,
      enrollment_id: payload.enrollmentId || null,
      broadcast_id: payload.broadcastId || null,
      step_id: payload.stepId || null,
      contact_key: payload.contactKey,
      event_type: 'click',
      target_url: target.toString(),
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      user_agent: request.headers.get('user-agent') || null,
    }, { onConflict: 'event_hash', ignoreDuplicates: true }).then(({ error }) => {
      if (error) console.error('[Journey click tracking]', error);
    });
  }
  return NextResponse.redirect(target);
}
