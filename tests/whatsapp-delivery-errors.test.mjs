import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeWhatsAppDeliveryError,
  formatDeliveryFailureLog,
} from '../src/lib/whatsappDeliveryErrors.mjs';

test('non-failure statuses describe nothing', () => {
  // The description doubles as the decision, so callers do not need their own
  // status check.
  assert.equal(describeWhatsAppDeliveryError({ status: 'sent' }), null);
  assert.equal(describeWhatsAppDeliveryError({ status: 'delivered' }), null);
  assert.equal(describeWhatsAppDeliveryError({ status: 'read' }), null);
  assert.equal(describeWhatsAppDeliveryError({}), null);
});

test('the 24-hour window rejection is named and explained', () => {
  // 131047 is the one that silently killed customer order confirmations.
  const failure = describeWhatsAppDeliveryError({
    status: 'failed',
    id: 'wamid.ABC',
    recipient_id: '50688887777',
    errors: [{
      code: 131047,
      title: 'Re-engagement message',
      error_data: { details: 'Message failed to send because more than 24 hours have passed.' },
    }],
  });

  assert.equal(failure.code, 131047);
  assert.match(failure.summary, /131047/);
  assert.match(failure.summary, /24 hours/);
  assert.match(failure.hint, /pre-approved template/);
});

test('an unrecognised code still surfaces everything Meta sent', () => {
  const failure = describeWhatsAppDeliveryError({
    status: 'failed',
    errors: [{ code: 999999, title: 'Brand new failure', message: 'Something novel' }],
  });

  assert.equal(failure.code, 999999);
  assert.equal(failure.hint, null);
  assert.match(failure.summary, /999999/);
  assert.match(failure.summary, /Brand new failure/);
  assert.match(failure.summary, /Something novel/);
});

test('a failure with no errors array is still reported, not swallowed', () => {
  const failure = describeWhatsAppDeliveryError({ status: 'failed', id: 'wamid.X' });

  assert.equal(failure.code, null);
  assert.match(failure.summary, /without an error code/);
});

test('extra errors on one status are kept rather than dropped', () => {
  const failure = describeWhatsAppDeliveryError({
    status: 'failed',
    errors: [
      { code: 131026, title: 'Undeliverable' },
      { code: 190, title: 'Token expired' },
    ],
  });

  assert.equal(failure.code, 131026);
  assert.deepEqual(failure.additional, [{ code: 190, title: 'Token expired' }]);
});

test('the log line names the recipient, the message and the reason', () => {
  const status = {
    status: 'failed',
    id: 'wamid.XYZ',
    recipient_id: '50688887777',
    errors: [{ code: 132001, title: 'Template not found' }],
  };

  const line = formatDeliveryFailureLog(status, describeWhatsAppDeliveryError(status));

  assert.match(line, /50688887777/);
  assert.match(line, /wamid\.XYZ/);
  assert.match(line, /132001/);
  assert.match(line, /not approved/);
});

test('the sender no longer claims a delivery it cannot know about', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync('src/lib/orderWhatsAppAlerts.js', 'utf8');

  // Meta returning 200 means accepted, not delivered. Claiming success here is
  // what made every later delivery failure invisible.
  assert.doesNotMatch(source, /Customer WhatsApp alert sent successfully/);
  assert.match(source, /accepted by Meta/);
});
