import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailFromLead,
  leadSubscriberCandidates,
  normalizeAudienceScope,
  normalizeCampaignEmail,
  resolveCampaignAudience,
  scopeIncludesLeads,
  scopeIncludesSubscribers,
  subscriberMatchesScope,
} from '../src/lib/campaignAudience.mjs';

test('an unsaved "Subscribers + CRM leads" pick beats the saved campaign row', () => {
  const saved = { include_leads: false, target_tags: null };

  assert.deepEqual(resolveCampaignAudience(saved, { includeLeads: true, targetTags: null }), {
    scope: 'all',
    includeLeads: true,
    targetTags: null,
    behaviorFilter: 'none',
    changed: true,
  });
});

test('falls back to the saved audience when the sender passes none', () => {
  const saved = { include_leads: true, target_tags: ['vip'] };

  assert.deepEqual(resolveCampaignAudience(saved, null), {
    scope: 'all',
    includeLeads: true,
    targetTags: ['vip'],
    behaviorFilter: 'none',
    changed: false,
  });
  assert.deepEqual(resolveCampaignAudience(saved, {}), {
    scope: 'all',
    includeLeads: true,
    targetTags: ['vip'],
    behaviorFilter: 'none',
    changed: false,
  });
});

test('an empty audience tag means everyone, not a segment of nobody', () => {
  const saved = { include_leads: true, target_tags: ['leads_7_days'] };

  assert.deepEqual(resolveCampaignAudience(saved, { includeLeads: true, targetTags: [] }), {
    scope: 'all',
    includeLeads: true,
    targetTags: null,
    behaviorFilter: 'none',
    changed: true,
  });
});

test('re-sending the same audience needs no campaign write', () => {
  const saved = { include_leads: true, target_tags: ['vip'] };

  assert.equal(resolveCampaignAudience(saved, { includeLeads: true, targetTags: ['vip'] }).changed, false);
});

test('normalizes valid campaign emails and rejects phone contacts', () => {
  assert.equal(normalizeCampaignEmail(' Person@Example.COM '), 'person@example.com');
  assert.equal(normalizeCampaignEmail('+506 8888-7777'), null);
});

test('finds a lead email in dedicated fields, contact value, or CRM notes', () => {
  assert.equal(emailFromLead({ email: 'direct@example.com' }), 'direct@example.com');
  assert.equal(emailFromLead({ contact_value: 'CONTACT@example.com' }), 'contact@example.com');
  assert.equal(emailFromLead({ contact_value: '50688887777', notes: 'Name: Ana\nEmail: ana@example.com' }), 'ana@example.com');
});

test('deduplicates leads and never re-adds an existing unsubscribed address', () => {
  const candidates = leadSubscriberCandidates([
    { id: '1', contact_value: 'new@example.com', name: 'Ana Solano', tags: ['vip'] },
    { id: '2', email: 'NEW@example.com', tags: ['catalog'] },
    { id: '3', contact_value: 'opted-out@example.com' },
  ], [
    { email: 'opted-out@example.com', status: 'unsubscribed' },
  ]);

  assert.deepEqual(candidates, [{
    id: 'lead:1',
    email: 'new@example.com',
    first_name: 'Ana',
    last_name: 'Solano',
    tags: ['crm_lead', 'vip', 'catalog'],
    source: 'crm_lead',
    status: 'subscribed',
  }]);
});

test('three recipient groups resolve from the scope, not the old boolean', () => {
  assert.equal(normalizeAudienceScope('subscribers'), 'subscribers');
  assert.equal(normalizeAudienceScope('leads'), 'leads');
  assert.equal(normalizeAudienceScope('all'), 'all');
  assert.equal(scopeIncludesLeads('subscribers'), false);
  assert.equal(scopeIncludesLeads('leads'), true);
  assert.equal(scopeIncludesLeads('all'), true);
  assert.equal(scopeIncludesSubscribers('leads'), false);
  assert.equal(scopeIncludesSubscribers('all'), true);
});

test('a campaign saved before the scope column falls back to its boolean', () => {
  assert.equal(normalizeAudienceScope(undefined, true), 'all');
  assert.equal(normalizeAudienceScope(undefined, false), 'subscribers');
  assert.equal(normalizeAudienceScope(null, true), 'all');
  // Nonsense never silently widens the audience.
  assert.equal(normalizeAudienceScope('everyone', false), 'subscribers');
});

test('picking "CRM leads only" is carried through and persisted', () => {
  const saved = { include_leads: false, target_tags: null };
  const resolved = resolveCampaignAudience(saved, { scope: 'leads', targetTags: null });

  assert.equal(resolved.scope, 'leads');
  assert.equal(resolved.includeLeads, true, 'leads must still be copied into subscribers');
  assert.equal(resolved.changed, true);
});

test('an old campaign row keeps sending to everyone, not just subscribers', () => {
  const legacy = { include_leads: true, target_tags: null };
  assert.deepEqual(resolveCampaignAudience(legacy, null), {
    scope: 'all',
    includeLeads: true,
    targetTags: null,
    behaviorFilter: 'none',
    changed: false,
  });
});

test('re-sending the same scope needs no campaign write', () => {
  const saved = { audience_scope: 'leads', include_leads: true, target_tags: null };
  assert.equal(resolveCampaignAudience(saved, { scope: 'leads', targetTags: null }).changed, false);
});

test('the four groups slice the subscriber table correctly', () => {
  const signup = { email: 'ana@example.com', source: 'catalog_gate' };
  const copiedLead = { email: 'lead@example.com', source: 'crm_lead' };
  // Signed up through a form AND present in the lead table.
  const both = { email: 'both@example.com', source: 'newsletter_form' };

  // subscribers: genuine signups only
  assert.equal(subscriberMatchesScope(signup, 'subscribers', false), true);
  assert.equal(subscriberMatchesScope(both, 'subscribers', true), true);
  assert.equal(subscriberMatchesScope(copiedLead, 'subscribers', true), false);

  // non_subscribers: only rows copied in from the lead table
  assert.equal(subscriberMatchesScope(copiedLead, 'non_subscribers', true), true);
  assert.equal(subscriberMatchesScope(signup, 'non_subscribers', false), false);
  assert.equal(subscriberMatchesScope(both, 'non_subscribers', true), false);

  // leads: anyone whose address is in the lead table, however they got here
  assert.equal(subscriberMatchesScope(copiedLead, 'leads', true), true);
  assert.equal(subscriberMatchesScope(both, 'leads', true), true);
  assert.equal(subscriberMatchesScope(signup, 'leads', false), false);

  // all: everyone
  for (const person of [signup, copiedLead, both]) {
    assert.equal(subscriberMatchesScope(person, 'all', true), true);
  }
});

test('"subscribers only" cannot drift once leads are copied in', () => {
  // The bug this guards: after any campaign that included leads, the subscriber
  // table holds both, and a naive "everyone subscribed" read would mail all.
  const copiedLead = { email: 'lead@example.com', source: 'crm_lead', status: 'subscribed' };
  assert.equal(subscriberMatchesScope(copiedLead, 'subscribers', false), false);
});

test('every lead-derived group triggers the lead copy', () => {
  assert.equal(scopeIncludesLeads('non_subscribers'), true);
  assert.equal(scopeIncludesLeads('leads'), true);
  assert.equal(scopeIncludesLeads('all'), true);
  assert.equal(scopeIncludesLeads('subscribers'), false);
});

test('non_subscribers survives a round trip through the scope resolver', () => {
  const saved = { audience_scope: 'subscribers', include_leads: false, target_tags: null };
  const resolved = resolveCampaignAudience(saved, { scope: 'non_subscribers', targetTags: null });
  assert.equal(resolved.scope, 'non_subscribers');
  assert.equal(resolved.includeLeads, true);
  assert.equal(resolved.changed, true);
});
