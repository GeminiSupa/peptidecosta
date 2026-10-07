import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isExpectedAccountTurnstileResult,
  safeAccountNext,
} from '../src/lib/accountLogin.mjs';
import { isAccountTestLoginEnabled } from '../src/lib/accountTestLogin.mjs';
import { isTrustedStorefrontBrowserRequest } from '../src/lib/publicApiSecurity.mjs';

test('post-login navigation stays inside the account area', () => {
  assert.equal(safeAccountNext('/account/orders/PC-100?from=email'), '/account/orders/PC-100?from=email');
  assert.equal(safeAccountNext('/account'), '/account');
  assert.equal(safeAccountNext('https://evil.example/steal'), '/account');
  assert.equal(safeAccountNext('//evil.example/steal'), '/account');
  assert.equal(safeAccountNext('/catalog?checkout=1'), '/account');
  assert.equal(safeAccountNext('/account\\..\\admin'), '/account');
});

test('no-code test login is impossible on a production deployment', () => {
  assert.equal(isAccountTestLoginEnabled('true', { nodeEnv: 'production' }), false);
  assert.equal(isAccountTestLoginEnabled('true', { nodeEnv: 'development' }), true);
  assert.equal(isAccountTestLoginEnabled('true', { nodeEnv: 'production', vercelEnv: 'preview' }), true);
  assert.equal(isAccountTestLoginEnabled('true', { nodeEnv: 'development', vercelEnv: 'production' }), false);
  assert.equal(isAccountTestLoginEnabled('false', { nodeEnv: 'development' }), false);
});

test('Turnstile proof is bound to the account action and exact storefront host', () => {
  const valid = { success: true, action: 'account_login', hostname: 'catalog.peptidescostarica.net' };
  assert.equal(isExpectedAccountTurnstileResult(valid, 'https://catalog.peptidescostarica.net/api/account/request-code'), true);
  assert.equal(isExpectedAccountTurnstileResult({ ...valid, action: 'contact' }, 'https://catalog.peptidescostarica.net/api/account/request-code'), false);
  assert.equal(isExpectedAccountTurnstileResult({ ...valid, hostname: 'evil.example' }, 'https://catalog.peptidescostarica.net/api/account/request-code'), false);
  assert.equal(isExpectedAccountTurnstileResult({ ...valid, hostname: '' }, 'https://catalog.peptidescostarica.net/api/account/request-code'), false);
});

test('browser-only account endpoints reject headerless and cross-site requests', () => {
  const sameOrigin = new Request('https://catalog.peptidescostarica.net/api/account/request-code', {
    headers: { origin: 'https://catalog.peptidescostarica.net' },
  });
  const browserMetadata = new Request('https://catalog.peptidescostarica.net/api/account/request-code', {
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  const crossSite = new Request('https://catalog.peptidescostarica.net/api/account/request-code', {
    headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
  });
  const headerless = new Request('https://catalog.peptidescostarica.net/api/account/request-code');

  assert.equal(isTrustedStorefrontBrowserRequest(sameOrigin), true);
  assert.equal(isTrustedStorefrontBrowserRequest(browserMetadata), true);
  assert.equal(isTrustedStorefrontBrowserRequest(crossSite), false);
  assert.equal(isTrustedStorefrontBrowserRequest(headerless), false);
});

test('account mutations use the shared public-request security boundary', () => {
  const requestCode = readFileSync('src/app/api/account/request-code/route.js', 'utf8');
  const requests = readFileSync('src/app/api/account/requests/route.js', 'utf8');
  const claimOrders = readFileSync('src/app/api/account/claim-orders/route.js', 'utf8');
  const testLogin = readFileSync('src/app/api/account/test-login/route.js', 'utf8');

  assert.match(requestCode, /isTrustedStorefrontBrowserRequest\(request\)/);
  assert.match(requestCode, /readLimitedJson\(request, JSON_LIMIT\)/);
  assert.match(requestCode, /consumeDurableRateLimit/);
  assert.match(requestCode, /isExpectedAccountTurnstileResult\(cfData, request\.url\)/);
  assert.match(requests, /isTrustedStorefrontBrowserRequest\(request\)/);
  assert.match(requests, /consumeDurableRateLimit/);
  assert.match(claimOrders, /isTrustedStorefrontBrowserRequest\(request\)/);
  assert.match(testLogin, /isTrustedStorefrontBrowserRequest\(request\)/);
});

test('private account pages are never cached, indexed, or framed', () => {
  const config = readFileSync('next.config.mjs', 'utf8');
  assert.match(config, /source: '\/account\/:path\*'/);
  assert.match(config, /private, no-store, max-age=0/);
  assert.match(config, /noindex, nofollow, noarchive/);
  assert.match(config, /X-Frame-Options', value: 'DENY'/);
});
