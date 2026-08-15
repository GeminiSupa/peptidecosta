import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leadNotificationRecipientSummary,
  summarizeLeadNotificationJob,
} from '../src/lib/leadNotificationStatus.mjs';

test('summarizes a fully accepted lead alert', () => {
  const summary = summarizeLeadNotificationJob({
    status: 'delivered',
    lead_notification_deliveries: [
      { channel: 'email', destination: 'dani@example.com', status: 'sent' },
      { channel: 'whatsapp', destination: '50680000000', status: 'sent' },
    ],
  });
  assert.equal(summary.tone, 'success');
  assert.equal(summary.label, 'Alerts accepted 2/2');
  assert.equal(summary.retryable, false);
});
test('failed and partial jobs remain actionable', () => {
  const failed = summarizeLeadNotificationJob({ status: 'failed', last_error: 'Meta rejected template' });
  assert.equal(failed.retryable, true);
  assert.match(failed.detail, /Meta rejected/);

  const partial = summarizeLeadNotificationJob({
    status: 'partial',
    lead_notification_deliveries: [
      { channel: 'email', destination: 'dani@example.com', status: 'sent' },
      { channel: 'whatsapp', destination: '50680000000', status: 'failed' },
    ],
  });
  assert.equal(partial.label, 'Alerts partial 1/2');
  assert.equal(partial.retryable, true);
});

test('recipient summary states channel, destination and result', () => {
  assert.equal(leadNotificationRecipientSummary({
    lead_notification_deliveries: [
      { channel: 'whatsapp', destination: '50680000000', status: 'sent' },
    ],
  }), 'WhatsApp 50680000000: sent');
});
