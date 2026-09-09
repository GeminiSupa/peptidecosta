import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTDOWN_URGENT_MS,
  SALE_COUNTDOWN_ENABLED,
  countdownLabel,
  countdownParts,
  countdownTickMs,
  formatCountdown,
  parseEndsAt,
  shouldShowCountdown,
} from '../src/lib/saleCountdown.mjs';

const NOW = new Date('2026-09-09T10:00:00Z');
const at = (iso) => ({ countdownEnabled: true, countdownEndsAt: iso });

test('the feature ships switched off', () => {
  // The owner asked for this coded but not live. If this ever flips by
  // accident, the storefront starts showing countdowns without approval.
  assert.equal(SALE_COUNTDOWN_ENABLED, false);
  assert.equal(shouldShowCountdown(at('2026-09-11T10:00:00Z'), NOW), false);
});

test('with the switch on, a live sale shows and a finished one does not', () => {
  assert.equal(shouldShowCountdown(at('2026-09-11T10:00:00Z'), NOW, true), true);
  assert.equal(shouldShowCountdown(at('2026-09-08T10:00:00Z'), NOW, true), false);
});

test('a banner that did not opt in never counts down', () => {
  const banner = { countdownEnabled: false, countdownEndsAt: '2026-09-11T10:00:00Z' };
  assert.equal(shouldShowCountdown(banner, NOW, true), false);
});

test('a missing or unreadable end time is refused, not guessed', () => {
  assert.equal(parseEndsAt(null), null);
  assert.equal(parseEndsAt(''), null);
  assert.equal(parseEndsAt('not a date'), null);
  assert.equal(countdownParts(null, NOW), null);
  assert.equal(shouldShowCountdown({ countdownEnabled: true }, NOW, true), false);
});

test('an elapsed sale reports expired rather than a zeroed clock', () => {
  // "0h 00m" reads as still running, which is worse than showing nothing.
  const parts = countdownParts('2026-09-09T09:59:59Z', NOW);
  assert.equal(parts.expired, true);
  assert.equal(formatCountdown(parts), null);
  assert.equal(countdownLabel(parts, 'es'), null);
  assert.equal(countdownTickMs(parts), null);
});

test('the exact end moment is over, not one second left', () => {
  assert.equal(countdownParts('2026-09-09T10:00:00Z', NOW).expired, true);
});

test('days show days, and seconds stay hidden until the last hour', () => {
  assert.equal(formatCountdown(countdownParts('2026-09-11T16:32:00Z', NOW)), '2d 06h 32m');
  assert.equal(formatCountdown(countdownParts('2026-09-09T16:32:00Z', NOW)), '06h 32m');
  assert.equal(formatCountdown(countdownParts('2026-09-09T10:31:09Z', NOW)), '00:31:09');
});

test('the final hour switches to urgent, and the boundary is inclusive', () => {
  const exactly = countdownParts(new Date(NOW.getTime() + COUNTDOWN_URGENT_MS), NOW);
  assert.equal(exactly.urgent, true, 'one hour out is already the last hour');

  const justOver = countdownParts(new Date(NOW.getTime() + COUNTDOWN_URGENT_MS + 1000), NOW);
  assert.equal(justOver.urgent, false);
});

test('wording follows the language and the urgency', () => {
  const calm = countdownParts('2026-09-11T10:00:00Z', NOW);
  assert.equal(countdownLabel(calm, 'es'), 'Termina en');
  assert.equal(countdownLabel(calm, 'en'), 'Ends in');

  const urgent = countdownParts('2026-09-09T10:30:00Z', NOW);
  assert.equal(countdownLabel(urgent, 'es'), 'Última hora');
  assert.equal(countdownLabel(urgent, 'en'), 'Last hour');
});

test('it ticks once a minute until seconds are on screen', () => {
  // A two-day countdown re-rendering every second would wake the main thread
  // 86,400 times for a digit nobody can see.
  assert.equal(countdownTickMs(countdownParts('2026-09-11T10:00:00Z', NOW)), 60000);
  assert.equal(countdownTickMs(countdownParts('2026-09-09T10:30:00Z', NOW)), 1000);
});

test('the clock is padded so the digits do not jump about', () => {
  assert.equal(formatCountdown(countdownParts('2026-09-09T15:05:00Z', NOW)), '05h 05m');
  assert.equal(formatCountdown(countdownParts('2026-09-09T10:05:05Z', NOW)), '00:05:05');
});
