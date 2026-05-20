require('dotenv').config({ path: '.env.local' });

async function test() {
  const PAYPAL_API = process.env.NEXT_PUBLIC_PAYPAL_ENV === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');

  const tokenRes = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  console.log("Token:", accessToken ? "Success" : tokenData);

  const totalUsd = 10;
  const items = [{product: 'Test Item', qty: 1}];
  const customerName = 'John Doe';
  const customerPhone = '1234567890';

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
  console.log("Order Response:", order);
}

test();
