import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  PROSPECT_ENRICHMENT_MAX_ATTEMPTS,
  PROSPECT_ENRICHMENT_STALE_MS,
  enrichmentFailureState,
  isProspectEnrichmentJobsTableMissing,
} from '@/lib/prospectEnrichmentJobs.mjs';

export const dynamic = 'force-dynamic';

const MAX_BATCH = 100;
const JOB_FIELDS = [
  'id', 'prospect_id', 'status', 'attempts', 'max_attempts', 'result_payload',
  'last_error', 'next_attempt_at', 'locked_at', 'locked_by', 'requested_by',
  'started_at', 'completed_at', 'created_at', 'updated_at',
].join(',');
const JOB_PROSPECT_FIELDS = [
  'id', 'organization_name', 'website_url', 'email', 'phone', 'contact_source_url',
  'enriched_at', 'people', 'linkedin_urls', 'whatsapp_numbers',
  'contact_permission_status',
  'email_permission_status', 'email_permission_basis', 'email_permission_source_url',
  'email_permission_evidence',
  'whatsapp_permission_status', 'whatsapp_permission_basis', 'whatsapp_permission_source_url',
  'whatsapp_permission_evidence',
].join(',');
const ACTIVE_JOB_FIELDS = `${JOB_FIELDS},prospect:sales_prospects(${JOB_PROSPECT_FIELDS})`;
const ACTIVE_JOB_LIMIT = 100;

const setupRequired = () => NextResponse.json({
  error: 'Run add-prospect-enrichment-jobs.sql first.',
  setupRequired: true,
  migration: 'add-prospect-enrichment-jobs.sql',
}, { status: 503 });

const cleanWorkerId = (value) => String(value || '').trim().slice(0, 120);

async function recoverInterruptedJobs(supabase) {
  const cutoff = new Date(Date.now() - PROSPECT_ENRICHMENT_STALE_MS).toISOString();
  const { data, error } = await supabase
    .from('prospect_enrichment_jobs')
    .select(JOB_FIELDS)
    .eq('status', 'running')
    .lt('locked_at', cutoff)
    .limit(100);
  if (error) throw error;

  for (const job of data || []) {
    const exhausted = Number(job.attempts) >= Number(job.max_attempts);
    await supabase
      .from('prospect_enrichment_jobs')
      .update({
        status: exhausted ? 'failed' : 'queued',
        last_error: 'Previous scan was interrupted before completion',
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        completed_at: exhausted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'running')
      .eq('locked_by', job.locked_by);
  }
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;
  const supabase = getSupabaseAdmin();

  try {
    await recoverInterruptedJobs(supabase);
    const { data, error } = await supabase
      .from('prospect_enrichment_jobs')
      // The browser worker only needs work that can still run. Returning every
      // completed job repeatedly let terminal rows crowd queued work out of the
      // old 500-row window and retransmitted their checkpoint payloads forever.
      .select(ACTIVE_JOB_FIELDS)
      .in('status', ['queued', 'running'])
      .order('next_attempt_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(ACTIVE_JOB_LIMIT);
    if (error) throw error;
    return NextResponse.json({ jobs: data || [], setupRequired: false });
  } catch (error) {
    if (isProspectEnrichmentJobsTableMissing(error)) return setupRequired();
    console.error('[Prospector Jobs] Load failed:', error.message);
    return NextResponse.json({ error: 'Unable to load enrichment jobs' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const prospectIds = [...new Set(
    (Array.isArray(body.prospectIds) ? body.prospectIds : [body.prospectId])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];
  if (!prospectIds.length) return NextResponse.json({ error: 'Choose at least one saved prospect' }, { status: 400 });
  if (prospectIds.length > MAX_BATCH) {
    return NextResponse.json({ error: `Queue at most ${MAX_BATCH} prospects at once` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: prospects, error: prospectError } = await supabase
    .from('sales_prospects')
    .select('id,website_url')
    .in('id', prospectIds);
  if (prospectError) return NextResponse.json({ error: 'Unable to verify prospects' }, { status: 500 });

  const withWebsite = (prospects || []).filter((prospect) => prospect.website_url);
  if (!withWebsite.length) {
    return NextResponse.json({ jobs: [], queued: 0, skipped: prospectIds.length });
  }

  const { data: existing, error: existingError } = await supabase
    .from('prospect_enrichment_jobs')
    .select(JOB_FIELDS)
    .in('prospect_id', withWebsite.map((prospect) => prospect.id));
  if (isProspectEnrichmentJobsTableMissing(existingError)) return setupRequired();
  if (existingError) return NextResponse.json({ error: 'Unable to inspect enrichment queue' }, { status: 500 });

  const existingByProspect = new Map((existing || []).map((job) => [job.prospect_id, job]));
  const now = new Date().toISOString();
  const jobs = [];
  for (const prospect of withWebsite) {
    const current = existingByProspect.get(prospect.id);
    if (current && ['queued', 'running'].includes(current.status)) {
      jobs.push(current);
      continue;
    }

    const reset = {
      status: 'queued',
      attempts: 0,
      max_attempts: PROSPECT_ENRICHMENT_MAX_ATTEMPTS,
      result_payload: null,
      last_error: null,
      next_attempt_at: now,
      locked_at: null,
      locked_by: null,
      requested_by: auth.user.id,
      started_at: null,
      completed_at: null,
      updated_at: now,
    };
    const query = current
      ? supabase.from('prospect_enrichment_jobs').update(reset).eq('id', current.id).in('status', ['succeeded', 'failed', 'cancelled'])
      : supabase.from('prospect_enrichment_jobs').insert({ prospect_id: prospect.id, ...reset });
    const { data: job, error } = await query.select(JOB_FIELDS).maybeSingle();
    if (!error && job) {
      jobs.push(job);
      continue;
    }
    // The unique prospect constraint is the duplicate guard. If another tab
    // won the race, return its job instead of creating or resetting a second.
    if (error?.code === '23505' || !job) {
      const concurrent = await supabase
        .from('prospect_enrichment_jobs')
        .select(JOB_FIELDS)
        .eq('prospect_id', prospect.id)
        .single();
      if (!concurrent.error && concurrent.data) jobs.push(concurrent.data);
      continue;
    }
    console.error('[Prospector Jobs] Queue failed:', error.message);
  }

  return NextResponse.json({
    jobs,
    queued: jobs.filter((job) => job.status === 'queued').length,
    skipped: prospectIds.length - withWebsite.length,
  });
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const jobId = String(body.jobId || '').trim();
  const action = String(body.action || '').trim();
  const workerId = cleanWorkerId(body.workerId);
  if (!jobId) return NextResponse.json({ error: 'Enrichment job is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: current, error: currentError } = await supabase
    .from('prospect_enrichment_jobs')
    .select(JOB_FIELDS)
    .eq('id', jobId)
    .maybeSingle();
  if (isProspectEnrichmentJobsTableMissing(currentError)) return setupRequired();
  if (currentError) return NextResponse.json({ error: 'Unable to load enrichment job' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Enrichment job not found' }, { status: 404 });

  if (action === 'claim') {
    if (!workerId) return NextResponse.json({ error: 'Worker identity is required' }, { status: 400 });
    const waitMs = new Date(current.next_attempt_at || 0).getTime() - Date.now();
    if (current.status !== 'queued' || waitMs > 0 || Number(current.attempts) >= Number(current.max_attempts)) {
      return NextResponse.json({ error: 'Job is not ready to claim', job: current, retryAfterMs: Math.max(0, waitMs) }, { status: 409 });
    }
    const now = new Date().toISOString();
    const { data: claimed, error } = await supabase
      .from('prospect_enrichment_jobs')
      .update({
        status: 'running',
        attempts: Number(current.attempts) + 1,
        locked_at: now,
        locked_by: workerId,
        started_at: current.started_at || now,
        updated_at: now,
      })
      .eq('id', jobId)
      .eq('status', 'queued')
      .eq('attempts', current.attempts)
      .select(JOB_FIELDS)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to claim enrichment job' }, { status: 500 });
    if (!claimed) return NextResponse.json({ error: 'Another worker claimed this job', conflict: true }, { status: 409 });
    return NextResponse.json({ job: claimed });
  }

  if (!workerId || current.status !== 'running' || current.locked_by !== workerId) {
    return NextResponse.json({ error: 'This worker no longer owns the job', conflict: true, job: current }, { status: 409 });
  }

  if (action === 'checkpoint') {
    const serialized = JSON.stringify(body.result || null);
    if (serialized.length > 1_000_000) return NextResponse.json({ error: 'Enrichment result is too large' }, { status: 413 });
    const { data, error } = await supabase
      .from('prospect_enrichment_jobs')
      .update({ result_payload: body.result || {}, updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'running')
      .eq('locked_by', workerId)
      .select(JOB_FIELDS)
      .single();
    if (error) return NextResponse.json({ error: 'Unable to preserve enrichment result' }, { status: 500 });
    return NextResponse.json({ job: data });
  }

  if (action === 'complete') {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('prospect_enrichment_jobs')
      .update({
        status: 'succeeded',
        last_error: null,
        next_attempt_at: now,
        locked_at: null,
        locked_by: null,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', jobId)
      .eq('status', 'running')
      .eq('locked_by', workerId)
      .select(JOB_FIELDS)
      .single();
    if (error) return NextResponse.json({ error: 'Unable to complete enrichment job' }, { status: 500 });
    return NextResponse.json({ job: data });
  }

  if (action === 'fail') {
    const failure = enrichmentFailureState(current);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('prospect_enrichment_jobs')
      .update({
        status: failure.status,
        last_error: String(body.error || 'Enrichment failed').trim().slice(0, 1000),
        next_attempt_at: failure.nextAttemptAt,
        locked_at: null,
        locked_by: null,
        completed_at: failure.status === 'failed' ? now : null,
        updated_at: now,
      })
      .eq('id', jobId)
      .eq('status', 'running')
      .eq('locked_by', workerId)
      .select(JOB_FIELDS)
      .single();
    if (error) return NextResponse.json({ error: 'Unable to record enrichment failure' }, { status: 500 });
    return NextResponse.json({ job: data, retryAfterMs: failure.retryAfterMs });
  }

  return NextResponse.json({ error: 'Choose claim, checkpoint, complete, or fail' }, { status: 400 });
}
