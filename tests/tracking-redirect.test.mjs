import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTrackingDestination, trackingSafeHosts } from '../src/lib/trackingRedirect.mjs';

const LIVE = 'https://catalog.peptidescostarica.net';
const safeHosts = trackingSafeHosts(LIVE, {});

test('a signed destination is followed anywhere', () => {
  const target = resolveTrackingDestination('https://wa.me/50612345678', { isSigned: true, safeHosts });
  assert.equal(target?.host, 'wa.me');
});

test('an unsigned destination on our own site still works', () => {
  // Mail already in inboxes was minted before destinations were signed. Those
  // links must keep working, and they overwhelmingly point back at the shop.
  const target = resolveTrackingDestination(`${LIVE}/catalog?x=1`, { isSigned: false, safeHosts });
  assert.equal(target?.host, 'catalog.peptidescostarica.net');
});

test('an unsigned destination anywhere else is refused', () => {
  // This is the open redirect: without the signature check, our own domain
  // hands out a link that lands on an attacker's page.
  assert.equal(resolveTrackingDestination('https://evil.example/phish', { isSigned: false, safeHosts }), null);
  assert.equal(resolveTrackingDestination('https://catalog.peptidescostarica.net.evil.example/', { isSigned: false, safeHosts }), null);
});

test('non-http schemes are refused even when signed', () => {
  for (const scheme of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd']) {
    assert.equal(resolveTrackingDestination(scheme, { isSigned: true, safeHosts }), null, scheme);
  }
});

test('junk and missing destinations are refused', () => {
  for (const value of ['', null, undefined, 'not a url', '/relative/only']) {
    assert.equal(resolveTrackingDestination(value, { isSigned: true, safeHosts }), null, String(value));
  }
});

test('the safe host list follows the configured origin', () => {
  const hosts = trackingSafeHosts(LIVE, { NEXT_PUBLIC_BASE_URL: 'https://staging.example' });
  assert.equal(hosts.has('staging.example'), true);
  assert.equal(hosts.has('catalog.peptidescostarica.net'), true);
  assert.equal(hosts.has('evil.example'), false);
});
