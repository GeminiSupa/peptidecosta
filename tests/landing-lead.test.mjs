import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildLandingLeadPayload,
  hasLandingQualification,
  landingQualificationNotes,
  normalizeLandingQualification,
  normalizeStructuredAnswers,
} from '../src/lib/landingLead.mjs';
import {
  DEFAULT_LANDING_LEAD_SETTINGS,
  normalizeLandingLeadSettings,
} from '../src/lib/landingLeadSettings.mjs';
import { mergeLeadEmailRecipients, responseDeadline } from '../src/lib/leadNotifications.mjs';

test('landing payload joins the optional surname and preserves campaign attribution', () => {
  const payload = buildLandingLeadPayload({
    form: {
      firstName: ' Jane ',
      lastName: ' Doe ',
      email: ' JANE@EXAMPLE.COM ',
      phone: '+506 8888-7777',
      alternatePhone: '+1 831 555 0100',
      consent: true,
    },
    answers: {
      category: { id: 'recovery', label: 'Recovery and healing' },
      location: { id: 'cr', label: 'Costa Rica' },
      volume: { id: '5-9', label: '5–9 vials' },
      language: { id: 'en', label: 'English' },
    },
    questions: DEFAULT_LANDING_LEAD_SETTINGS.questions,
    language: 'es',
    source: 'meta_lp',
    utm: { utm_source: 'meta', utm_medium: 'paid', utm_campaign: 'recovery-cr' },
    consentText: 'Acepto el seguimiento.',
    consentVersion: '2026-08',
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
    qualification_data: {
      answers: [
        { questionId: 'category', question: '¿Qué está investigando?', optionId: 'recovery', answer: 'Recovery and healing' },
        { questionId: 'location', question: '¿Dónde necesita entrega?', optionId: 'cr', answer: 'Costa Rica' },
        { questionId: 'volume', question: '¿Qué volumen está considerando?', optionId: '5-9', answer: '5–9 vials' },
        { questionId: 'language', question: '¿En qué idioma debemos responder?', optionId: 'en', answer: 'English' },
      ],
    },
    marketing_consent: true,
    consent_text: 'Acepto el seguimiento.',
    consent_version: '2026-08',
    source: 'meta_lp',
    utm_source: 'meta',
    utm_medium: 'paid',
    utm_campaign: 'recovery-cr',
  });
});

test('editable lead settings retain bilingual custom questions and safe operating limits', () => {
  const settings = normalizeLandingLeadSettings({
    responseSlaMinutes: 1,
    scrollTriggerPct: 200,
    questions: [{
      id: 'budget', titleEn: 'Budget?', titleEs: '¿Presupuesto?',
      options: [{ id: 'open', labelEn: 'Open', labelEs: 'Abierto' }],
    }],
  });
  assert.equal(settings.responseSlaMinutes, 5);
  assert.equal(settings.scrollTriggerPct, 95);
  assert.equal(settings.questions[0].id, 'budget');
  assert.equal(settings.questions[0].options[0].labelEs, 'Abierto');
});

test('structured qualification input is bounded and strips invalid rows', () => {
  assert.deepEqual(normalizeStructuredAnswers({ answers: [
    { questionId: 'budget', question: 'Budget?', optionId: 'open', answer: 'Open' },
    { question: '', answer: 'Ignored' },
  ] }), { answers: [{ questionId: 'budget', question: 'Budget?', optionId: 'open', answer: 'Open' }] });
});

test('lead alerts dedupe the assigned agent and backup while SLA is deterministic', () => {
  assert.deepEqual(mergeLeadEmailRecipients({
    assignedAgentEmail: 'agent@example.com',
    backup: ['AGENT@example.com', 'owner@example.com'],
  }), ['agent@example.com', 'owner@example.com']);
  assert.equal(responseDeadline('2026-08-13T12:00:00.000Z', 15), '2026-08-13T12:15:00.000Z');
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
  assert.match(page, /leadSettings\.timeTriggerMs/);
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
  assert.match(route, /assign_next_landing_lead_agent/);
  assert.match(route, /qualification_data/);
  assert.match(route, /response_due_at/);
});

test('admin editor supports adding, removing, reordering, and publishing questions', async () => {
  const editor = await readFile(new URL('../src/components/admin/LandingLeadSettingsManager.js', import.meta.url), 'utf8');
  assert.match(editor, /addQuestion/);
  assert.match(editor, /removeQuestion/);
  assert.match(editor, /moveQuestion/);
  assert.match(editor, /Publish lead form/);
  assert.match(editor, /lead_landing_page|LANDING_LEAD_SETTINGS_ID/);
});
