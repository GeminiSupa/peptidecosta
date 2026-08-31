import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCronRequest } from '@/lib/cronAuth';
import { isProspectsTableMissing } from '@/lib/prospects.mjs';
import { enrichFromWebsite, enrichmentUpdates } from '@/lib/prospectEnrichmentRunner.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scans are a crawl of somebody else's website, not a database read, and the
 * runner budgets ~28s for one. Three is what fits inside maxDuration with room
 * for the writes.
 */
const BATCH = 3;

/** How many newly discovered prospects get queued per run. */
const ENQUEUE = 25;

const RETRY_BACKOFF_MINUTES = [10, 60, 360];

/**
 * Queues prospects the sweep found that have a website and no email yet.
 *
 * The queue was built for a browser: the admin tab claimed a job, ran the scan
 * itself and posted the result back. Nothing filled it unless somebody was
 * sitting in the tab, so a sweep that discovers a thousand pharmacies overnight
 * produced a thousand rows nobody could email.
 */
async function enqueueNewProspects(supabase) {
  const { data: candidates, error } = await supabase
    .from('sales_prospects')
    .select('id')
    .not('website_url', 'is', null)
    .is('email', null)
    .is('enriched_at', null)
    .neq('status', 'do_not_contact')
    .order('fit_score', { ascending: false })
    .limit(ENQUEUE);

  if (isProspectsTableMissing(error)) return { queued: 0, setupRequired: true };
  if (error || !candidates?.length) return { queued: 0 };

  // prospect_id is unique on the jobs table, so a prospect already queued,
  // running or finished is rejected rather than duplicated. ignoreDuplicates
  // makes that the expected outcome instead of an error.
  const { data, error: insertError } = await supabase
    .from('prospect_enrichment_jobs')
    .upsert(
      candidates.map((row) => ({ prospect_id: row.id, status: 'queued' })),
      { onConflict: 'prospect_id', ignoreDuplicates: true },
    )
    .select('id');

  if (insertError) {
    console.error('[Prospect Enrich] Could not queue:', insertError.message);
    return { queued: 0 };
  }
  return { queued: data?.length || 0 };
}

export async function GET(request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  const supabase = getSupabaseAdmin();

  try {
    const { queued, setupRequired } = await enqueueNewProspects(supabase);
    if (setupRequired) {
      return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
    }

    const { data: jobs, error: claimError } = await supabase
      .from('prospect_enrichment_jobs')
      .select('id, prospect_id, attempts, max_attempts')
      .eq('status', 'queued')
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(BATCH);

    if (claimError) {
      // The queue table is a separate migration from the prospects one.
      return NextResponse.json({
        error: 'Run add-prospect-enrichment-jobs.sql first.',
        setupRequired: true,
        details: claimError.message,
      }, { status: 503 });
    }

    let scanned = 0;
    let contactsFound = 0;
    let failed = 0;

    for (const job of jobs || []) {
      const startedAt = new Date().toISOString();
      await supabase
        .from('prospect_enrichment_jobs')
        .update({ status: 'running', locked_at: startedAt, locked_by: 'cron', started_at: startedAt, updated_at: startedAt })
        .eq('id', job.id);

      const { data: prospect } = await supabase
        .from('sales_prospects')
        .select('*')
        .eq('id', job.prospect_id)
        .maybeSingle();

      const attempts = (job.attempts || 0) + 1;

      if (!prospect?.website_url) {
        await supabase.from('prospect_enrichment_jobs').update({
          status: 'cancelled', attempts, last_error: 'No website to scan',
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', job.id);
        continue;
      }

      try {
        const payload = await enrichFromWebsite({
          websiteUrl: prospect.website_url,
          organizationName: prospect.organization_name,
        });
        const updates = enrichmentUpdates(payload, prospect);

        const { error: writeError } = await supabase
          .from('sales_prospects')
          .update(updates)
          .eq('id', prospect.id);
        if (writeError) throw new Error(`Could not save the scan: ${writeError.message}`);

        scanned += 1;
        if (updates.email_permission_status === 'business_contact'
          || updates.whatsapp_permission_status === 'business_contact') contactsFound += 1;

        await supabase.from('prospect_enrichment_jobs').update({
          status: 'succeeded', attempts, result_payload: payload, last_error: null,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', job.id);
      } catch (err) {
        failed += 1;
        const exhausted = attempts >= (job.max_attempts || 3);
        // Backs off rather than retrying immediately: most failures here are a
        // site that is slow or briefly down, and hammering it helps nobody.
        const waitMinutes = RETRY_BACKOFF_MINUTES[Math.min(attempts - 1, RETRY_BACKOFF_MINUTES.length - 1)];
        await supabase.from('prospect_enrichment_jobs').update({
          status: exhausted ? 'failed' : 'queued',
          attempts,
          last_error: String(err.message || err).slice(0, 500),
          next_attempt_at: new Date(Date.now() + waitMinutes * 60_000).toISOString(),
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id);
      }
    }

    return NextResponse.json({ success: true, queued, scanned, contactsFound, failed });
  } catch (err) {
    console.error('[Prospect Enrich]', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
