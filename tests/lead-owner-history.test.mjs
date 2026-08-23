import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildLeadOwnerIndex,
  leadContactKeys,
  leadOwnerFromCrmLeads,
} from '../src/lib/leadOwnerHistory.mjs';
import { leadAlertAudience, recipientOwnerProfile } from '../src/lib/leadAlertAudience.mjs';

// ── Which contact keys a lead row stands for ────────────────────────────────

test('a lead is keyed by every contact detail it carries, however it was stored', () => {
  assert.deepEqual(
    [...leadContactKeys({ contact_value: '+506 8404-6973', email: 'Ana@Example.com' })].sort(),
    ['email:ana@example.com', 'phone:84046973'],
  );
});

test('Costa Rican numbers collapse to one key no matter how the agent typed them', () => {
  assert.deepEqual([...leadContactKeys({ contact_value: '8404 6973' })], ['phone:84046973']);
  assert.deepEqual([...leadContactKeys({ contact_value: '84-04-69-73' })], ['phone:84046973']);
  assert.deepEqual([...leadContactKeys({ contact_value: '+50684046973' })], ['phone:84046973']);
});

test('an address full of digits is never mistaken for a phone number', () => {
  // phoneKey strips non-digits, so without the @ test first this would yield a
  // perfectly plausible 8-digit key and hand that number's owner this lead.
  assert.deepEqual([...leadContactKeys({ contact_value: 'user123456789@example.com' })], [
    'email:user123456789@example.com',
  ]);
});

test('a lead nobody can be contacted on produces no keys', () => {
  assert.equal(leadContactKeys({ contact_value: '' }).size, 0);
  assert.equal(leadContactKeys({ contact_value: '1234' }).size, 0); // too short to own anyone
});

// ── Building the ownership index ────────────────────────────────────────────

test('the agent who claimed the contact first keeps it', () => {
  const index = buildLeadOwnerIndex([
    { sales_agent: 'Yese', contact_value: 'ana@example.com', assigned_at: '2026-05-01T00:00:00Z' },
    { sales_agent: 'Yese', contact_value: 'ana@example.com', assigned_at: '2026-02-01T00:00:00Z' },
  ]);
  assert.equal(index.get('email:ana@example.com').agent, 'Yese');
  assert.equal(index.get('email:ana@example.com').at, Date.parse('2026-02-01T00:00:00Z'));
});

test('a contact two different agents both own is dropped rather than awarded to either', () => {
  const index = buildLeadOwnerIndex([
    { sales_agent: 'Korinne', contact_value: 'info@shared.com', assigned_at: '2026-01-01T00:00:00Z' },
    { sales_agent: 'Yese', contact_value: 'info@shared.com', assigned_at: '2026-03-01T00:00:00Z' },
  ]);
  assert.equal(index.has('email:info@shared.com'), false);
});

test('one agent written two ways is still one agent, not a contested contact', () => {
  const resolveAgent = (value) => (
    String(value).toLowerCase() === 'korinneda@icloud.com' ? 'Korinne' : value
  );
  const index = buildLeadOwnerIndex([
    { sales_agent: 'Korinne', contact_value: 'ana@example.com', assigned_at: '2026-03-01T00:00:00Z' },
    { sales_agent: 'korinneda@icloud.com', contact_value: 'ana@example.com', assigned_at: '2026-01-01T00:00:00Z' },
  ], { resolveAgent });
  assert.equal(index.get('email:ana@example.com').agent, 'Korinne');
});

test('unowned leads contribute nothing', () => {
  const index = buildLeadOwnerIndex([
    { sales_agent: null, contact_value: 'ana@example.com' },
    { sales_agent: '   ', contact_value: '84046973' },
  ]);
  assert.equal(index.size, 0);
});

test('a lead with an unreadable date cannot outrank a real one', () => {
  const index = buildLeadOwnerIndex([
    { sales_agent: 'Yese', contact_value: 'ana@example.com', assigned_at: 'not a date' },
    { sales_agent: 'Yese', contact_value: 'ana@example.com', assigned_at: '2026-04-01T00:00:00Z' },
  ]);
  assert.equal(index.get('email:ana@example.com').at, Date.parse('2026-04-01T00:00:00Z'));
});

// ── Resolving one enquiry against the lead book ─────────────────────────────

const OWNED_LEADS = [
  { sales_agent: 'Korinne', contact_value: 'ana@example.com', assigned_at: '2026-02-01T00:00:00Z' },
  { sales_agent: 'Yese', contact_value: '+506 8888-7777', assigned_at: '2026-03-01T00:00:00Z' },
];

test('an enquiry matches an owned lead on email', () => {
  assert.equal(leadOwnerFromCrmLeads(OWNED_LEADS, { email: 'ANA@example.com' }).agent, 'Korinne');
});

test('an enquiry matches an owned lead on phone alone, in any format', () => {
  assert.equal(leadOwnerFromCrmLeads(OWNED_LEADS, { phone: '88887777' }).agent, 'Yese');
});

test('a contact we have never seen belongs to nobody', () => {
  assert.equal(leadOwnerFromCrmLeads(OWNED_LEADS, { email: 'new@example.com' }), null);
  assert.equal(leadOwnerFromCrmLeads([], { email: 'ana@example.com' }), null);
});

test('when phone and email point at different agents, the earlier claim wins', () => {
  const owner = leadOwnerFromCrmLeads(OWNED_LEADS, {
    email: 'ana@example.com',   // Korinne, February
    phone: '88887777',          // Yese, March
  });
  assert.equal(owner.agent, 'Korinne');
});

test('on an exact tie the email match wins, matching the order-book rule', () => {
  const sameDay = [
    { sales_agent: 'Korinne', contact_value: 'ana@example.com', assigned_at: '2026-02-01T00:00:00Z' },
    { sales_agent: 'Yese', contact_value: '88887777', assigned_at: '2026-02-01T00:00:00Z' },
  ];
  assert.equal(leadOwnerFromCrmLeads(sameDay, { email: 'ana@example.com', phone: '88887777' }).agent, 'Korinne');
});

// ── Who is told about a lead ────────────────────────────────────────────────
//
// Production is shaped like this: Dani logs in as elainedrb@gmail.com but her
// alert row is daniela@peptidescostarica.net, and Korinne has no WhatsApp
// number on file at all.

const PROFILES = [
  { name: 'Dani', email: 'elainedrb@gmail.com', whatsapp_number: '+506 8781 7225' },
  { name: 'Korinne', email: 'korinneda@icloud.com', whatsapp_number: null },
];

const ROWS = [
  { channel: 'email', label: 'Dani', destination: 'daniela@peptidescostarica.net' },
  { channel: 'whatsapp', label: 'Dani', destination: '50687817225' },
  { channel: 'email', label: 'Ops inbox', destination: 'info@peptidescostarica.net' },
  { channel: 'email', label: 'Joe (temp CC until info@ fixed)', destination: 'joe@tolm.co' },
];

test('a row labelled with an agent name is theirs', () => {
  assert.equal(recipientOwnerProfile(ROWS[0], PROFILES)?.name, 'Dani');
  assert.equal(recipientOwnerProfile(ROWS[1], PROFILES)?.name, 'Dani');
  // Only an unlabelled row falls back to matching on the address.
  assert.equal(recipientOwnerProfile({ destination: 'ElaineDRB@gmail.com' }, PROFILES)?.name, 'Dani');
});

test('shared destinations belong to nobody, including a label that merely contains a name', () => {
  assert.equal(recipientOwnerProfile(ROWS[2], PROFILES), null);
  // "Joe (temp CC…)" is a shared CC. Matching loosely would silence it.
  assert.equal(recipientOwnerProfile(ROWS[3], [{ name: 'Joe', email: 'joe@peptidescostarica.net' }]), null);
});

test('a shared inbox that is also somebody login stays shared', () => {
  // info@peptidescostarica.net is the ops inbox AND the superadmin account.
  // Matching on the address alone took it off every lead that was not his.
  const withWebster = [...PROFILES, { name: 'Webster', email: 'info@peptidescostarica.net', whatsapp_number: null }];
  assert.equal(recipientOwnerProfile(ROWS[2], withWebster), null);

  const audience = leadAlertAudience({ rows: ROWS, profiles: withWebster, owner: 'Korinne' });
  assert.ok(
    audience.emails.includes('info@peptidescostarica.net'),
    'the ops inbox must be told about every lead, whoever owns it',
  );
});

test('the owner is reached on their own profile, and the campaign agent is left off', () => {
  const audience = leadAlertAudience({ rows: ROWS, profiles: PROFILES, owner: 'Korinne' });
  assert.deepEqual(audience.emails, [
    'korinneda@icloud.com',          // from her own profile, and first
    'info@peptidescostarica.net',
    'joe@tolm.co',
  ]);
  // Dani's phone and inbox are both absent: this is not her lead.
  assert.deepEqual(audience.whatsapp, []);
});

test('the campaign agent keeps her own lead, on every destination she has', () => {
  // The owner's rule: "unless it is Dani's customer already".
  const audience = leadAlertAudience({ rows: ROWS, profiles: PROFILES, owner: 'Dani' });
  assert.deepEqual(audience.emails, [
    'elainedrb@gmail.com',
    'daniela@peptidescostarica.net',
    'info@peptidescostarica.net',
    'joe@tolm.co',
  ]);
  assert.deepEqual(audience.whatsapp.map((entry) => entry.destination), ['50687817225']);
});

test('an agent with no number on file simply gets no WhatsApp, not a broken send', () => {
  const audience = leadAlertAudience({ rows: [], profiles: PROFILES, owner: 'Korinne' });
  assert.deepEqual(audience.whatsapp, []);
  assert.deepEqual(audience.emails, ['korinneda@icloud.com']);
});

test('an unowned lead still reaches the shared inboxes', () => {
  const audience = leadAlertAudience({ rows: ROWS, profiles: PROFILES, owner: '' });
  // Nobody owns it, so no personal row fires — but the campaign is not silent.
  assert.deepEqual(audience.emails, ['info@peptidescostarica.net', 'joe@tolm.co']);
});

test('a number is deduped however it was typed, and an unreachable one is dropped', () => {
  const audience = leadAlertAudience({
    rows: [
      { channel: 'whatsapp', label: 'Second phone', destination: '+506 8781-7225' },
      { channel: 'whatsapp', label: 'Broken', destination: '123' },
      { channel: 'email', label: 'Broken', destination: 'not-an-address' },
    ],
    profiles: PROFILES,
    owner: 'Dani',
  });
  assert.deepEqual(audience.whatsapp.map((entry) => entry.destination), ['50687817225']);
  assert.deepEqual(audience.emails, ['elainedrb@gmail.com']);
});

test('the env fallback is used only when the managed list is unavailable', () => {
  const audience = leadAlertAudience({
    rows: [], profiles: [], owner: '', fallback: ['omerforce@gmail.com'],
  });
  assert.deepEqual(audience.emails, ['omerforce@gmail.com']);
});

// ── Route wiring ────────────────────────────────────────────────────────────
// The precedence itself lives in a route that imports through the '@/' alias,
// which `node --test` cannot resolve. These assert the wiring that the pure
// rules above depend on, so removing a guard fails here rather than in
// production with a colleague's customer already on the phone to the campaign
// agent.

test('the campaign agent is only assigned to a lead nobody already owns', () => {
  const route = fs.readFileSync('src/app/api/leads/contact/route.js', 'utf8');
  assert.match(
    route,
    /if \(!owner && hasLandingQualification\(qualification\)\) \{/,
    'dropping the !owner guard sends every returning customer to the campaign agent again',
  );
  assert.match(route, /resolveLeadOwnerDetailed\(/, 'ownership must be resolved before assignment');
});

test('the retired round-robin is gone from the route', () => {
  const route = fs.readFileSync('src/app/api/leads/contact/route.js', 'utf8');
  assert.doesNotMatch(route, /assign_next_landing_lead_agent/);
  assert.doesNotMatch(route, /fallbackRoundRobinAgent/);
  assert.match(route, /resolveCampaignAgent\(supabase, landingSettings\)/);
});

test('both alert channels resolve their recipients from the lead owner', () => {
  const route = fs.readFileSync('src/app/api/leads/contact/route.js', 'utf8');
  assert.match(route, /getLeadAlertAudience\(supabase, \{ source, owner: assignedAgent \}\)/);
  assert.match(route, /getLeadAlertAudience\(supabase, \{ source, owner \}\)/);
});

test('the WhatsApp alert cannot fall back to an owner-blind recipient list', () => {
  const alert = fs.readFileSync('src/lib/leadWhatsAppAlert.js', 'utf8');
  // Reading the adwords_lead flag directly here would buzz the campaign agent
  // about a colleague's customer, ignoring every rule above.
  assert.doesNotMatch(alert, /getNotificationRecipients/);
});

test('the outbox resolves the audience from the saved owner, not from the job', () => {
  const delivery = fs.readFileSync('src/lib/leadNotificationDelivery.js', 'utf8');
  // Re-derived on every attempt: a retry hours later must reach the same
  // conclusion as the original save.
  assert.match(delivery, /owner: details\.assignedAgent/);
  // Personal phones stay off ordinary storefront enquiries.
  assert.match(delivery, /details\.source === 'adwords_lp' \? audience\.whatsapp : \[\]/);
});
