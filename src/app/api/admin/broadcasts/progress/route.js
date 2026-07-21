import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { computeBroadcastProgress, estimateCompletion } from '@/lib/broadcastProgress.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BROADCASTS = 25;

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();

    const { data: broadcasts, error: broadcastError } = await supabase
      .from('scheduled_broadcasts')
      .select('id, audience, channels, message, status, scheduled_at, created_at, custom_contacts')
      .order('created_at', { ascending: false })
      .limit(MAX_BROADCASTS);

    if (broadcastError) {
      console.error('[admin/broadcasts/progress]', broadcastError.message);
      return NextResponse.json({ error: broadcastError.message }, { status: 500 });
    }

    if (!broadcasts?.length) return NextResponse.json({ ok: true, broadcasts: [] });

    const { data: events, error: eventsError } = await supabase
      .from('marketing_delivery_events')
      .select('broadcast_id, contact_key, channel, status, error, first_attempt_at, last_attempt_at')
      .in('broadcast_id', broadcasts.map((b) => b.id));

    if (eventsError) {
      console.error('[admin/broadcasts/progress]', eventsError.message);
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    const eventsByBroadcast = new Map();
    for (const event of events || []) {
      if (!event?.broadcast_id) continue;
      if (!eventsByBroadcast.has(event.broadcast_id)) eventsByBroadcast.set(event.broadcast_id, []);
      eventsByBroadcast.get(event.broadcast_id).push(event);
    }

    const now = Date.now();
    const rows = broadcasts.map((broadcast) => {
      const broadcastEvents = eventsByBroadcast.get(broadcast.id) || [];
      const progress = computeBroadcastProgress({
        events: broadcastEvents,
        customContacts: broadcast.custom_contacts,
        status: broadcast.status,
      });

      // Only surface failure reasons — a wall of successes is noise.
      const problems = broadcastEvents
        .filter((e) => ['failed', 'suppressed', 'skipped', 'bounced', 'complained'].includes(String(e.status).toLowerCase()))
        .slice(0, 50)
        .map((e) => ({
          contact: e.contact_key,
          channel: e.channel,
          status: e.status,
          reason: e.error || null,
          at: e.last_attempt_at,
        }));

      return {
        id: broadcast.id,
        audience: broadcast.audience,
        channels: broadcast.channels,
        status: broadcast.status,
        scheduledAt: broadcast.scheduled_at,
        createdAt: broadcast.created_at,
        preview: String(broadcast.message || '').slice(0, 120),
        progress,
        estimate: progress.isComplete ? null : estimateCompletion(broadcastEvents, progress.remaining, now),
        problems,
      };
    });

    return NextResponse.json({ ok: true, broadcasts: rows });
  } catch (err) {
    console.error('[admin/broadcasts/progress]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
