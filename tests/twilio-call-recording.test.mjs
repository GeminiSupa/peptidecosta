import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCallRecordingSetting,
  CALL_RECORDING_DEFAULT_ENABLED,
  dialRecordAttribute,
  readCallRecordingSetting,
} from '../src/lib/twilioCallRecording.mjs';

test('a missing setting keeps the shipped behaviour', () => {
  assert.equal(CALL_RECORDING_DEFAULT_ENABLED, true);
  assert.equal(readCallRecordingSetting(undefined).enabled, true);
  assert.equal(readCallRecordingSetting(null).enabled, true);
});

test('only an explicit false turns recording off', () => {
  assert.equal(readCallRecordingSetting({ enabled: false }).enabled, false);
  assert.equal(readCallRecordingSetting({ enabled: true }).enabled, true);
  // Junk must not silently stop recording calls staff believe are taped.
  assert.equal(readCallRecordingSetting({ enabled: 'no' }).enabled, true);
  assert.equal(readCallRecordingSetting('off').enabled, true);
  assert.equal(readCallRecordingSetting(0).enabled, true);
});

test('the row records who flipped it, by name and never by email', () => {
  const value = buildCallRecordingSetting({ enabled: false, changedBy: '  Joe Webster  ' });
  assert.equal(value.enabled, false);
  assert.equal(value.changed_by, 'Joe Webster');
  assert.ok(Date.parse(value.changed_at) > 0);

  const read = readCallRecordingSetting(value);
  assert.equal(read.enabled, false);
  assert.equal(read.changedBy, 'Joe Webster');
});

test('a blank name is stored as nothing rather than an empty string', () => {
  assert.equal(buildCallRecordingSetting({ enabled: true, changedBy: '   ' }).changed_by, null);
  assert.equal(buildCallRecordingSetting({ enabled: true }).changed_by, null);
});

test('the TwiML attribute appears only when recording is on', () => {
  assert.equal(dialRecordAttribute(true), ' record="record-from-ringing"');
  assert.equal(dialRecordAttribute(false), '');
});

test('the dialled TwiML is valid XML either way', () => {
  const dial = (enabled) =>
    `<Dial callerId="+15550000000" timeout="30"${dialRecordAttribute(enabled)}>`;
  assert.equal(dial(true), '<Dial callerId="+15550000000" timeout="30" record="record-from-ringing">');
  // No stray double space where the attribute used to be.
  assert.equal(dial(false), '<Dial callerId="+15550000000" timeout="30">');
});
