import assert from 'node:assert/strict';
import test from 'node:test';

import {
  eligibleRotationAgents,
  pickNextRotationAgent,
  resolveRotationAgent,
  LANDING_ROTATION_SETTING_ID,
} from '../src/lib/leadRotation.mjs';
import { normalizeLandingLeadSettings } from '../src/lib/landingLeadSettings.mjs';

const agent = (name, email, extra = {}) => ({ name, email, status: 'active', permissions: ['leads'], ...extra });
const PROFILES = [
  agent('Dani', 'elainedrb@gmail.com'),
  agent('Pollita', 'Camilledankers11@gmail.com'),
  agent('Korinne', 'korinneda@icloud.com'),
  agent('Gone', 'gone@example.com', { status: 'inactive' }),
  agent('Webster', 'info@peptidescostarica.net', { permissions: ['orders'] }),
];

test('rotation keeps the admin order and skips inactive or non-lead profiles', () => {
  const agents = eligibleRotationAgents(PROFILES, [
    'korinneda@icloud.com', 'gone@example.com', 'CAMILLEDANKERS11@gmail.com',
    'info@peptidescostarica.net', 'nobody@example.com', 'korinneda@icloud.com',
  ]);
  assert.deepEqual(agents.map((entry) => entry.name), ['Korinne', 'Pollita']);
  assert.equal(agents[1].email, 'camilledankers11@gmail.com');
});

test('the next agent wraps around and starts at the top when the pointer is unknown', () => {
  const agents = eligibleRotationAgents(PROFILES, ['elainedrb@gmail.com', 'camilledankers11@gmail.com', 'korinneda@icloud.com']);
  assert.equal(pickNextRotationAgent(agents, '').name, 'Dani');
  assert.equal(pickNextRotationAgent(agents, 'elainedrb@gmail.com').name, 'Pollita');
  assert.equal(pickNextRotationAgent(agents, 'korinneda@icloud.com').name, 'Dani');
  assert.equal(pickNextRotationAgent(agents, 'removed@example.com').name, 'Dani');
  assert.equal(pickNextRotationAgent([], ''), null);
});

function fakeSupabase(profiles) {
  const settings = new Map();
  return {
    settings,
    from(table) {
      if (table === 'admin_profiles') return { select: async () => ({ data: profiles, error: null }) };
      let id;
      const query = {
        select: () => query,
        eq: (_column, value) => { id = value; return query; },
        maybeSingle: async () => ({ data: settings.has(id) ? { value: settings.get(id) } : null }),
        upsert: async (row) => { settings.set(row.id, row.value); return { error: null }; },
      };
      return query;
    },
  };
}

test('consecutive leads take turns and the pointer is saved', async () => {
  const supabase = fakeSupabase(PROFILES);
  const settings = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    rotationAgentEmails: ['elainedrb@gmail.com', 'camilledankers11@gmail.com', 'korinneda@icloud.com'],
  });
  const names = [];
  for (let i = 0; i < 4; i += 1) names.push((await resolveRotationAgent(supabase, settings)).name);
  assert.deepEqual(names, ['Dani', 'Pollita', 'Korinne', 'Dani']);
  assert.equal(supabase.settings.get(LANDING_ROTATION_SETTING_ID).lastAgentEmail, 'elainedrb@gmail.com');
});

test('rotation does nothing unless it is the chosen mode and has agents', async () => {
  const supabase = fakeSupabase(PROFILES);
  assert.equal(await resolveRotationAgent(supabase, normalizeLandingLeadSettings({ assignmentMode: 'fixed' })), null);
  assert.equal(await resolveRotationAgent(supabase, normalizeLandingLeadSettings({ assignmentMode: 'rotation' })), null);
  assert.equal(supabase.settings.size, 0);
});

test('settings keep rotation, and the retired round_robin value stays unassigned', () => {
  const rotation = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    rotationAgentEmails: [' Dani@Example.com ', 'dani@example.com', ''],
  });
  assert.equal(rotation.assignmentMode, 'rotation');
  assert.deepEqual(rotation.rotationAgentEmails, ['dani@example.com']);
  assert.equal(normalizeLandingLeadSettings({ assignmentMode: 'round_robin' }).assignmentMode, 'unassigned');
  assert.deepEqual(normalizeLandingLeadSettings({}).rotationAgentEmails, []);
});

test('only a superadmin changes the rotation, from Team > Notification Settings', async () => {
  const { readFile } = await import('node:fs/promises');
  const [api, team] = await Promise.all([
    readFile(new URL('../src/app/api/admin/notification-recipients/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/admin/TeamManagement.js', import.meta.url), 'utf8'),
  ]);
  const patch = api.slice(api.indexOf('export async function PATCH'));
  assert.match(patch, /verifyAdminSession\(request, \{ requireSuperadmin: true \}\)/);
  assert.ok(patch.indexOf('requireSuperadmin') < patch.indexOf('body.leadRotation'));
  assert.match(api, /leadRotation/);
  assert.match(team, /Share ad leads between agents/);
  assert.match(team, /body: JSON\.stringify\(\{ leadRotation: next \}\)/);
});
