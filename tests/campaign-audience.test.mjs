import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailFromLead,
  leadSubscriberCandidates,
  normalizeCampaignEmail,
  resolveCampaignAudience,
} from '../src/lib/campaignAudience.mjs';

test('an unsaved "Subscribers + CRM leads" pick beats the saved campaign row', () => {
  const saved = { include_leads: false, target_tags: null };

  assert.deepEqual(resolveCampaignAudience(saved, { includeLeads: true, targetTags: null }), {
    includeLeads: true,
    targetTags: null,
    changed: true,
  });
});

test('falls back to the saved audience when the sender passes none', () => {
  const saved = { include_leads: true, target_tags: ['vip'] };

  assert.deepEqual(resolveCampaignAudience(saved, null), {
    includeLeads: true,
    targetTags: ['vip'],
    changed: false,
  });
  assert.deepEqual(resolveCampaignAudience(saved, {}), {
    includeLeads: true,
    targetTags: ['vip'],
    changed: false,
  });
});

test('an empty audience tag means everyone, not a segment of nobody', () => {
  const saved = { include_leads: true, target_tags: ['leads_7_days'] };

  assert.deepEqual(resolveCampaignAudience(saved, { includeLeads: true, targetTags: [] }), {
    includeLeads: true,
    targetTags: null,
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
