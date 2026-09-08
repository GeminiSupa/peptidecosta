import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { computeBroadcastProgress, estimateCompletion } from '@/lib/broadcastProgress.mjs';
import {
  writeDroppingMissingColumns, BROADCAST_PACING_COLUMNS, BROADCAST_WINDOW_COLUMNS,
} from '@/lib/optionalColumns.mjs';
import { MAX_BATCH_SIZE, MAX_DELAY_SECONDS } from '@/lib/broadcastPacing.mjs';

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
      .select('*')
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
        // The current speed, so the panel can show it and let it be changed
        // without stopping the broadcast. Absent until the pacing migrations
        // are run, which the form treats as the built-in default.
        whatsapp_batch_size: broadcast.whatsapp_batch_size ?? null,
        whatsapp_batch_delay_seconds: broadcast.whatsapp_batch_delay_seconds ?? null,
        email_batch_size: broadcast.email_batch_size ?? null,
        email_batch_delay_seconds: broadcast.email_batch_delay_seconds ?? null,
        send_window_start_hour: broadcast.send_window_start_hour ?? null,
        send_window_end_hour: broadcast.send_window_end_hour ?? null,
      };
    });

    return NextResponse.json({ ok: true, broadcasts: rows });
  } catch (err) {
    console.error('[admin/broadcasts/progress]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { id, action, pacing } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Broadcast id is required' }, { status: 400 });
    }
    if (!['cancel', 'send_now', 'update_pacing'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported broadcast action' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Change how fast a broadcast that is already running goes out. The speed
    // that felt right when queuing 1,500 marketing messages often does not an
    // hour later, and the alternative — stop and rebuild — re-sends to everyone
    // already messaged.
    if (action === 'update_pacing') {
      const patch = {};
      const setIf = (key, value, min, max) => {
        if (value === null || value === undefined || value === '') return;
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n)) return;
        patch[key] = Math.min(max, Math.max(min, n));
      };
      setIf('whatsapp_batch_size', pacing?.whatsappBatchSize, 1, MAX_BATCH_SIZE);
      setIf('whatsapp_batch_delay_seconds', pacing?.whatsappDelaySeconds, 0, MAX_DELAY_SECONDS);
      setIf('email_batch_size', pacing?.emailBatchSize, 1, MAX_BATCH_SIZE);
      setIf('email_batch_delay_seconds', pacing?.emailDelaySeconds, 0, MAX_DELAY_SECONDS);
      setIf('send_window_start_hour', pacing?.windowStartHour, 0, 24);
      setIf('send_window_end_hour', pacing?.windowEndHour, 0, 24);

      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
      }

      // A slower speed must apply from the NEXT batch, not retroactively: the
      // stamp already on the row was written against the old delay.
      patch.whatsapp_next_at = null;
      patch.email_next_at = null;

      const { data: updated, error: updateError } = await writeDroppingMissingColumns(
        patch,
        [...BROADCAST_PACING_COLUMNS, ...BROADCAST_WINDOW_COLUMNS],
        (row) => supabase
          .from('scheduled_broadcasts')
          .update(row)
          .eq('id', id)
          .in('status', ['pending', 'processing'])
          .select('id, status, whatsapp_batch_size, whatsapp_batch_delay_seconds, send_window_start_hour, send_window_end_hour')
          .maybeSingle(),
      );
      if (updateError) {
        console.error('[admin/broadcasts/progress/update_pacing]', updateError.message);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      if (!updated) {
        return NextResponse.json({ error: 'Broadcast is already finished or was not found' }, { status: 409 });
      }
      return NextResponse.json({ ok: true, broadcast: updated });
    }

    // Release a broadcast that is waiting — for its quiet hours, or for the
    // gap between batches. Stopping and rebuilding it was the only way to send
    // held work immediately, which loses the recipients already sent to and
    // risks messaging them twice.
    if (action === 'send_now') {
      const now = new Date().toISOString();
      const { data: released, error: releaseError } = await writeDroppingMissingColumns(
        {
          status: 'pending',
          scheduled_at: now,
          send_window_start_hour: null,
          send_window_end_hour: null,
          email_next_at: null,
          whatsapp_next_at: null,
        },
        [...BROADCAST_PACING_COLUMNS, ...BROADCAST_WINDOW_COLUMNS],
        (row) => supabase
          .from('scheduled_broadcasts')
          .update(row)
          .eq('id', id)
          .in('status', ['pending', 'processing'])
          .select('id, status')
          .maybeSingle(),
      );
      if (releaseError) {
        console.error('[admin/broadcasts/progress/send_now]', releaseError.message);
        return NextResponse.json({ error: releaseError.message }, { status: 500 });
      }
      if (!released) {
        return NextResponse.json({ error: 'Broadcast is already finished or was not found' }, { status: 409 });
      }

      // Nudge the processor rather than waiting up to five minutes for the cron.
      const host = request.headers.get('host') || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      fetch(`${protocol}://${host}/api/cron/process-broadcasts`, {
        method: 'GET',
        headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
      }).catch(() => {});

      return NextResponse.json({ ok: true, broadcast: released });
    }
    const { data, error } = await supabase
      .from('scheduled_broadcasts')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .in('status', ['pending', 'processing'])
      .select('id, status')
      .maybeSingle();

    if (error) {
      console.error('[admin/broadcasts/progress/cancel]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Broadcast is already finished or was not found' }, { status: 409 });
    }

    await supabase
      .from('deals')
      .update({ announcement_status: 'cancelled' })
      .eq('broadcast_id', id);

    return NextResponse.json({ ok: true, broadcast: data });
  } catch (err) {
    console.error('[admin/broadcasts/progress/cancel]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
