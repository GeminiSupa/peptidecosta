import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailFromLead,
  leadSubscriberCandidates,
  normalizeCampaignEmail,
} from '../src/lib/campaignAudience.mjs';

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
