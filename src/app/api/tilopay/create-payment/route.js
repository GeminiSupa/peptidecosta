import { NextResponse } from 'next/server';

const TILOPAY_BASE = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com';
const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
const TILOPAY_API_PASS = process.env.TILOPAY_API_PASS;
const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;
const TILOPAY_REDIRECT_URL = process.env.TILOPAY_REDIRECT_URL || 'https://peptidecosta.vercel.app/catalog';

const SUPPORTED_METHODS = ['tilopay', 'sinpe', 'sinpemovil'];

const parseCustomerIdFromAddress = (shippingAddress = '') => {
  const lines = shippingAddress.split('\n').map(line => line.trim()).filter(Boolean);
  return lines[1] || '';
};

const buildTilopayMethodFields = ({ paymentMethod, customerIdType, customerIdNumber, shippingAddress }) => {
  if (paymentMethod === 'sinpe' || paymentMethod === 'sinpemovil') {
    const dni = (customerIdNumber || parseCustomerIdFromAddress(shippingAddress)).replace(/\s+/g, '');
    return {
      method: 'sinpemovil',
      paymentMethod: 'sinpemovil',
      typeDni: Number(customerIdType || 1),
      dni,
    };
  }

  // Card payment requires no extra method fields or specific card fields for Hosted checkout redirect.
  return {};
};

export async function POST(req) {
  try {
    // ─── Step 0: Validate configuration ─────────────────────────────────────────
    if (!TILOPAY_API_USER || !TILOPAY_API_PASS || !TILOPAY_API_KEY) {
      console.error('[Tilopay] Missing configuration credentials. USER:', !!TILOPAY_API_USER, 'PASS:', !!TILOPAY_API_PASS, 'KEY:', !!TILOPAY_API_KEY);
      return NextResponse.json({ error: 'Tilopay credentials are not configured' }, { status: 500 });
    }

    const body = await req.json();
    const {
      amount,
      currency,       // 'USD' or 'CRC'
      orderNumber,
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress,  // raw string from checkout textarea
      lang,
      paymentMethod = 'tilopay',
      customerIdType,
      customerIdNumber,
    } = body;

    // Validate standard required fields
    if (!amount || !currency || !orderNumber || !customerName || !customerEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!SUPPORTED_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: `Unsupported payment method: ${paymentMethod}` }, { status: 400 });
    }

    // Specific guard for Card payments (tilopay)
    if (paymentMethod === 'tilopay') {
      if (!customerPhone || !shippingAddress) {
        return NextResponse.json({ error: 'Missing phone or address for billing card payment' }, { status: 400 });
      }
    }

    // Specific guard for SINPE Móvil
    if (paymentMethod === 'sinpe' || paymentMethod === 'sinpemovil') {
      if (!customerIdNumber?.trim()) {
        return NextResponse.json({ error: 'Identification (customerIdNumber) is required for SINPE Móvil' }, { status: 400 });
      }
    }

    // ─── Step 1: Get Bearer Token ──────────────────────────────────────────────
    const tokenRes = await fetch(`${TILOPAY_BASE}/api/v1/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: TILOPAY_API_USER,
        password: TILOPAY_API_PASS,
        api_key: TILOPAY_API_KEY,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[Tilopay] Token request failed:', err, 'Status:', tokenRes.status);
      return NextResponse.json({ error: `Tilopay authentication failed: ${tokenRes.statusText || 'Gateway Error'}` }, { status: 502 });
    }

    const tokenData = await tokenRes.json();
    const token = tokenData?.token || tokenData?.access_token || tokenData?.data?.token;

    if (!token) {
      console.error('[Tilopay] No token in response data:', tokenData);
      return NextResponse.json({ error: 'Tilopay did not return an access token' }, { status: 502 });
    }

    // ─── Parse name ────────────────────────────────────────────────────────────
    const nameParts = (customerName || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName  = nameParts.slice(1).join(' ') || firstName;

    // ─── Parse address (best-effort from the freeform textarea) ───────────────
    // The textarea format:  Name / ID / Province, Canton, District / Address / Zip / Phone
    const addrLines = shippingAddress
      ? shippingAddress.split('\n').map(l => l.trim()).filter(Boolean)
      : [];

    const billAddress  = addrLines[3] || addrLines[0] || 'N/A';
    const billAddress2 = addrLines[2] || 'N/A';   // Province/Canton/District
    const billCity     = addrLines[2]?.split(',')[1]?.trim() || 'San José';
    const billState    = 'CR-SJ';   // ISO state — default San José, Costa Rica
    const billZip      = addrLines[4] || '10101';
    const billCountry  = 'CR';

    // ─── Step 2: Get Hosted Payment Form URL ──────────────────────────────────
    const paymentPayload = {
      redirect:        `${TILOPAY_REDIRECT_URL}?payment=${paymentMethod}&order=${encodeURIComponent(orderNumber)}`,
      key:             TILOPAY_API_KEY,
      amount:          String(Number(amount).toFixed(2)),
      currency:        currency,         // 'USD' or 'CRC'
      billToFirstName: firstName,
      billToLastName:  lastName,
      billToAddress:   billAddress,
      billToAddress2:  billAddress2,
      billToCity:      billCity,
      billToState:     billState,
      billToZipPostCode: billZip,
      billToCountry:   billCountry,
      billToTelephone: customerPhone || '00000000',
      billToEmail:     customerEmail,
      // Ship-to mirrors bill-to (physical product pickup / local delivery)
      shipToFirstName: firstName,
      shipToLastName:  lastName,
      shipToAddress:   billAddress,
      shipToAddress2:  billAddress2,
      shipToCity:      billCity,
      shipToState:     billState,
      shipToZipPostCode: billZip,
      shipToCountry:   billCountry,
      shipToTelephone: customerPhone || '00000000',
      orderNumber:     orderNumber,
      capture:         '1',
      subscription:    '0',
      platform:        'PeptidesCR',
      token_version:   'v2',
      ...buildTilopayMethodFields({ paymentMethod, customerIdType, customerIdNumber, shippingAddress }),
      // Pass details as returnData so result handling can identify the order/method.
      returnData:      Buffer.from(JSON.stringify({ lang, orderNumber, paymentMethod })).toString('base64'),
    };

    const paymentRes = await fetch(`${TILOPAY_BASE}/api/v1/processPayment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      body: JSON.stringify(paymentPayload),
    });
    
    const paymentData = await paymentRes.json().catch((e) => {
      console.error('[Tilopay] Failed to parse transaction response JSON:', e);
      return {};
    });

    // Tilopay returns { url: '...' } or similar
    const paymentUrl = paymentData?.url || paymentData?.data?.url || paymentData?.redirectUrl;

    if (!paymentRes.ok || !paymentUrl) {
      console.error('[Tilopay] Transaction request failed. Status:', paymentRes.status, 'Response Data:', paymentData);
      return NextResponse.json({
        error: paymentData?.description || paymentData?.message || 'Tilopay did not return a payment URL',
      }, { status: 502 });
    }

    return NextResponse.json({ paymentUrl, paymentMethod });

  } catch (err) {
    console.error('[Tilopay] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
