import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  isAuthorizedTikTokLeadPost,
  leadNotificationEmailSubject,
  normalizeTikTokLeadPost,
  TIKTOK_ASSIGNEE_EMAIL,
  TIKTOK_LEAD_EMAIL_SUBJECT,
  TIKTOK_LEAD_SOURCE,
  tikTokSubmissionRef,
} from '../src/lib/tiktokLeadPosting.mjs';

test('normalizes the documented TikTok connector payload', () => {
  const lead = normalizeTikTokLeadPost({
    lead_id: 'tt-123',
    first_name: 'María',
    last_name: 'Rodríguez',
    email: ' MARIA@EXAMPLE.COM ',
    phone_number: '+506 8888-1234',
    language: 'en-US',
    campaign_id: 'campaign-1',
    form_name: 'Catalog form',
    marketing_consent: 'accepted',
    whatsapp_consent: 'yes',
    answers: {
      'Research interest': 'Weight management',
      'Estimated volume': '5-9 vials',
    },
  });

  assert.equal(lead.externalLeadId, 'tt-123');
  assert.equal(lead.name, 'María Rodríguez');
  assert.equal(lead.email, 'maria@example.com');
  assert.equal(lead.phone, '+506 8888-1234');
  assert.equal(lead.language, 'en');
  assert.equal(lead.campaign, 'campaign-1');
  assert.equal(lead.marketingConsent, true);
  assert.equal(lead.whatsappConsent, true);
  assert.deepEqual(lead.answers.map(({ question, answer }) => ({ question, answer })), [
    { question: 'Research interest', answer: 'Weight management' },
    { question: 'Estimated volume', answer: '5-9 vials' },
  ]);
});

test('accepts connector aliases and safely ignores object-shaped scalar fields', () => {
  const lead = normalizeTikTokLeadPost({
    externalId: 'tt-456',
    name: 'Ana',
    phoneNumber: '88881234',
    campaignName: { unexpected: true },
    formId: 'form-2',
    customFields: [
      { name: 'location', label: 'Delivery location', values: ['Costa Rica'] },
    ],
  });

  assert.equal(lead.externalLeadId, 'tt-456');
  assert.equal(lead.campaignName, '');
  assert.equal(lead.campaign, 'form-2');
  assert.deepEqual(lead.answers[0], {
    questionId: 'location',
    question: 'Delivery location',
    answer: 'Costa Rica',
  });
});

test('external IDs are constrained to a safe idempotency key', () => {
  assert.equal(
    normalizeTikTokLeadPost({ lead_id: 'tt-123_% unsafe', email: 'a@example.com' }).externalLeadId,
    'tt-123unsafe',
  );
});

test('bearer authentication fails closed and compares the full credential', () => {
  const secret = 'a-long-random-posting-secret';
  assert.equal(isAuthorizedTikTokLeadPost(`Bearer ${secret}`, secret), true);
  assert.equal(isAuthorizedTikTokLeadPost(secret, secret), true);
  assert.equal(isAuthorizedTikTokLeadPost('Bearer wrong', secret), false);
  assert.equal(isAuthorizedTikTokLeadPost(`Bearer ${secret}`, ''), false);
});

test('TikTok notifications use the requested exact subject and attribution', () => {
  assert.equal(TIKTOK_LEAD_SOURCE, 'tiktok_form');
  assert.equal(TIKTOK_ASSIGNEE_EMAIL, 'surfyesi@hotmail.com');
  assert.equal(TIKTOK_LEAD_EMAIL_SUBJECT, 'New Lead From TikTok Forms');
  assert.equal(
    leadNotificationEmailSubject(TIKTOK_LEAD_SOURCE, { name: 'Ignored', slaMinutes: 15 }),
    'New Lead From TikTok Forms',
  );
  assert.equal(tikTokSubmissionRef('tt-123'), 'TikTok Instant Form · Lead tt-123');
});

test('the endpoint fixes assignment and source server-side and uses the durable outbox', async () => {
  const route = await readFile(
    new URL('../src/app/api/leads/tiktok/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /TIKTOK_LEAD_POSTING_SECRET/);
  assert.match(route, /loadTikTokAssignee/);
  assert.match(route, /sales_agent: owner/);
  assert.match(route, /lead_source: TIKTOK_LEAD_SOURCE/);
  assert.match(route, /utm_source: 'tiktok'/);
  assert.match(route, /utm_medium: 'lead_form'/);
  assert.match(route, /enqueueAndProcessLeadNotification/);
  assert.match(route, /%\[TikTok lead ID: \$\{lead\.externalLeadId\}\]%/);
  assert.doesNotMatch(route, /lead_source:\s*lead\./);
});

test('posting instructions name the endpoint, authentication and retry contract', async () => {
  const docs = await readFile(
    new URL('../docs/tiktok-lead-posting.md', import.meta.url),
    'utf8',
  );
  assert.match(docs, /POST https:\/\/catalog\.peptidescostarica\.net\/api\/leads\/tiktok/);
  assert.match(docs, /Authorization: Bearer <TIKTOK_LEAD_POSTING_SECRET>/);
  assert.match(docs, /New Lead From TikTok Forms/);
  assert.match(docs, /assigned to Yese/i);
  assert.match(docs, /Reuse the same value on retries/i);
});
