import { NextResponse } from 'next/server';

export async function GET() {
  const TILOPAY_BASE = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com';
  const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
  const TILOPAY_API_PASS = process.env.TILOPAY_API_PASS;
  const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;

  const LOGIN_URL = `${TILOPAY_BASE}/api/v1/login`;

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
  };

  // Test different body key formats against the working endpoint
  const bodyVariants = [
    { label: 'camelCase', body: { apiUser: TILOPAY_API_USER, apiPassword: TILOPAY_API_PASS, apiKey: TILOPAY_API_KEY } },
    { label: 'underscore', body: { api_user: TILOPAY_API_USER, api_password: TILOPAY_API_PASS, api_key: TILOPAY_API_KEY } },
    { label: 'short_keys', body: { user: TILOPAY_API_USER, password: TILOPAY_API_PASS, key: TILOPAY_API_KEY } },
    { label: 'email_style', body: { email: TILOPAY_API_USER, password: TILOPAY_API_PASS, api_key: TILOPAY_API_KEY } },
    { label: 'username_style', body: { username: TILOPAY_API_USER, password: TILOPAY_API_PASS, api_key: TILOPAY_API_KEY } },
  ];

  // Also test with Basic Auth header
  const basicAuth = Buffer.from(`${TILOPAY_API_USER}:${TILOPAY_API_PASS}`).toString('base64');

  const tests = [];

  // Test body variants
  for (const variant of bodyVariants) {
    tests.push({ label: `body_${variant.label}`, url: LOGIN_URL, headers, body: JSON.stringify(variant.body) });
  }

  // Test Basic Auth
  tests.push({
    label: 'basic_auth_empty_body',
    url: LOGIN_URL,
    headers: { ...headers, 'Authorization': `Basic ${basicAuth}` },
    body: JSON.stringify({}),
  });
  tests.push({
    label: 'basic_auth_with_key',
    url: LOGIN_URL,
    headers: { ...headers, 'Authorization': `Basic ${basicAuth}` },
    body: JSON.stringify({ apiKey: TILOPAY_API_KEY }),
  });

  const results = {};

  for (const test of tests) {
    try {
      const start = Date.now();
      const res = await fetch(test.url, {
        method: 'POST',
        headers: test.headers,
        body: test.body,
      });
      const duration = Date.now() - start;
      const bodyText = await res.text();
      results[test.label] = {
        status: res.status,
        statusText: res.statusText,
        durationMs: duration,
        bodySnippet: bodyText.substring(0, 500),
      };
    } catch (err) {
      results[test.label] = { error: err.message };
    }
  }

  return NextResponse.json({ endpoint: LOGIN_URL, results });
}
