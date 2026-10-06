import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LANDING_LEAD_SETTINGS,
  normalizeLandingLeadSettings,
} from '../src/lib/landingLeadSettings.mjs';
import { pickNextRotationAgent, rotationAgentEmailsFor } from '../src/lib/leadRotation.mjs';

/**
 * Google Ads (/lp, /glp-1) and TikTok used to share one "Share ad leads
 * between agents" switch, so turning the rotation off for Google Ads - because
 * Chatwoot hands those chats out now - silently stopped TikTok assigning too.
 * They are two switches now. These tests pin the part that is easy to break:
 * a settings row saved before the split must keep assigning exactly as it did.
 */

test('a settings row saved before the split still assigns both sources', () => {
  const settings = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    rotationAgentEmails: ['a@example.com', 'b@example.com'],
  });
  assert.equal(settings.rotationAppliesToGoogleAds, true);
  assert.equal(settings.rotationAppliesToTikTok, true);
});

test('both sources default to on', () => {
  assert.equal(DEFAULT_LANDING_LEAD_SETTINGS.rotationAppliesToGoogleAds, true);
  assert.equal(DEFAULT_LANDING_LEAD_SETTINGS.rotationAppliesToTikTok, true);
});

test('turning Google Ads off leaves TikTok on', () => {
  const settings = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    rotationAppliesToGoogleAds: false,
  });
  assert.equal(settings.rotationAppliesToGoogleAds, false);
  assert.equal(settings.rotationAppliesToTikTok, true, 'TikTok must not be switched off with Google Ads');
});

test('turning TikTok off leaves Google Ads on', () => {
  const settings = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    rotationAppliesToTikTok: false,
  });
  assert.equal(settings.rotationAppliesToTikTok, false);
  assert.equal(settings.rotationAppliesToGoogleAds, true);
});

test('the rotation agent list survives switching a source off', () => {
  // The list is what makes the switch reversible in one click; losing it would
  // mean re-ticking six agents to turn the rotation back on.
  const settings = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    rotationAgentEmails: ['a@example.com', 'b@example.com'],
    rotationAppliesToGoogleAds: false,
  });
  assert.deepEqual(settings.rotationAgentEmails, ['a@example.com', 'b@example.com']);
});

/**
 * Mirrors what the admin screen sends and what the save route does with it,
 * so a save that names one switch can never move the other.
 */
function applySave(settings, body) {
  const googleAdsAgentEmails = Array.isArray(body.googleAdsAgentEmails)
    ? body.googleAdsAgentEmails
    : settings.googleAdsAgentEmails;
  const tiktokAgentEmails = Array.isArray(body.tiktokAgentEmails)
    ? body.tiktokAgentEmails
    : settings.tiktokAgentEmails;
  const googleAds = typeof body.googleAds === 'boolean' ? body.googleAds : settings.rotationAppliesToGoogleAds;
  const tiktok = typeof body.tiktok === 'boolean' ? body.tiktok : settings.rotationAppliesToTikTok;
  const legacyEnabled = typeof body.enabled === 'boolean'
    && typeof body.googleAds !== 'boolean'
    && typeof body.tiktok !== 'boolean'
    ? body.enabled
    : null;
  const appliesToGoogleAds = legacyEnabled === null ? googleAds : legacyEnabled;
  const appliesToTikTok = legacyEnabled === null ? tiktok : legacyEnabled;
  const enabled = appliesToGoogleAds || appliesToTikTok;
  return normalizeLandingLeadSettings({
    ...settings,
    assignmentMode: enabled ? 'rotation' : (settings.assignmentMode === 'rotation' ? 'unassigned' : settings.assignmentMode),
    rotationAppliesToGoogleAds: appliesToGoogleAds,
    rotationAppliesToTikTok: appliesToTikTok,
    googleAdsAgentEmails,
    tiktokAgentEmails,
  });
}

const live = () => normalizeLandingLeadSettings({
  assignmentMode: 'rotation',
  rotationAgentEmails: ['a@example.com'],
});

test('saving Google Ads off keeps the rotation running for TikTok', () => {
  const next = applySave(live(), { enabled: true, googleAds: false, tiktok: true });
  assert.equal(next.rotationAppliesToGoogleAds, false);
  assert.equal(next.rotationAppliesToTikTok, true);
  assert.equal(next.assignmentMode, 'rotation', 'TikTok still needs the rotation configured');
});

test('switching both off leaves new leads unassigned', () => {
  const next = applySave(live(), { enabled: false, googleAds: false, tiktok: false });
  assert.equal(next.assignmentMode, 'unassigned');
});

test('switching one back on restarts the rotation', () => {
  const off = applySave(live(), { googleAds: false, tiktok: false });
  const back = applySave(off, { googleAds: true });
  assert.equal(back.assignmentMode, 'rotation');
  assert.equal(back.rotationAppliesToGoogleAds, true);
  assert.equal(back.rotationAppliesToTikTok, false);
});

test('an older admin bundle sending only `enabled` still moves both', () => {
  const next = applySave(live(), { enabled: false });
  assert.equal(next.rotationAppliesToGoogleAds, false);
  assert.equal(next.rotationAppliesToTikTok, false);
  assert.equal(next.assignmentMode, 'unassigned');
});

test('saving only the agent list moves neither switch', () => {
  const start = applySave(live(), { googleAds: false });
  const next = applySave(start, { agentEmails: ['c@example.com'] });
  assert.equal(next.rotationAppliesToGoogleAds, false, 'Google Ads must stay off');
  assert.equal(next.rotationAppliesToTikTok, true, 'TikTok must stay on');
});


/* Each source keeps its own agent list, which is the half that is easy to
   regress back into one shared list. */

test('a row saved before the split seeds both lists with the shared agents', () => {
  const settings = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    rotationAgentEmails: ['a@example.com', 'b@example.com'],
  });
  assert.deepEqual(settings.googleAdsAgentEmails, ['a@example.com', 'b@example.com']);
  assert.deepEqual(settings.tiktokAgentEmails, ['a@example.com', 'b@example.com']);
});

test('unticking everyone for one source is kept, not re-seeded', () => {
  // An empty list that was actually saved means "nobody". Re-seeding it from
  // the old shared list would silently put the agents back.
  const settings = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    rotationAgentEmails: ['a@example.com'],
    googleAdsAgentEmails: [],
  });
  assert.deepEqual(settings.googleAdsAgentEmails, []);
  assert.deepEqual(settings.tiktokAgentEmails, ['a@example.com']);
});

test('ticking an agent for Google Ads does not change the TikTok list', () => {
  const start = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    googleAdsAgentEmails: ['a@example.com'],
    tiktokAgentEmails: ['b@example.com'],
  });
  const next = applySave(start, { googleAdsAgentEmails: ['a@example.com', 'c@example.com'] });
  assert.deepEqual(next.googleAdsAgentEmails, ['a@example.com', 'c@example.com']);
  assert.deepEqual(next.tiktokAgentEmails, ['b@example.com'], 'TikTok list must not move');
});

test('ticking an agent for TikTok does not change the Google Ads list', () => {
  const start = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    googleAdsAgentEmails: ['a@example.com'],
    tiktokAgentEmails: ['b@example.com'],
  });
  const next = applySave(start, { tiktokAgentEmails: [] });
  assert.deepEqual(next.googleAdsAgentEmails, ['a@example.com'], 'Google Ads list must not move');
  assert.deepEqual(next.tiktokAgentEmails, []);
});

test('each source reads its own list', () => {
  const settings = normalizeLandingLeadSettings({
    assignmentMode: 'rotation',
    googleAdsAgentEmails: ['a@example.com'],
    tiktokAgentEmails: ['b@example.com'],
  });
  assert.deepEqual(rotationAgentEmailsFor(settings, 'googleAds'), ['a@example.com']);
  assert.deepEqual(rotationAgentEmailsFor(settings, 'tiktok'), ['b@example.com']);
  assert.deepEqual(rotationAgentEmailsFor(settings), ['a@example.com'], 'Google Ads is the default');
});

test('the two rotations keep separate places in their lists', () => {
  // One shared pointer meant a TikTok lead pushed the Google Ads rotation on a
  // step, so an agent could be skipped without a lead ever reaching them.
  const agents = [
    { name: 'A', email: 'a@example.com' },
    { name: 'B', email: 'b@example.com' },
    { name: 'C', email: 'c@example.com' },
  ];
  const cursor = { lastAgentEmail: 'a@example.com', lastAgentEmailTiktok: 'c@example.com' };
  assert.equal(pickNextRotationAgent(agents, cursor.lastAgentEmail).email, 'b@example.com');
  assert.equal(pickNextRotationAgent(agents, cursor.lastAgentEmailTiktok).email, 'a@example.com');
});
