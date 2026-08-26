import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allowedAnalyticsCorsOrigin,
  isAllowedAnalyticsOrigin,
} from '../src/lib/analyticsOrigins.mjs';

test('analytics accepts the apex and every HTTPS subdomain', () => {
  assert.equal(isAllowedAnalyticsOrigin('https://peptidescostarica.net'), true);
  assert.equal(isAllowedAnalyticsOrigin('https://www.peptidescostarica.net'), true);
  assert.equal(isAllowedAnalyticsOrigin('https://catalog.peptidescostarica.net'), true);
  assert.equal(isAllowedAnalyticsOrigin('https://crm.admin.peptidescostarica.net'), true);
});

test('analytics rejects insecure, lookalike, and malformed origins', () => {
  assert.equal(isAllowedAnalyticsOrigin('http://catalog.peptidescostarica.net'), false);
  assert.equal(isAllowedAnalyticsOrigin('https://peptidescostarica.net.example.com'), false);
  assert.equal(isAllowedAnalyticsOrigin('https://evilpeptidescostarica.net'), false);
  assert.equal(isAllowedAnalyticsOrigin('https://catalog.peptidescostarica.net/path'), false);
  assert.equal(isAllowedAnalyticsOrigin('not-an-origin'), false);
  assert.equal(isAllowedAnalyticsOrigin(''), false);
});

test('analytics keeps the two development origins available', () => {
  assert.equal(isAllowedAnalyticsOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedAnalyticsOrigin('http://127.0.0.1:3000'), true);
});

test('CORS only reflects an approved origin', () => {
  assert.equal(
    allowedAnalyticsCorsOrigin('https://offers.peptidescostarica.net'),
    'https://offers.peptidescostarica.net'
  );
  assert.equal(allowedAnalyticsCorsOrigin('https://peptidescostarica.net.attacker.test'), '');
});
