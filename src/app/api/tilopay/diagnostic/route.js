import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';

// Admin-only Tilopay probe. Creates throwaway payment links (card + SINPE) with
// the SAME payloads the live checkout uses, and returns Tilopay's raw responses
// so you can see exactly why SINPE fails. Touches nothing in the real checkout.
export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const TILOPAY_BASE = process.env.TILOPAY_BASE_URL || 'https://app.tilopay.com';
  const TILOPAY_API_USER = process.env.TILOPAY_API_USER;
  const TILOPAY_API_PASS = process.env.TILOPAY_API_PASS;
  const TILOPAY_API_KEY = process.env.TILOPAY_API_KEY;

  if (!TILOPAY_API_USER || !TILOPAY_API_PASS || !TILOPAY_API_KEY) {
    return NextResponse.json({ error: 'Tilopay credentials are not configured' }, { status: 500 });
  }

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/json',
  };

  // ── Step 1: Login (use the SAME token extraction the working card flow uses) ──
  let token = null;
  let loginRaw = '';
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
    loginRaw = await tokenRes.text();
    let d = {};
    try { d = JSON.parse(loginRaw); } catch { /* keep raw */ }
    token = d?.token || d?.access_token || d?.data?.token || null;
  } catch (err) {
    return NextResponse.json({ step: 'login', error: err.message });
  }

  if (!token) {
    return NextResponse.json({
      step: 'login',
      error: 'No token returned by Tilopay',
      loginRaw: loginRaw.slice(0, 300),
    });
  }

  const authHeaders = { ...headers, Authorization: `Bearer ${token}` };

  // Helper: hit createLinkPayment with a given payload and capture the raw reply.
  async function tryLink(label, extraFields) {
    const reference = `TEST-${label}-${Date.now()}`;
    const payload = {
      key: TILOPAY_API_KEY,
      amount: '35000',
      currency: 'CRC',
      reference,
      type: 1,
      description: `Costa Peptides Diagnostic ${reference}`,
      client: 'Test User',
      callback_url: 'https://catalog.peptidescostarica.net/catalog',
      ...extraFields,
    };
    try {
      const res = await fetch(`${TILOPAY_BASE}/api/v1/createLinkPayment`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const bodyText = await res.text();
      let parsed = {};
      try { parsed = JSON.parse(bodyText); } catch { /* keep raw */ }
      return {
        sentFields: Object.keys(payload),
        httpStatus: res.status,
        urlReturned: parsed?.url || parsed?.data?.url || parsed?.redirectUrl || null,
        errorReturned: parsed?.description || parsed?.error || parsed?.message || null,
        rawResponse: bodyText.slice(0, 400),
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  // Card = no extra fields (this is what works today).
  // SINPE = the exact extra fields create-payment adds. If CARD succeeds and
  // SINPE fails, these fields are the problem with the hosted-link API.
  const [card, sinpe] = await Promise.all([
    tryLink('CARD', {}),
    tryLink('SINPE', {
      method: 'sinpemovil',
      paymentMethod: 'sinpemovil',
      typeDni: 1,
      dni: '118450789',
    }),
  ]);

  return NextResponse.json({
    tokenAcquired: true,
    interpretation:
      card.urlReturned && !sinpe.urlReturned
        ? 'Card link works but SINPE link fails → the SINPE-specific fields (method/typeDni/dni) are rejected by createLinkPayment. SINPE likely needs the direct processPayment flow or must be enabled on the Tilopay account.'
        : card.urlReturned && sinpe.urlReturned
        ? 'Both links were created. SINPE fields are accepted (or ignored) — if SINPE still misbehaves, the customer-facing selection or account settings on Tilopay are the cause.'
        : 'Card link itself failed — the problem is credentials/account level, not SINPE. See CARD_TEST.rawResponse.',
    CARD_TEST: card,
    SINPE_TEST: sinpe,
  });
}
