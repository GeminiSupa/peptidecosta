import { NextResponse } from 'next/server';

export async function GET() {
  const TILOPAY_BASE = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com';
  const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
  const TILOPAY_API_PASS = process.env.TILOPAY_API_PASS;
  const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
  };

  // Step 1: Login
  let token = null;
  try {
    const tokenRes = await fetch(`${TILOPAY_BASE}/api/v1/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: TILOPAY_API_USER,
        password: TILOPAY_API_PASS,
        api_key: TILOPAY_API_KEY,
      }),
    });
    const tokenData = await tokenRes.json();
    token = tokenData?.access_token;
  } catch (err) {
    return NextResponse.json({ error: 'Login failed: ' + err.message });
  }

  const authHeaders = { ...headers, 'Authorization': `Bearer ${token}` };
  const uniqueOrder = 'TEST-' + Date.now();

  // Test 1: Link Payment Payload
  const linkPayload = {
    key: TILOPAY_API_KEY,
    amount: '35000',
    currency: 'CRC',
    reference: uniqueOrder,
    type: 1, // One-time use
    description: 'Costa Peptides Order ' + uniqueOrder,
    client: 'Test User',
    callback_url: 'https://peptidecosta.vercel.app/catalog',
  };

  const results = {};

  try {
    const res = await fetch(`${TILOPAY_BASE}/api/v1/createLinkPayment`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(linkPayload),
    });
    const bodyText = await res.text();
    let parsedBody = {};
    try { parsedBody = JSON.parse(bodyText); } catch(e) {}
    
    results['LINK_TEST'] = {
      status: res.status,
      urlReturned: parsedBody?.url || parsedBody?.data?.url || null,
      errorReturned: parsedBody?.error || parsedBody?.message || null,
      rawResponse: bodyText.substring(0, 300)
    };
  } catch (err) {
    results['LINK_TEST'] = { error: err.message };
  }

  return NextResponse.json(results);
}
