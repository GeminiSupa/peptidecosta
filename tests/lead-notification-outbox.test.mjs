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

test('own-domain lead alerts leave from our own mail host, not Elastic', async () => {
  const delivery = await readFile(new URL('../src/lib/leadNotificationDelivery.js', import.meta.url), 'utf8');

  // Rackspace refuses own-domain mail arriving from Elastic, and Elastic
  // reports success anyway — so info@ alerts were logged as sent and binned.
  assert.match(delivery, /getOwnDomainSmtpConfig, isOwnDomainAddress/);
  assert.match(delivery, /const viaOwnHost = Boolean\(ownTransporter\) && isOwnDomainAddress\(destination\)/);
  assert.match(delivery, /from: viaOwnHost \? ownDomain\.from : from/);

  // Unconfigured must behave exactly as before rather than throwing: no own
  // host means every recipient keeps going out through Elastic.
  assert.match(delivery, /ownDomain\.configured\s*\?[\s\S]*?:\s*null/);
});

test('lead alert SMTP fails fast instead of outliving the invocation', async () => {
  const delivery = await readFile(new URL('../src/lib/leadNotificationDelivery.js', import.meta.url), 'utf8');
  assert.match(delivery, /const SMTP_TIMEOUTS = \{/);
  assert.match(delivery, /connectionTimeout: 10000/);
});

test('the email runbook records the own-domain trap and how to investigate it', async () => {
  const runbook = await readFile(new URL('../docs/email-delivery-runbook.md', import.meta.url), 'utf8');

  // The false comfort that derailed three investigations.
  assert.match(runbook, /is not evidence that anybody received anything/);
  // The mechanism, and the module that already solves it.
  assert.match(runbook, /ownDomainSmtp\.mjs/);
  assert.match(runbook, /OWN_DOMAIN_SMTP_\*/);
  // The steps, in the order that actually works.
  assert.match(runbook, /email-diagnostics\?verify=1/);
  assert.match(runbook, /View Source/);
  assert.match(runbook, /2 Sep 2026/);
});
