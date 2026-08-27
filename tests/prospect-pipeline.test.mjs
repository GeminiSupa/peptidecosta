import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANY_READY_FILTER,
  PIPELINE_PAGE_SIZE,
  applyProspectPipelineFilters,
  parseProspectPipelineParams,
  reconcileSavedDirectoryMatches,
  safeProspectSearchTerm,
} from '../src/lib/prospectPipeline.mjs';

test('pipeline query parsing is bounded and rejects unknown choices', () => {
  const params = new URLSearchParams({
    status: 'invented', limit: '5000', offset: '-2', minScore: '170', sort: 'random', owner: 'somebody',
  });
  assert.deepEqual(parseProspectPipelineParams(params), {
    search: '', status: 'active', sort: 'recent', contact: 'any', owner: 'any',
    followUp: 'any', readiness: 'any', source: 'any', activity: 'any',
    minScore: 100, limit: 100, offset: 0,
  });
  assert.equal(parseProspectPipelineParams(new URLSearchParams()).limit, PIPELINE_PAGE_SIZE);
});

test('pipeline search strips PostgREST boolean-control characters', () => {
  assert.equal(safeProspectSearchTerm("gym*),status.eq.won\\'"), 'gym status.eq.won');
});

test('pipeline filters are applied before the server pages rows', () => {
  const calls = [];
  const query = new Proxy({}, {
    get: (_target, method) => (...args) => {
      calls.push([String(method), ...args]);
      return query;
    },
  });
  const filters = parseProspectPipelineParams(new URLSearchParams({
    status: 'due', owner: 'mine', contact: 'email', readiness: 'email_ready',
    minScore: '70', source: 'manual', activity: 'never', sort: 'followup', search: 'Costa Gym',
  }));
  assert.equal(applyProspectPipelineFilters(query, filters, 'agent@example.com', '2026-08-26T00:00:00.000Z'), query);
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'owner_email' && value === 'agent@example.com'));
  assert.ok(calls.some(([method, column, value]) => method === 'gte' && column === 'fit_score' && value === 70));
  assert.ok(calls.some(([method, column]) => method === 'not' && column === 'email'));
  assert.ok(calls.some(([method, column]) => method === 'is' && column === 'last_contacted_at'));
  assert.ok(calls.some(([method, column]) => method === 'order' && column === 'next_follow_up_at'));
  assert.ok(calls.some(([method, value]) => method === 'or' && value.includes('organization_name.ilike.*Costa Gym*')));
  assert.deepEqual(
    calls.filter(([method]) => method === 'order').map(([, column]) => column),
    ['next_follow_up_at', 'id'],
  );
});

test('digits-only searches match formatted phone numbers on the server', () => {
  const calls = [];
  const query = new Proxy({}, {
    get: (_target, method) => (...args) => {
      calls.push([String(method), ...args]);
      return query;
    },
  });
  const filters = parseProspectPipelineParams(new URLSearchParams({ search: '50684046973' }));
  applyProspectPipelineFilters(query, filters, '', '2026-08-26T00:00:00.000Z');
  const searchCall = calls.find(([method]) => method === 'or');
  assert.ok(searchCall[1].includes('phone.ilike.*5*0*6*8*4*0*4*6*9*7*3*'));
});

test('ready queues require the same permission evidence used by the send gate', () => {
  assert.match(ANY_READY_FILTER, /contact_permission_status\.neq\.do_not_contact/);
  assert.match(ANY_READY_FILTER, /email_permission_basis\.eq\.published_business_contact/);
  assert.match(ANY_READY_FILTER, /email_permission_source_url\.not\.is\.null/);
  assert.match(ANY_READY_FILTER, /whatsapp_permission_basis\.eq\.express_consent/);
  assert.match(ANY_READY_FILTER, /whatsapp_permission_evidence\.not\.is\.null/);
});

test('saved lookup reconciliation removes identities the server no longer returns', () => {
  const stale = { id: 'deleted', source_provider: 'openstreetmap', source_external_id: 'node:1' };
  const untouched = { id: 'other', source_provider: 'openstreetmap', source_external_id: 'node:2' };
  const current = new Map([
    ['openstreetmap:node:1', stale],
    ['openstreetmap:node:2', untouched],
  ]);
  const next = reconcileSavedDirectoryMatches(current, [
    { provider: 'openstreetmap', externalId: 'node:1' },
  ], []);
  assert.equal(next.has('openstreetmap:node:1'), false);
  assert.equal(next.get('openstreetmap:node:2'), untouched);
});
