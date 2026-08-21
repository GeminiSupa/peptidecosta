import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  normalizeProspectOwnerEmail,
  prospectOwnerLabel,
  prospectOwnerState,
} from '../src/lib/prospectOwnership.mjs';

const singleRoute = await readFile(
  new URL('../src/app/api/admin/prospects/route.js', import.meta.url),
  'utf8',
);
const bulkRoute = await readFile(
  new URL('../src/app/api/admin/prospects/bulk/route.js', import.meta.url),
  'utf8',
);

test('owner helpers normalize identities and distinguish mine from another agent', () => {
  assert.equal(normalizeProspectOwnerEmail(' Agent@Example.COM '), 'agent@example.com');
  assert.equal(prospectOwnerState('', 'agent@example.com'), 'unassigned');
  assert.equal(prospectOwnerState('Agent@Example.com', 'agent@example.com'), 'mine');
  assert.equal(prospectOwnerState('other@example.com', 'agent@example.com'), 'other');
  assert.equal(prospectOwnerLabel('agent@example.com', 'agent@example.com'), 'You');
  assert.equal(prospectOwnerLabel('other@example.com', 'agent@example.com', { compact: true }), 'other');
});

test('single and bulk claim paths use an atomic unassigned-row condition', () => {
  assert.match(singleRoute, /\.is\('owner_email', null\)/);
  assert.match(bulkRoute, /\.is\('owner_email', null\)/);
  assert.match(singleRoute, /auth\.profile\?\.email \|\| auth\.user\?\.email/);
  assert.match(bulkRoute, /auth\.profile\?\.email \|\| auth\.user\?\.email/);
});

test('generic owner overwrites are rejected by both mutation routes', () => {
  assert.match(singleRoute, /if \('owner_email' in body\)/);
  assert.match(singleRoute, /Use the protected claim action/);
  assert.match(bulkRoute, /if \('owner_email' in body\)/);
  assert.match(bulkRoute, /Use the protected claim action/);
});
