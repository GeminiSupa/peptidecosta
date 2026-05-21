const TILOPAY_BASE = 'https://app.tilopay.com';
const TILOPAY_API_USER = 'AxReOk';
const TILOPAY_API_PASS = '0JuxAX';
const TILOPAY_API_KEY = '5288-1339-9692-9829-7378';

async function run() {
  const loginRes = await fetch(`${TILOPAY_BASE}/api/v1/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
    body: JSON.stringify({ email: TILOPAY_API_USER, password: TILOPAY_API_PASS, api_key: TILOPAY_API_KEY })
  });
  
  const tokenText = await loginRes.text();
  let token = null;
  try {
    const t = JSON.parse(tokenText);
    token = t.access_token;
  } catch (e) {
    console.error("Login failed:", tokenText);
    return;
  }
  
  const payload = {
    redirect: 'https://peptidecosta.vercel.app/catalog?payment=test&order=123',
    key: TILOPAY_API_KEY,
    amount: '35000.00',
    currency: 'CRC',
    billToFirstName: 'Test',
    billToLastName: 'User',
    billToAddress: 'San Jose, Costa Rica - Edificio 1',
    billToAddress2: 'N/A',
    billToCity: 'San Jose',
    billToState: 'CR-SJ',
    billToZipPostCode: '10101',
    billToCountry: 'CR',
    billToTelephone: '8888-8888',
    billToEmail: 'test@test.com',
    shipToFirstName: 'Test',
    shipToLastName: 'User',
    shipToAddress: 'San Jose, Costa Rica - Edificio 1',
    shipToAddress2: 'N/A',
    shipToCity: 'San Jose',
    shipToState: 'CR-SJ',
    shipToZipPostCode: '10101',
    shipToCountry: 'CR',
    shipToTelephone: '8888-8888',
    orderNumber: 'TEST-' + Date.now(),
    capture: '1',
    subscription: '0',
    platform: 'PeptidesCR',
    token_version: 'v2'
  };

  const res = await fetch(`${TILOPAY_BASE}/api/v1/processPayment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  console.log(await res.text());
}
run();
