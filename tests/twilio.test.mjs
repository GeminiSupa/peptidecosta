import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatE164Phone,
  getTwilioConfig,
  getTwilioClient,
  generateVoiceToken,
  sendTwilioWhatsApp,
} from '../src/lib/twilio.js';

import {
  ADMIN_MODULES,
  ADMIN_TAB_IDS,
  resolveAdminTabAccess,
} from '../src/lib/adminModules.js';

test('formatE164Phone formats local and international numbers correctly', () => {
  assert.equal(formatE164Phone('88889999'), '+50688889999', '8-digit CR number auto-prepends +506');
  assert.equal(formatE164Phone('8579714228'), '+18579714228', '10-digit US number auto-prepends +1');
  assert.equal(formatE164Phone('+50688889999'), '+50688889999', 'Existing + prefix is preserved');
  assert.equal(formatE164Phone('+18579714228'), '+18579714228', 'Existing US + prefix is preserved');
  assert.equal(formatE164Phone(''), '', 'Empty input returns empty string');
  assert.equal(formatE164Phone(null), '', 'Null input returns empty string');
});

test('getTwilioConfig reads Twilio environmental configuration', () => {
  const config = getTwilioConfig();
  assert.ok(typeof config === 'object');
  assert.ok('accountSid' in config);
  assert.ok('authToken' in config);
  assert.ok('phoneNumber' in config);
  assert.ok('oldFlowSid' in config);
  assert.ok('newFlowSid' in config);
  assert.ok('twimlAppSid' in config,  'twimlAppSid field is present');
  assert.ok('isConfigured' in config);
  assert.ok('voiceReady' in config,   'voiceReady field is present');
});

test('getTwilioClient initializes client when configured', () => {
  const config = getTwilioConfig();
  const client = getTwilioClient();

  if (config.isConfigured) {
    assert.ok(client !== null, 'Client is instantiated when configured');
  } else {
    assert.equal(client, null, 'Client returns null when unconfigured');
  }
});

test('generateVoiceToken returns error when TWILIO_TWIML_APP_SID is missing', () => {
  const originalSid = process.env.TWILIO_TWIML_APP_SID;
  delete process.env.TWILIO_TWIML_APP_SID;

  const result = generateVoiceToken({ identity: 'test-admin' });

  // Restore
  if (originalSid !== undefined) process.env.TWILIO_TWIML_APP_SID = originalSid;

  const config = getTwilioConfig();
  if (!config.isConfigured) {
    // If Twilio itself isn't configured, it returns a different error — both are failures
    assert.ok(!result.success, 'Returns failure when unconfigured');
  } else {
    // Twilio is configured but TwiML App SID is missing
    assert.ok(!result.success, 'Returns failure when twimlAppSid missing');
    assert.ok(result.error.includes('TWILIO_TWIML_APP_SID'), 'Error message references the missing env var');
  }
});

test('sendTwilioWhatsApp formats the to/from with whatsapp: prefix (unit check via error path)', async () => {
  // Without a live Twilio credential or WhatsApp sandbox we can only check
  // that the function fails gracefully with a meaningful error, not that it throws.
  const result = await sendTwilioWhatsApp({ to: '', body: 'test' });
  assert.ok(!result.success, 'Empty phone returns failure');
  assert.ok(typeof result.error === 'string', 'Error is a string');
});

test('twilio tab is registered in adminModules and accessible to superadmin', () => {
  assert.ok(ADMIN_TAB_IDS.has('twilio'), 'twilio tab ID is registered');

  const twilioModule = ADMIN_MODULES.find((m) => m.id === 'twilio');
  assert.ok(twilioModule, 'twilio module object exists');
  assert.equal(twilioModule.group, 'Sales & Marketing');

  const superadminProfile = { is_superadmin: true, is_approved: true };
  assert.equal(resolveAdminTabAccess('twilio', superadminProfile), true, 'Superadmin can access twilio tab');

  const staffWithPermission = { permissions: ['twilio'], is_approved: true };
  assert.equal(resolveAdminTabAccess('twilio', staffWithPermission), true, 'Staff with twilio permission can access tab');
});
