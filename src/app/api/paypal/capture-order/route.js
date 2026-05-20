// PayPal Capture Order API Route
// This runs server-side to capture (finalize) a PayPal payment after customer approval

const PAYPAL_API = 'https://api-m.paypal.com'; // Use 'https://api-m.sandbox.paypal.com' for testing

async function getPayPalAccessToken() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;

  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');

  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  return data.access_token;
}

export async function POST(request) {
  try {
    const { orderID } = await request.json();

    if (!orderID) {
      return Response.json({ error: 'Missing orderID' }, { status: 400 });
    }

    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const captureData = await response.json();

    if (!response.ok) {
      console.error('PayPal capture error:', captureData);
      return Response.json({ error: 'Failed to capture PayPal payment' }, { status: 500 });
    }

    return Response.json({
      status: captureData.status,
      id: captureData.id,
      payer: captureData.payer,
    });
  } catch (err) {
    console.error('PayPal capture exception:', err);
    return Response.json({ error: 'Server error capturing PayPal payment' }, { status: 500 });
  }
}
