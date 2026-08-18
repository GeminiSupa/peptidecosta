import test from 'node:test';
import assert from 'node:assert/strict';

import { isPreSendStatus, planScheduleUpdate } from '../src/lib/campaignScheduleStatus.mjs';

// The builder always sends scheduled_at, null included, on every autosave.
const SENDING_IMMEDIATELY = null;

test('a draft can still be scheduled', () => {
  assert.deepEqual(planScheduleUpdate('draft', '2026-09-01T15:00:00.000Z'), {
    scheduled_for: '2026-09-01T15:00:00.000Z',
    status: 'scheduled',
  });
});

test('a scheduled campaign can be put back to sending immediately', () => {
  assert.deepEqual(planScheduleUpdate('scheduled', SENDING_IMMEDIATELY), {
    scheduled_for: null,
    status: 'draft',
  });
});

test('a sent campaign is not walked back to draft by an edit', () => {
  // The bug this exists for: the autosave fires a few seconds after a
  // campaign's report is opened for editing, carrying scheduled_at: null.
  // Acting on it marked mail that had already gone out as an unsent draft.
  assert.deepEqual(planScheduleUpdate('sent', SENDING_IMMEDIATELY), {});
});

test('a campaign mid-send is left alone', () => {
  assert.deepEqual(planScheduleUpdate('sending', SENDING_IMMEDIATELY), {});
});

test('an A/B test in progress keeps its testing status', () => {
  // 'testing' gates picking a winner. Demoting it to draft would strand the
  // remaining subscribers with no way to send them the winning variant.
  assert.deepEqual(planScheduleUpdate('testing', SENDING_IMMEDIATELY), {});
});

test('a sent campaign cannot be rescheduled either', () => {
  // Not just the null case: naming a future date for mail already delivered
  // is no more meaningful than clearing it.
  assert.deepEqual(planScheduleUpdate('sent', '2026-09-01T15:00:00.000Z'), {});
});

test('an update that never mentions scheduling changes neither field', () => {
  // Editing only the subject line must not touch the schedule at all — which
  // is a different thing from asking for "no schedule".
  assert.deepEqual(planScheduleUpdate('draft', undefined), {});
});

test('status is matched regardless of case or stray spacing', () => {
  assert.deepEqual(planScheduleUpdate('  Sent ', SENDING_IMMEDIATELY), {});
  assert.deepEqual(planScheduleUpdate('DRAFT', SENDING_IMMEDIATELY), {
    scheduled_for: null,
    status: 'draft',
  });
});

test('a campaign with no status yet is treated as a draft', () => {
  // Older rows predate the column being populated. They have plainly not been
  // sent, so scheduling them must keep working.
  for (const missing of [null, undefined, '']) {
    assert.equal(isPreSendStatus(missing), true);
    assert.deepEqual(planScheduleUpdate(missing, SENDING_IMMEDIATELY), {
      scheduled_for: null,
      status: 'draft',
    });
  }
});

test('an unrecognised status is left alone rather than reset', () => {
  // Failing closed: a status this module has never heard of is more likely to
  // be a stage added later than an invitation to overwrite it with 'draft'.
  assert.equal(isPreSendStatus('paused'), false);
  assert.deepEqual(planScheduleUpdate('paused', SENDING_IMMEDIATELY), {});
});
