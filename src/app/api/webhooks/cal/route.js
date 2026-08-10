import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isProspectsTableMissing } from '@/lib/prospects.mjs';
import { normalizeCalBooking, prospectUpdatesForBooking } from '@/lib/prospectOutreach.mjs';

export const dynamic = 'force-dynamic';

/**
 * Cal.com signs each delivery with HMAC-SHA256 over the raw body. The body is
 * read as text and only then parsed, because re-serializing parsed JSON would
 * change the bytes and break every signature.
 */
function signatureMatches(rawBody, suppliedSignature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const supplied = String(suppliedSignature || '').trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

async function findProspect(supabase, booking) {
  if (booking.prospectToken) {
    const { data } = await supabase
      .from('sales_prospects')
      .select('id, status')
      .eq('booking_token', booking.prospectToken)
      .maybeSingle();
    if (data) return data;
  }

  // Booking links get forwarded internally, so the token can go missing on a
  // real booking. Email is the weaker match but recovers most of those.
  if (booking.attendeeEmail) {
    const { data } = await supabase
      .from('sales_prospects')
      .select('id, status')
      .eq('email', booking.attendeeEmail)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

export async function POST(request) {
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cal.com webhook is not configured' }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get('x-cal-signature-256');
  if (!signature || !signatureMatches(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const booking = normalizeCalBooking(JSON.parse(rawBody));
    // Cal.com fires triggers we do not model (MEETING_ENDED, FORM_SUBMITTED).
    // Acknowledging them keeps Cal.com from retrying a delivery forever.
    if (!booking) return NextResponse.json({ success: true, ignored: true });

    const supabase = getSupabaseAdmin();
    const prospect = await findProspect(supabase, booking);

    const { error: meetingError } = await supabase
      .from('prospect_meetings')
      .upsert({
        prospect_id: prospect?.id || null,
        provider: 'cal_com',
        provider_event_id: booking.providerEventId,
        title: booking.title,
        starts_at: booking.startsAt,
        ends_at: booking.endsAt,
        attendee_name: booking.attendeeName,
        attendee_email: booking.attendeeEmail,
        meeting_url: booking.meetingUrl,
        status: booking.status,
        raw_payload: JSON.parse(rawBody),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider,provider_event_id' });

    if (isProspectsTableMissing(meetingError)) {
      return NextResponse.json({ error: 'Run prospect-outreach-migration.sql first.' }, { status: 503 });
    }
    if (meetingError) throw meetingError;

    let prospectUpdated = false;
    if (prospect) {
      const updates = prospectUpdatesForBooking(booking, prospect.status);
      if (updates) {
        const { error: updateError } = await supabase
          .from('sales_prospects')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', prospect.id);
        if (updateError) throw updateError;
        prospectUpdated = true;
      }
    }

    return NextResponse.json({
      success: true,
      status: booking.status,
      matched: Boolean(prospect),
      prospectUpdated,
    });
  } catch (err) {
    console.error('[Cal webhook]', err);
    return NextResponse.json({ error: 'Unable to process booking' }, { status: 500 });
  }
}
