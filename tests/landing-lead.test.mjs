import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildLandingLeadPayload,
  hasLandingQualification,
  landingQualificationNotes,
  normalizeLandingQualification,
} from '../src/lib/landingLead.mjs';

test('landing payload joins the optional surname and preserves campaign attribution', () => {
  const payload = buildLandingLeadPayload({
    form: {
      firstName: ' Jane ',
      lastName: ' Doe ',
      email: ' JANE@EXAMPLE.COM ',
      phone: '+506 8888-7777',
      alternatePhone: '+1 831 555 0100',
    },
    answers: {
      category: 'Recovery and healing',
      location: 'Costa Rica',
      volume: '5–9 vials',
      language: 'en',
    },
    language: 'es',
    source: 'meta_lp',
    utm: { utm_source: 'meta', utm_medium: 'paid', utm_campaign: 'recovery-cr' },
  });

  assert.deepEqual(payload, {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+506 8888-7777',
    alternate_phone: '+1 831 555 0100',
    language: 'es',
    preferred_reply_language: 'en',
    category: 'Recovery and healing',
    location: 'Costa Rica',
    volume: '5–9 vials',
    source: 'meta_lp',
    utm_source: 'meta',
    utm_medium: 'paid',
    utm_campaign: 'recovery-cr',
  });
});

test('qualification details are formatted for an agent-readable CRM note', () => {
  const qualification = normalizeLandingQualification({
    category: 'Longevity',
    location: 'United States',
    volume: '10+ vials',
    preferred_reply_language: 'en',
    alternate_phone: '+1 (831) 555-0100 ext bad',
  });

  assert.equal(hasLandingQualification(qualification), true);
  assert.deepEqual(landingQualificationNotes(qualification), [
    'Research interest: Longevity',
    'Delivery location: United States',
    'Estimated volume: 10+ vials',
    'Preferred reply language: English',
    'Alternate contact number: +1 (831) 555-0100',
  ]);
});

test('landing page is first-party lead capture with no messaging handoff', async () => {
  const page = await readFile(new URL('../src/app/landing/page.js', import.meta.url), 'utf8');

  assert.match(page, /fetch\('\/api\/leads\/contact'/);
  assert.match(page, /timer-5000ms/);
  assert.match(page, /generate_lead/);
  assert.doesNotMatch(page, /wa\.me|buildWhatsAppLink|messagingChannel/);
});

test('CRM route stores qualification notes and sends the alert only after save', async () => {
  const route = await readFile(new URL('../src/app/api/leads/contact/route.js', import.meta.url), 'utf8');
  const saveIndex = route.indexOf('if (error) throw error;');
  const alertIndex = route.indexOf('await sendLandingLeadAlert');

  assert.ok(saveIndex >= 0);
  assert.ok(alertIndex > saveIndex);
  assert.match(route, /landingQualificationNotes\(qualification\)/);
  assert.match(route, /getTransactionalSmtpConfig\(\)/);
});
