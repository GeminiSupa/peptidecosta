import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  enrichmentFailureState,
  enrichmentJobUiState,
  enrichmentRetryDelayMs,
  isProspectEnrichmentJobsTableMissing,
  isStaleEnrichmentJob,
} from '../src/lib/prospectEnrichmentJobs.mjs';

const migration = readFileSync(new URL('../add-prospect-enrichment-jobs.sql', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/app/api/admin/prospects/enrichment-jobs/route.js', import.meta.url), 'utf8');

test('interrupted running jobs become stale only after the lease window', () => {
  const now = Date.parse('2026-08-21T12:05:00.000Z');
  assert.equal(isStaleEnrichmentJob({ status: 'running', locked_at: '2026-08-21T12:02:59.000Z' }, now), true);
  assert.equal(isStaleEnrichmentJob({ status: 'running', locked_at: '2026-08-21T12:04:00.000Z' }, now), false);
  assert.equal(isStaleEnrichmentJob({ status: 'queued', locked_at: '2026-08-21T12:00:00.000Z' }, now), false);
});

test('retry delay backs off and stops at five minutes', () => {
  assert.equal(enrichmentRetryDelayMs(1), 30_000);
  assert.equal(enrichmentRetryDelayMs(2), 60_000);
  assert.equal(enrichmentRetryDelayMs(10), 300_000);
});

test('a job retries below its limit and fails at the limit', () => {
  const now = Date.parse('2026-08-21T12:00:00.000Z');
  const retry = enrichmentFailureState({ attempts: 2, max_attempts: 3 }, now);
  assert.equal(retry.status, 'queued');
  assert.equal(retry.retryAfterMs, 60_000);
  assert.equal(retry.nextAttemptAt, '2026-08-21T12:01:00.000Z');

  const terminal = enrichmentFailureState({ attempts: 3, max_attempts: 3 }, now);
  assert.equal(terminal.status, 'failed');
  assert.equal(terminal.retryAfterMs, 0);
});

test('database job states map to truthful row chips', () => {
  assert.equal(enrichmentJobUiState({ status: 'running' }).status, 'scanning');
  assert.equal(enrichmentJobUiState({ status: 'succeeded' }).status, 'done');
  assert.match(enrichmentJobUiState({ status: 'queued', attempts: 1, last_error: 'timeout' }).message, /Retry scheduled/);
});

test('queue migration prevents duplicate jobs and preserves checkpoints', () => {
  assert.match(migration, /prospect_id UUID NOT NULL UNIQUE/i);
  assert.match(migration, /result_payload JSONB/i);
  assert.match(migration, /next_attempt_at TIMESTAMPTZ/i);
  assert.match(migration, /status IN \('queued','running','succeeded','failed','cancelled'\)/i);
});

test('claiming is conditional and scan results are checkpointed before completion', () => {
  assert.match(route, /\.eq\('status', 'queued'\)/);
  assert.match(route, /\.eq\('attempts', current\.attempts\)/);
  assert.match(route, /action === 'checkpoint'/);
  assert.match(route, /result_payload: body\.result/);
  assert.match(route, /Previous scan was interrupted before completion/);
});

test('missing queue table produces a migration-specific setup response', () => {
  assert.equal(isProspectEnrichmentJobsTableMissing({ code: '42P01' }), true);
  assert.equal(isProspectEnrichmentJobsTableMissing({ code: 'PGRST205' }), true);
  assert.equal(isProspectEnrichmentJobsTableMissing({ message: "Could not find prospect_enrichment_jobs in the schema cache" }), true);
  assert.equal(isProspectEnrichmentJobsTableMissing({ message: 'network timeout' }), false);
});
