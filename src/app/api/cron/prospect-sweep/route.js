import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCronRequest } from '@/lib/cronAuth';
import {
  isProspectsTableMissing,
  isRetryableOverpassStatus,
  normalizeOverpassElement,
  overpassEndpoints,
} from '@/lib/prospects.mjs';
import { nextSweepBatch, sweepOverpassQuery, SWEEP_TASK_COUNT } from '@/lib/prospectSweep.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SETTING_ID = 'prospect_sweep';

/**
 * Two tasks a run, against free public mirrors.
 *
 * Overpass is donated infrastructure with a usage policy, and this job has no
 * deadline — a full pass of Costa Rica finishing in days rather than minutes
 * costs nothing. Raising this to hurry it along is how the mirrors start
 * returning 429 and the sweep gets slower.
 */
const BATCH = 2;

/** Only rows the scoring model calls a plausible prospect are kept. */
const MIN_FIT_SCORE = 45;

const ATTEMPT_TIMEOUT_MS = 25_000;

async function overpassFetch(query) {
  const endpoints = overpassEndpoints(process.env.OVERPASS_BASE_URL);
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'CostaPeptidesProspector/1.0',
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) {
        const error = new Error(`Overpass returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (err) {
      lastError = err;
      // A mirror that is merely busy says nothing about the next one; a
      // malformed query would fail identically everywhere, so stop.
      if (err.status && !isRetryableOverpassStatus(err.status)) break;
    }
  }
  throw lastError || new Error('No Overpass mirror answered');
}

async function readCursor(supabase) {
  const { data } = await supabase.from('site_settings').select('value').eq('id', SETTING_ID).maybeSingle();
  return Number(data?.value?.cursor) || 0;
}

async function writeCursor(supabase, value) {
  const { error } = await supabase.from('site_settings').upsert({ id: SETTING_ID, value });
  if (error) console.error('[Prospect Sweep] Could not save the cursor:', error.message);
}

export async function GET(request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  const supabase = getSupabaseAdmin();

  try {
    const cursor = await readCursor(supabase);
    const { tasks, nextCursor, wrapped } = nextSweepBatch(cursor, BATCH);

    let found = 0;
    let saved = 0;
    let skipped = 0;
    const errors = [];

    for (const task of tasks) {
      const query = sweepOverpassQuery(task.term, task.cell);
      if (!query) continue;

      let payload;
      try {
        payload = await overpassFetch(query);
      } catch (err) {
        errors.push(`${task.term} @ ${task.cell.row},${task.cell.col}: ${err.message}`);
        continue;
      }

      const candidates = (payload.elements || [])
        .map((element) => normalizeOverpassElement(element))
        .filter((row) => row && row.organization_name && row.fit_score >= MIN_FIT_SCORE);
      found += candidates.length;
      if (!candidates.length) continue;

      // Which of these are already tracked. Checked rather than upserted: a
      // sweep must never write over the status, notes, owner or follow-up date
      // that somebody has since put on a prospect it happens to rediscover.
      // Discovery only ever adds.
      const ids = candidates.map((row) => row.source_external_id);
      const { data: existing, error: lookupError } = await supabase
        .from('sales_prospects')
        .select('source_external_id')
        .eq('source_provider', 'openstreetmap')
        .in('source_external_id', ids);

      if (isProspectsTableMissing(lookupError)) {
        return NextResponse.json({ error: 'Run prospector-migration.sql first.', setupRequired: true }, { status: 503 });
      }
      if (lookupError) {
        errors.push(`${task.term}: duplicate check failed — ${lookupError.message}`);
        continue;
      }

      const known = new Set((existing || []).map((row) => row.source_external_id));
      const fresh = candidates.filter((row) => !known.has(row.source_external_id));
      skipped += candidates.length - fresh.length;
      if (!fresh.length) continue;

      const now = new Date().toISOString();
      const { error: insertError, count } = await supabase
        .from('sales_prospects')
        .insert(fresh.map((row) => ({ ...row, status: 'discovered', updated_at: now })), { count: 'exact' });

      if (insertError) {
        errors.push(`${task.term}: save failed — ${insertError.message}`);
        continue;
      }
      saved += count ?? fresh.length;
    }

    await writeCursor(supabase, {
      cursor: nextCursor,
      lastRunAt: new Date().toISOString(),
      ...(wrapped ? { lastPassCompletedAt: new Date().toISOString() } : {}),
    });

    return NextResponse.json({
      success: true,
      swept: tasks.map((task) => `${task.term} @ ${task.cell.row},${task.cell.col}`),
      found,
      saved,
      alreadyTracked: skipped,
      progress: `${nextCursor}/${SWEEP_TASK_COUNT}`,
      passCompleted: wrapped,
      ...(errors.length ? { errors } : {}),
    });
  } catch (err) {
    console.error('[Prospect Sweep]', err);
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
