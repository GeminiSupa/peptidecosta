import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isLeadNotificationOutboxMissing,
  processLeadNotificationJob,
} from '@/lib/leadNotificationDelivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailable(error) {
  if (!isLeadNotificationOutboxMissing(error)) return null;
  return NextResponse.json({
    available: false,
    jobs: [],
    migration: 'add-lead-notification-outbox.sql',
  });
}
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const ids = [...new Set(
    String(new URL(request.url).searchParams.get('leadIds') || '')
      .split(',').map((value) => value.trim()).filter((value) => UUID_RE.test(value))
  )].slice(0, 100);
  if (!ids.length) return NextResponse.json({ available: true, jobs: [] });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('lead_notification_jobs')
    .select('id,lead_id,enquiry_at,source,status,attempt_count,max_attempts,next_attempt_at,last_error,created_at,updated_at,lead_notification_deliveries(channel,destination,status,attempt_count,error_message,last_attempt_at,sent_at)')
    .in('lead_id', ids)
    .order('enquiry_at', { ascending: false });
  if (error) {
    const missing = unavailable(error);
    if (missing) return missing;
    console.error('[admin/lead-notifications GET]', error);
    return NextResponse.json({ error: 'Could not load notification delivery status' }, { status: 500 });
  }

  // The UI needs only the newest enquiry job for each lead row.
  const newest = [];
  const seen = new Set();
  for (const job of data || []) {
    if (seen.has(job.lead_id)) continue;
    seen.add(job.lead_id);
    newest.push(job);
  }
  return NextResponse.json({ available: true, jobs: newest });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  if (!auth.profile?.is_superadmin) {
    return NextResponse.json({ error: 'Only a superadmin can retry staff notifications' }, { status: 403 });
  }

  const body = await request.json();
  const jobId = String(body.jobId || '').trim();
  if (!UUID_RE.test(jobId)) return NextResponse.json({ error: 'A valid jobId is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: job, error: loadError } = await supabase
    .from('lead_notification_jobs').select('*').eq('id', jobId).maybeSingle();
  if (loadError) {
    const missing = unavailable(loadError);
    if (missing) return missing;
    throw loadError;
  }
  if (!job) return NextResponse.json({ error: 'Notification job not found' }, { status: 404 });

  const { error: resetError } = await supabase.from('lead_notification_jobs').update({
    status: 'pending',
    attempt_count: 0,
    next_attempt_at: new Date().toISOString(),
    locked_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 });

  try {
    const result = await processLeadNotificationJob(supabase, jobId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error('[admin/lead-notifications POST]', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Retry was queued but the immediate attempt failed',
    }, { status: 502 });
  }
}
