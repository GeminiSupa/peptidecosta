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

  if (!token) return NextResponse.json({ error: 'No token received' });

  const authHeaders = { ...headers, 'Authorization': `Bearer ${token}` };
  const uniqueOrder = 'TEST-' + Date.now();

  // Test 1: Standard Card Payment Payload
  const cardPayload = {
    redirect: 'https://peptidecosta.vercel.app/catalog',
    key: TILOPAY_API_KEY,
    amount: '10.00',
    currency: 'CRC',
    billToFirstName: 'Test',
    billToLastName: 'User',
    billToAddress: 'San Jose Centro',
    billToAddress2: 'N/A',
    billToCity: 'San Jose',
    billToState: 'CR-SJ',
    billToZipPostCode: '10101',
    billToCountry: 'CR',
    billToTelephone: '88888888',
    billToEmail: 'test@test.com',
    orderNumber: uniqueOrder + '-CARD',
    capture: '1',
    subscription: '0',
    platform: 'PeptidesCR',
    token_version: 'v2',
  };

  // Test 2: SINPE Payload (same endpoint, but with method fields)
  const sinpePayload = {
    ...cardPayload,
    orderNumber: uniqueOrder + '-SINPE',
    method: 'sinpemovil',
    sinpeMovilIdType: 'cedula',
    sinpeMovilIdNumber: '101110111',
  };

  const results = {};

  // Execute tests
  for (const [label, payload] of [['CARD_TEST', cardPayload], ['SINPE_TEST', sinpePayload]]) {
    try {
      const res = await fetch(`${TILOPAY_BASE}/api/v1/processPayment`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const bodyText = await res.text();
      let parsedBody = {};
      try { parsedBody = JSON.parse(bodyText); } catch(e) {}
      
      results[label] = {
        status: res.status,
        urlReturned: parsedBody?.url || null,
        errorReturned: parsedBody?.error || null,
        rawResponse: bodyText.substring(0, 300)
      };
    } catch (err) {
      results[label] = { error: err.message };
    }
  }

  return NextResponse.json(results);
}
