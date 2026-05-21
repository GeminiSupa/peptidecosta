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

  // Step 1: Get token using the confirmed working endpoint
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

  if (!token) {
    return NextResponse.json({ error: 'No token received' });
  }

  // Step 2: Test multiple transaction endpoint paths with the Bearer token
  const dummyPayload = {
    redirect: 'https://peptidecosta.vercel.app/catalog',
    key: TILOPAY_API_KEY,
    amount: '1.00',
    currency: 'USD',
    billToFirstName: 'Test',
    billToLastName: 'User',
    billToAddress: 'Test Address',
    billToAddress2: 'N/A',
    billToCity: 'San Jose',
    billToState: 'CR-SJ',
    billToZipPostCode: '10101',
    billToCountry: 'CR',
    billToTelephone: '88888888',
    billToEmail: 'test@test.com',
    shipToFirstName: 'Test',
    shipToLastName: 'User',
    shipToAddress: 'Test Address',
    shipToAddress2: 'N/A',
    shipToCity: 'San Jose',
    shipToState: 'CR-SJ',
    shipToZipPostCode: '10101',
    shipToCountry: 'CR',
    shipToTelephone: '88888888',
    orderNumber: 'DIAG-' + Date.now(),
    capture: '1',
    subscription: '0',
    platform: 'PeptidesCR',
    token_version: 'v2',
  };

  const authHeaders = {
    ...headers,
    'Authorization': `Bearer ${token}`,
  };

  const endpoints = [
    `${TILOPAY_BASE}/api/v1/transactions`,
    `${TILOPAY_BASE}/api/v1/transaction`,
    `${TILOPAY_BASE}/api/v1/charge`,
    `${TILOPAY_BASE}/api/v1/charges`,
    `${TILOPAY_BASE}/api/v1/payment`,
    `${TILOPAY_BASE}/api/v1/payments`,
    `${TILOPAY_BASE}/api/v1/process`,
    `${TILOPAY_BASE}/api/transactions`,
    `${TILOPAY_BASE}/api/transaction`,
    `${TILOPAY_BASE}/api/charge`,
    `${TILOPAY_BASE}/api/v1/order`,
    `${TILOPAY_BASE}/api/v1/orders`,
    `${TILOPAY_BASE}/api/v1/checkout`,
  ];

  const results = { tokenOk: true };

  for (const url of endpoints) {
    const label = url.replace(TILOPAY_BASE, '');
    try {
      const start = Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(dummyPayload),
      });
      const duration = Date.now() - start;
      const bodyText = await res.text();
      results[label] = {
        status: res.status,
        durationMs: duration,
        bodySnippet: bodyText.substring(0, 300),
      };
    } catch (err) {
      results[label] = { error: err.message };
    }
  }

  return NextResponse.json(results);
}
