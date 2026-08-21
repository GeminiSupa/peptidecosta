export const PROSPECT_ENRICHMENT_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
];

export const PROSPECT_ENRICHMENT_MAX_ATTEMPTS = 3;
export const PROSPECT_ENRICHMENT_STALE_MS = 2 * 60 * 1000;

export function isStaleEnrichmentJob(job = {}, now = Date.now()) {
  if (job.status !== 'running' || !job.locked_at) return false;
  const lockedAt = new Date(job.locked_at).getTime();
  return Number.isFinite(lockedAt) && lockedAt <= now - PROSPECT_ENRICHMENT_STALE_MS;
}

export function enrichmentRetryDelayMs(attempts) {
  const safeAttempts = Math.max(1, Math.floor(Number(attempts) || 1));
  return Math.min(5 * 60 * 1000, 30 * 1000 * (2 ** (safeAttempts - 1)));
}

export function enrichmentFailureState(job = {}, now = Date.now()) {
  const attempts = Math.max(0, Math.floor(Number(job.attempts) || 0));
  const maxAttempts = Math.max(1, Math.floor(Number(job.max_attempts) || PROSPECT_ENRICHMENT_MAX_ATTEMPTS));
  if (attempts >= maxAttempts) {
    return { status: 'failed', nextAttemptAt: new Date(now).toISOString(), retryAfterMs: 0 };
  }
  const retryAfterMs = enrichmentRetryDelayMs(attempts);
  return {
    status: 'queued',
    nextAttemptAt: new Date(now + retryAfterMs).toISOString(),
    retryAfterMs,
  };
}

export function enrichmentJobUiState(job = {}) {
  const status = job.status === 'running'
    ? 'scanning'
    : job.status === 'succeeded'
      ? 'done'
      : job.status;
  const retry = job.status === 'queued' && Number(job.attempts) > 0;
  return {
    status,
    message: job.last_error
      ? `${retry ? 'Retry scheduled: ' : ''}${job.last_error}`
      : (job.status === 'succeeded' ? 'Website scan saved' : ''),
    jobId: job.id || null,
    attempts: Number(job.attempts) || 0,
    maxAttempts: Number(job.max_attempts) || PROSPECT_ENRICHMENT_MAX_ATTEMPTS,
    nextAttemptAt: job.next_attempt_at || null,
  };
}

export function isProspectEnrichmentJobsTableMissing(error) {
  const message = String(error?.message || '');
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || /prospect_enrichment_jobs/i.test(message) && /does not exist|schema cache|could not find/i.test(message);
}
