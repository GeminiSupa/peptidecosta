import { NextResponse } from 'next/server';

export async function GET() {
  const TILOPAY_BASE = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com';
  const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
  const TILOPAY_API_PASS = process.env.TILOPAY_API_PASS;
  const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;

  const loginBody = JSON.stringify({
    apiUser: TILOPAY_API_USER || 'dummy',
    apiPassword: TILOPAY_API_PASS || 'dummy',
    apiKey: TILOPAY_API_KEY || 'dummy',
  });

  // Also try with underscore keys (api_user, api_password, api_key)
  const loginBodyUnderscore = JSON.stringify({
    api_user: TILOPAY_API_USER || 'dummy',
    api_password: TILOPAY_API_PASS || 'dummy',
    api_key: TILOPAY_API_KEY || 'dummy',
  });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
  };

  // Test multiple possible endpoint paths
  const endpoints = [
    { label: 'v1_camelCase', url: `${TILOPAY_BASE}/api/v1/users/apilogin`, body: loginBody },
    { label: 'v2_camelCase', url: `${TILOPAY_BASE}/api/v2/users/apilogin`, body: loginBody },
    { label: 'original_camelCase', url: `${TILOPAY_BASE}/api/users/apilogin`, body: loginBody },
    { label: 'original_underscore', url: `${TILOPAY_BASE}/api/users/apilogin`, body: loginBodyUnderscore },
    { label: 'v1_underscore', url: `${TILOPAY_BASE}/api/v1/users/apilogin`, body: loginBodyUnderscore },
    { label: 'login_camelCase', url: `${TILOPAY_BASE}/api/login`, body: loginBody },
    { label: 'auth_camelCase', url: `${TILOPAY_BASE}/api/auth`, body: loginBody },
    { label: 'v1_login', url: `${TILOPAY_BASE}/api/v1/login`, body: loginBody },
    { label: 'v1_auth', url: `${TILOPAY_BASE}/api/v1/auth`, body: loginBody },
  ];

  const results = {};

  for (const ep of endpoints) {
    try {
      const start = Date.now();
      const res = await fetch(ep.url, {
        method: 'POST',
        headers,
        body: ep.body,
      });
      const duration = Date.now() - start;
      const bodyText = await res.text();
      results[ep.label] = {
        url: ep.url,
        status: res.status,
        statusText: res.statusText,
        durationMs: duration,
        bodySnippet: bodyText.substring(0, 300),
      };
    } catch (err) {
      results[ep.label] = { url: ep.url, error: err.message };
    }
  }

  return NextResponse.json({ results });
}
