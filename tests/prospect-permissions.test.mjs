import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  channelPermissionFields,
  channelPermissionFor,
  normalizePermissionChannel,
  permissionBasisLabel,
  prospectHasGlobalOptOut,
  summarizeChannelPermissions,
} from '../src/lib/prospectPermissions.mjs';

const migration = await readFile(
  new URL('../add-prospect-channel-permissions.sql', import.meta.url),
  'utf8',
);
const prospectRoute = await readFile(
  new URL('../src/app/api/admin/prospects/route.js', import.meta.url),
  'utf8',
);
const enrichRoute = await readFile(
  new URL('../src/app/api/admin/prospects/enrich/route.js', import.meta.url),
  'utf8',
);
const enrichRunner = await readFile(
  new URL('../src/lib/prospectEnrichmentRunner.mjs', import.meta.url),
  'utf8',
);

test('channel fields never fall back to the historic global permission', () => {
  const legacy = { contact_permission_status: 'business_contact' };
  assert.equal(channelPermissionFor(legacy, 'email').status, 'unknown');
  assert.equal(channelPermissionFor(legacy, 'whatsapp').status, 'unknown');
  assert.equal(summarizeChannelPermissions(legacy), 'unknown');
});

test('permission summary represents the safest useful cross-channel state', () => {
  assert.equal(summarizeChannelPermissions({
    email_permission_status: 'business_contact',
    whatsapp_permission_status: 'unknown',
  }), 'business_contact');
  assert.equal(summarizeChannelPermissions({
    email_permission_status: 'do_not_contact',
    whatsapp_permission_status: 'unknown',
  }), 'unknown');
  assert.equal(summarizeChannelPermissions({
    email_permission_status: 'do_not_contact',
    whatsapp_permission_status: 'do_not_contact',
  }), 'do_not_contact');
  assert.equal(prospectHasGlobalOptOut({
    contact_permission_status: 'do_not_contact',
    email_permission_status: 'unknown',
    whatsapp_permission_status: 'unknown',
  }), true);
  assert.equal(prospectHasGlobalOptOut({
    contact_permission_status: 'business_contact',
    email_permission_status: 'business_contact',
    whatsapp_permission_status: 'do_not_contact',
  }), false);
});

test('status routes refuse to reactivate a global opt-out without new evidence', async () => {
  const bulkRoute = await readFile(new URL('../src/app/api/admin/prospects/bulk/route.js', import.meta.url), 'utf8');
  assert.match(prospectRoute, /prospectHasGlobalOptOut\(current\)/);
  assert.match(prospectRoute, /Clear at least one channel opt-out/);
  assert.match(bulkRoute, /filter\(prospectHasGlobalOptOut\)/);
});

test('channel field names and labels are deterministic', () => {
  assert.equal(normalizePermissionChannel('EMAIL'), 'email');
  assert.equal(normalizePermissionChannel('sms'), null);
  assert.equal(channelPermissionFields('whatsapp').sourceUrl, 'whatsapp_permission_source_url');
  assert.equal(permissionBasisLabel('express_consent'), 'Express consent');
});

test('migration only backfills historic global opt-outs, not ambiguous permission', () => {
  assert.match(migration, /WHERE contact_permission_status = 'do_not_contact' OR status = 'do_not_contact'/);
  assert.match(migration, /business-contact\/consent values are intentionally NOT copied/);
});

test('API accepts structured channel evidence and enrichment reports exact channels', () => {
  assert.match(prospectRoute, /body\.channel_permissions\[channel\]/);
  assert.match(prospectRoute, /A source URL is required to verify the published/);
  assert.match(prospectRoute, /hasUsableProspectWhatsAppIdentity\(candidate\)/);
  // The scan itself moved to src/lib/prospectEnrichmentRunner.mjs so the
  // background worker could run it too; the route is now a thin wrapper.
  assert.match(enrichRunner, /emailPermissionSourceUrl/);
  assert.match(enrichRunner, /whatsappPermissionSourceUrl/);
  assert.match(enrichRoute, /enrichFromWebsite/);
});
