const fs = require('fs');
const path = require('path');

// 1. Manually parse .env.local to avoid needing external dotenv dependency
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const delimiterIndex = trimmed.indexOf('=');
    if (delimiterIndex === -1) return;
    const key = trimmed.substring(0, delimiterIndex).trim();
    const value = trimmed.substring(delimiterIndex + 1).trim();
    process.env[key] = value;
  });
}

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

console.log('--- WhatsApp Integration Test ---');
console.log('WHATSAPP_PHONE_NUMBER_ID:', PHONE_NUMBER_ID);
console.log('WHATSAPP_ACCESS_TOKEN prefix:', ACCESS_TOKEN ? ACCESS_TOKEN.substring(0, 15) + '...' : 'Undefined');

if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
  console.error('❌ Error: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured in .env.local!');
  process.exit(1);
}

// Recipient phone number: +1 (831) 471-5559
const recipient = '18314715559';

async function runTest() {
  console.log(`\nSending test template message (3p_direct_integration_test_template) to ${recipient}...`);
  
  try {
    const response = await fetch(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: '3p_direct_integration_test_template',
            language: { code: 'en_US' }
          }
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('\n❌ Meta API Error Response:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n✅ WhatsApp Test Message Sent Successfully!');
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('\n❌ HTTP Request Failed:', error);
    process.exit(1);
  }
}

runTest();
