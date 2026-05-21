import { NextResponse } from 'next/server';

export async function GET() {
  const TILOPAY_BASE = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com';
  const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
  const TILOPAY_API_PASS = process.env.TILOPAY_API_PASS;
  const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;

  const diagnostics = {
    env: {
      TILOPAY_BASE_URL_configured: !!process.env.TILOPAY_BASE_URL,
      TILOPAY_BASE_URL_value: TILOPAY_BASE,
      TILOPAY_API_USER_configured: !!TILOPAY_API_USER,
      TILOPAY_API_USER_length: TILOPAY_API_USER ? TILOPAY_API_USER.length : 0,
      TILOPAY_API_PASS_configured: !!TILOPAY_API_PASS,
      TILOPAY_API_PASS_length: TILOPAY_API_PASS ? TILOPAY_API_PASS.length : 0,
      TILOPAY_API_KEY_configured: !!TILOPAY_API_KEY,
      TILOPAY_API_KEY_length: TILOPAY_API_KEY ? TILOPAY_API_KEY.length : 0,
    },
    connectivityTest: {},
  };

  try {
    const url = `${TILOPAY_BASE}/api/users/apilogin`;
    diagnostics.connectivityTest.targetUrl = url;

    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        apiUser: TILOPAY_API_USER || 'dummy',
        apiPassword: TILOPAY_API_PASS || 'dummy',
        apiKey: TILOPAY_API_KEY || 'dummy',
      }),
    });
    const duration = Date.now() - start;

    diagnostics.connectivityTest.status = res.status;
    diagnostics.connectivityTest.statusText = res.statusText;
    diagnostics.connectivityTest.durationMs = duration;
    diagnostics.connectivityTest.headers = Object.fromEntries(res.headers.entries());

    const bodyText = await res.text();
    diagnostics.connectivityTest.responseBodySnippet = bodyText.substring(0, 500);

  } catch (err) {
    diagnostics.connectivityTest.error = err.message;
  }

  return NextResponse.json(diagnostics);
}
