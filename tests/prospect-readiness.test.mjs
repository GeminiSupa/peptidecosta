import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  matchesProspectReadiness,
  presentProspect,
  prospectContactReadiness,
} from '../src/lib/prospectReadiness.mjs';

const emailReady = {
  organization_name: 'Strong Gym',
  category: 'fitness centre',
  website_url: 'https://strong.example/',
  city: 'San José',
  email: 'sales@strong.example',
  email_permission_status: 'business_contact',
  email_permission_basis: 'published_business_contact',
  email_permission_source_url: 'https://strong.example/contact',
  whatsapp_permission_status: 'unknown',
};

test('readiness reports the exact usable channel independently', () => {
  const readiness = prospectContactReadiness(emailReady);
  assert.equal(readiness.status, 'ready');
  assert.deepEqual(readiness.readyChannels, ['email']);
  assert.equal(readiness.channels.email.status, 'ready');
  assert.equal(readiness.channels.whatsapp.status, 'needs_verification');
  assert.equal(matchesProspectReadiness(emailReady, 'email_ready'), true);
  assert.equal(matchesProspectReadiness(emailReady, 'whatsapp_ready'), false);
});

test('having an address without evidence is not contact readiness', () => {
  const prospect = { email: 'hello@example.test', email_permission_status: 'unknown' };
  const readiness = prospectContactReadiness(prospect);
  assert.equal(readiness.status, 'needs_verification');
  assert.equal(readiness.readyChannels.length, 0);
});

test('global do-not-contact blocks every channel', () => {
  const readiness = prospectContactReadiness({ ...emailReady, status: 'do_not_contact' });
  assert.equal(readiness.status, 'blocked');
  assert.equal(readiness.channels.email.status, 'blocked');
  assert.equal(readiness.channels.whatsapp.status, 'blocked');
});

test('API presentation recomputes derived fit and readiness fields', () => {
  const result = presentProspect({
    ...emailReady,
    fit_score: 100,
    fit_reasons: ['Stale score'],
  });
  assert.equal(result.fit_score, 70);
  assert.ok(!result.fit_reasons.includes('Stale score'));
  assert.equal(result.contact_readiness, 'ready');
  assert.deepEqual(result.contact_ready_channels, ['email']);
});
