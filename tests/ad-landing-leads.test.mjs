import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  adLandingPageLabel,
  chatwootNeedsAttention,
  chatwootStatusView,
  isAdLandingLead,
} from '../src/lib/adLandingLeads.mjs';
import { chatwootLeadColumns } from '../src/lib/chatwootLead.mjs';
import { leadPhone } from '../src/lib/leadContact.mjs';

// The 2026-09-17 test leads, as the notes were really written.
const GLP1_NOTE = 'Contáctenos form (glp1_lp)\nName: Omer CW Test - 2\nEmail: omercwt2@test.com\nPhone (WhatsApp/SMS): 016161985298';

test('both Google Ads pages count as ad leads, /glp-1 included', () => {
  assert.equal(isAdLandingLead({ lead_source: 'adwords_lp' }), true);
  assert.equal(isAdLandingLead({ lead_source: 'glp1_lp' }), true);
  // Older rows only name the page in the note.
  assert.equal(isAdLandingLead({ notes: GLP1_NOTE }), true);
  assert.equal(isAdLandingLead({ lead_source: 'contact_form' }), false);
  assert.equal(isAdLandingLead({ lead_source: 'live_chat' }), false);
  assert.equal(adLandingPageLabel({ lead_source: 'glp1_lp' }), '/glp-1');
  assert.equal(adLandingPageLabel({ lead_source: 'adwords_lp' }), '/lp');
});

test('the Leads tab Google Ads filter uses the shared check', () => {
  const screen = fs.readFileSync('src/components/admin/LeadsManager.js', 'utf8');
  assert.match(screen, /leadsSourceFilter === 'adwords' && !\(\s*isGoogleAdsLead\(l\)/);
  assert.match(screen, /<ChatwootLeadsPanel/);
});

test('the phone is read from the landing-page note label', () => {
  assert.equal(leadPhone({ contact_value: 'omercwt2@test.com', notes: GLP1_NOTE }), '016161985298');
});

test('each delivery outcome is saved as a status the Leads tab can show', () => {
  const at = '2026-09-17T08:00:00.000Z';
  assert.deepEqual(
    chatwootLeadColumns({ configured: true, sent: true, conversationUrl: 'https://c/x/1' }, { at }),
    { chatwoot_status: 'sent', chatwoot_error: null, chatwoot_conversation_url: 'https://c/x/1', chatwoot_synced_at: at },
  );
  assert.equal(chatwootLeadColumns({ configured: true, sent: false, error: 'Phone number should be in e164 format' }).chatwoot_status, 'failed');
  assert.equal(chatwootLeadColumns({ configured: true, sent: false, error: 'boom' }).chatwoot_error, 'boom');
  assert.equal(chatwootLeadColumns({ configured: true, sent: true, assignmentError: 'No Chatwoot agent uses x' }).chatwoot_status, 'unassigned');
  assert.equal(chatwootLeadColumns({ configured: false, sent: false }).chatwoot_status, 'not_configured');
  assert.equal(chatwootLeadColumns(null, { enabled: false }).chatwoot_status, 'off');
});

test('failed and unassigned chats are flagged; the rest are not', () => {
  assert.equal(chatwootStatusView({ chatwoot_status: 'failed', chatwoot_error: 'x' }).text, 'Chat NOT created');
  assert.equal(chatwootNeedsAttention({ chatwoot_status: 'failed' }), true);
  assert.equal(chatwootNeedsAttention({ chatwoot_status: 'unassigned' }), true);
  assert.equal(chatwootNeedsAttention({ chatwoot_status: 'not_configured' }), true);
  assert.equal(chatwootNeedsAttention({ chatwoot_status: 'sent' }), false);
  assert.equal(chatwootNeedsAttention({ chatwoot_status: 'off' }), false);
  // Leads from before tracking are not a false alarm.
  assert.equal(chatwootNeedsAttention({}), false);
});

test('the lead route saves the Chatwoot result on the lead', () => {
  const route = fs.readFileSync('src/app/api/leads/contact/route.js', 'utf8');
  assert.match(route, /chatwootLeadColumns\(chatwootResult, \{ enabled: chatwootEnabled \}\)/);
  assert.ok(fs.existsSync('add-chatwoot-status-to-leads.sql'));
});
