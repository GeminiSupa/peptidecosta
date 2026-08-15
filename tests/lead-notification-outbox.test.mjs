import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('lead notification migration creates an atomic outbox and retry claims', async () => {
  const sql = await readFile(new URL('../add-lead-notification-outbox.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.lead_notification_jobs/);
  assert.match(sql, /AFTER INSERT OR UPDATE OF last_enquiry_at ON public\.catalog_leads/);
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /lead_notification_deliveries/);
  assert.match(sql, /recipient_email/);
  assert.match(sql, /REVOKE ALL ON public\.lead_notification_jobs FROM anon, authenticated/);
});
test('lead route queues tracked delivery and cron recovers pending jobs', async () => {
  const route = await readFile(new URL('../src/app/api/leads/contact/route.js', import.meta.url), 'utf8');
  const cron = await readFile(new URL('../src/app/api/cron/process-lead-notifications/route.js', import.meta.url), 'utf8');
  assert.match(route, /enqueueAndProcessLeadNotification/);
  assert.match(route, /notifications:/);
  assert.match(cron, /claim_lead_notification_jobs/);
  assert.match(cron, /deliverClaimedLeadNotificationJob/);
});

test('CRM exposes alert status and a superadmin retry action', async () => {
  const leads = await readFile(new URL('../src/components/admin/LeadsManager.js', import.meta.url), 'utf8');
  assert.match(leads, /Staff Alerts/);
  assert.match(leads, /Assigned to you/);
  assert.match(leads, /retryLeadNotification/);
  assert.match(leads, /Only a superadmin can transfer/);
});
