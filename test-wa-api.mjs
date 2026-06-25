import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function testWa() {
  const cleanContact = '50684046973'; // Sample costa rican number from the codebase, but I'll use a dummy one if needed. Let's use 50688888888
  // Wait, I don't know the user's phone number. I'll just send it to a random number and see if the API says "Template not found" or "Recipient not opted in".
  const phone = '50688888888';
  
  const response = await fetch(
    `https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'welcome_promo',
          language: { code: 'en_US' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'WELCOME-TEST' }
              ]
            }
          ]
        }
      }),
    }
  );

  const data = await response.json();
  console.log("META API RESPONSE:", JSON.stringify(data, null, 2));
}

testWa();
