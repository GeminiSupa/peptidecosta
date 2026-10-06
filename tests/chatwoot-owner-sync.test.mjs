import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chatwootOwnerColumns,
  ownerNameByChatwootEmail,
  planChatwootOwnerUpdates,
} from '../src/lib/chatwootOwnerSync.mjs';

/**
 * Google Ads chats go to Chatwoot unassigned and Chatwoot picks the agent, so
 * the CRM owner has to follow it or commission is paid to whoever the CRM
 * happened to name first. These tests pin the cases where moving the owner
 * would be wrong.
 */

const staff = (name, email, extra = {}) => ({
  name, email, status: 'active', permissions: ['leads'], ...extra,
});

const profiles = [
  staff('Dani', 'elainedrb@gmail.com'),
  staff('Kattia Morales', 'kathya2089@gmail.com'),
];

test('the CRM owner follows the agent Chatwoot gave the chat to', () => {
  const { updates } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Dani', chatwoot_conversation_id: 2743 }],
    assignees: { 2743: { name: 'Kattia Morales', email: 'kathya2089@gmail.com' } },
    profiles,
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].from, 'Dani');
  assert.equal(updates[0].to, 'Kattia Morales');
});

test('a chat nobody has taken leaves the CRM owner alone', () => {
  // The lead is still Dani's as far as anyone knows; an empty assignee is not
  // evidence that it is not.
  const { updates, skipped } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Dani', chatwoot_conversation_id: 2743 }],
    assignees: { 2743: { name: '', email: '' } },
    profiles,
  });
  assert.equal(updates.length, 0);
  assert.equal(skipped.unassigned, 1);
});

test('a conversation this run did not see is left alone', () => {
  const { updates, skipped } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Dani', chatwoot_conversation_id: 9999 }],
    assignees: { 2743: { name: 'Kattia Morales', email: 'kathya2089@gmail.com' } },
    profiles,
  });
  assert.equal(updates.length, 0);
  assert.equal(skipped.notSeen, 1);
});

test('an owner that already matches is not rewritten', () => {
  const { updates, skipped } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Kattia Morales', chatwoot_conversation_id: 2743 }],
    assignees: { 2743: { name: 'Kattia Morales', email: 'kathya2089@gmail.com' } },
    profiles,
  });
  assert.equal(updates.length, 0);
  assert.equal(skipped.alreadyCorrect, 1);
});

test('an unowned lead gains the agent who picked it up', () => {
  const { updates } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: null, chatwoot_conversation_id: 2743 }],
    assignees: { 2743: { name: 'Kattia Morales', email: 'kathya2089@gmail.com' } },
    profiles,
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].from, null);
  assert.equal(updates[0].to, 'Kattia Morales');
});

test('an affiliate on a Chatwoot seat is never made the owner', () => {
  // Affiliate logins live in admin_profiles like everyone else; one holding a
  // Chatwoot seat must not end up owning a lead and earning agent commission.
  const { updates, skipped } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Dani', chatwoot_conversation_id: 2743 }],
    assignees: { 2743: { name: 'Outside Partner', email: 'partner@example.com' } },
    profiles: [...profiles, staff('Outside Partner', 'partner@example.com', { tier: 'affiliate' })],
  });
  assert.equal(updates.length, 0);
  assert.deepEqual(skipped.unknownAgent, ['partner@example.com']);
});

test('a suspended agent is never made the owner', () => {
  const { updates, skipped } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Dani', chatwoot_conversation_id: 2743 }],
    assignees: { 2743: { name: 'Gone', email: 'gone@example.com' } },
    profiles: [...profiles, staff('Gone', 'gone@example.com', { status: 'suspended' })],
  });
  assert.equal(updates.length, 0);
  assert.deepEqual(skipped.unknownAgent, ['gone@example.com']);
});

test('a Chatwoot seat with no CRM profile is reported, not guessed at', () => {
  const { updates, skipped } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Dani', chatwoot_conversation_id: 2743 }],
    assignees: { 2743: { name: 'Someone Else', email: 'nobody@example.com' } },
    profiles,
  });
  assert.equal(updates.length, 0);
  assert.deepEqual(skipped.unknownAgent, ['nobody@example.com']);
});

test('a lead with no Chatwoot conversation is ignored entirely', () => {
  const { updates } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Dani', chatwoot_conversation_id: null }],
    assignees: { 2743: { name: 'Kattia Morales', email: 'kathya2089@gmail.com' } },
    profiles,
  });
  assert.equal(updates.length, 0);
});

test('email matching ignores case', () => {
  const { updates } = planChatwootOwnerUpdates({
    leads: [{ id: 'lead-1', sales_agent: 'Dani', chatwoot_conversation_id: 2743 }],
    assignees: { 2743: { name: 'Kattia', email: 'Kathya2089@Gmail.com' } },
    profiles,
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].to, 'Kattia Morales', 'the CRM name wins over the Chatwoot display name');
});

test('only active internal staff are offered as owners', () => {
  const map = ownerNameByChatwootEmail([
    staff('Dani', 'elainedrb@gmail.com'),
    staff('Partner', 'partner@example.com', { tier: 'affiliate' }),
    staff('Pending', 'pending@example.com', { status: 'pending' }),
  ]);
  assert.deepEqual([...map.keys()], ['elainedrb@gmail.com']);
});

test('the written row says Chatwoot moved the owner', () => {
  const row = chatwootOwnerColumns(
    { to: 'Kattia Morales', email: 'kathya2089@gmail.com' },
    '2026-10-07T00:00:00.000Z',
  );
  assert.equal(row.sales_agent, 'Kattia Morales');
  assert.equal(row.ownership_updated_by, 'system:chatwoot_sync');
  assert.equal(row.ownership_updated_at, '2026-10-07T00:00:00.000Z');
});

test('the job is scheduled', async () => {
  const { readFile } = await import('node:fs/promises');
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const entry = config.crons.find((cron) => cron.path === '/api/cron/chatwoot-owner-sync');
  assert.ok(entry, 'an unscheduled sync never runs, and the CRM owner silently drifts again');
  assert.equal(entry.schedule, '*/15 * * * *');
});

/* The owner has to read the same on every screen. The Customers tab works
   ownership out from closed orders, and a CRM lead has none - so a lead the
   Leads tab showed as Kattia's read "Owner: Unassigned" there. */

test('the Customers tab falls back to the lead own agent', async () => {
  const { readFile } = await import('node:fs/promises');
  const crm = await readFile(new URL('../src/components/admin/CustomersCRM.js', import.meta.url), 'utf8');

  assert.match(crm, /leadAgent:/, 'the lead row agent has to be carried onto the customer');
  assert.match(
    crm,
    /findHistoricalAgent\(history, \{[\s\S]{0,160}\}\)\?\.agent \|\| customer\.leadAgent/,
    'order history must still win, with the lead agent only as the fallback',
  );
});

/* A Google Ads lead that never reached Chatwoot is not being worked by anyone,
   because Chatwoot is where these are answered. The handover now runs after the
   visitor has been answered, so a failure there is invisible to them - it has
   to be retried, and visible until it lands. */

test('the job retries a lead that never reached Chatwoot', async () => {
  const { readFile } = await import('node:fs/promises');
  const job = await readFile(new URL('../src/app/api/cron/chatwoot-owner-sync/route.js', import.meta.url), 'utf8');

  assert.match(job, /\.is\('chatwoot_conversation_id', null\)/, 'it has to look for leads with no chat');
  assert.match(job, /sendAdLeadToChatwoot\(/, 'and actually send them');
  assert.match(job, /isAdLandingSource\(row\.lead_source\)/, 'only the paid ad leads');
  assert.match(job, /assigneeEmail: ''/, 'a retry must not start assigning owners again');
  assert.match(job, /chatwootLeadColumns\(result\)/, 'the outcome has to be written back, or it resends forever');
  assert.match(job, /STILL not in Chatwoot/, 'a retry that fails again has to be loud');
});

test('the Leads screen shows a Google Ads lead that is missing from Chatwoot', async () => {
  const { readFile } = await import('node:fs/promises');
  const screen = await readFile(new URL('../src/components/admin/LeadsManager.js', import.meta.url), 'utf8');

  assert.match(screen, /not in Chatwoot/, 'a dash made the one case worth noticing look like the quiet one');
  assert.match(screen, /isGoogleAdsLead\(lead\)/, 'only ad leads belong in Chatwoot, so only they can be missing from it');
  assert.match(screen, /retrying every 15 min/, 'say it is being retried, so nobody re-enters it by hand');
});
