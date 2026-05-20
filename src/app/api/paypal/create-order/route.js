// PayPal Create Order API Route
// This runs server-side to securely create a PayPal order using the secret key

const PAYPAL_API = process.env.NEXT_PUBLIC_PAYPAL_ENV === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

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
    const { totalUsd, items, customerName, customerPhone } = await request.json();

    if (!totalUsd || totalUsd <= 0) {
      require('fs').writeFileSync('/Users/apple/Desktop/costapeptides/paypal_error.log', 'Invalid total amount: ' + totalUsd);
      return Response.json({ error: 'Invalid total amount' }, { status: 400 });
    }

    const accessToken = await getPayPalAccessToken();

    // Build item descriptions for PayPal
    const itemDescriptions = items.map(i => `${i.product} x${i.qty}`).join(', ');

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: `Peptides Costa Rica Order: ${itemDescriptions}`.substring(0, 127),
          amount: {
            currency_code: 'USD',
            value: totalUsd.toFixed(2),
          },
          custom_id: JSON.stringify({ customerName, customerPhone }).substring(0, 127),
        },
      ],
      application_context: {
        brand_name: 'Peptides Costa Rica',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: 'https://peptidecosta.vercel.app/catalog',
        cancel_url: 'https://peptidecosta.vercel.app/catalog',
      },
    };

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(orderPayload),
    });

    const order = await response.json();

    if (!response.ok) {
      console.error('PayPal create order error:', order);
      require('fs').writeFileSync('/Users/apple/Desktop/costapeptides/paypal_error.log', JSON.stringify(order, null, 2));
      return Response.json({ error: 'Failed to create PayPal order: ' + JSON.stringify(order) }, { status: 500 });
    }

    return Response.json({ id: order.id });
  } catch (err) {
    console.error('PayPal create order exception:', err);
    require('fs').writeFileSync('/Users/apple/Desktop/costapeptides/paypal_error.log', 'Exception: ' + err.message);
    return Response.json({ error: 'Server error creating PayPal order: ' + err.message }, { status: 500 });
  }
}
