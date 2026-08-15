import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  deliverClaimedLeadNotificationJob,
  isLeadNotificationOutboxMissing,
} from '@/lib/leadNotificationDelivery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: jobs, error } = await supabase.rpc('claim_lead_notification_jobs', { p_limit: 10 });
  if (error) {
    if (isLeadNotificationOutboxMissing(error)) {
      return NextResponse.json({
        error: 'Lead notification outbox is not installed',
        migration: 'add-lead-notification-outbox.sql',
      }, { status: 503 });
    }
    console.error('[lead notification cron] claim failed:', error);
    return NextResponse.json({ error: 'Could not claim lead notification jobs' }, { status: 500 });
  }

  const results = [];
  for (const job of jobs || []) {
    try {
      results.push({ jobId: job.id, ...(await deliverClaimedLeadNotificationJob(supabase, job)) });
    } catch (deliveryError) {
      console.error('[lead notification cron] delivery failed:', job.id, deliveryError);
      results.push({ jobId: job.id, status: 'failed_attempt', error: deliveryError.message });
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results });
}
