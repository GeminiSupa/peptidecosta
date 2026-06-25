const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});

async function run() {
  const payload = {
    name: "welcome_promo1",
    language: "es", // Changed to Spanish to match the text!
    category: "MARKETING",
    components: [
      {
        type: "BODY",
        text: "¡Bienvenido a Peptides Costa Rica! Gracias por registrarte. Como regalo especial, aquí tienes un código promocional de un solo uso para obtener un 15% de descuento en tu primera compra: {{1}}\n\nPuedes aplicar este código durante el proceso de pago. Válido únicamente para una compra.",
        example: {
          body_text: [["WELCOME-A9F3X2"]]
        }
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Visit Catalog",
            url: "https://catalog.peptidescostarica.net/catalog"
          }
        ]
      }
    ]
  };

  const response = await fetch(
    `https://graph.facebook.com/v25.0/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    }
  );
  const data = await response.json();
  console.log("META API CREATE RESPONSE:", JSON.stringify(data, null, 2));

  // Wait 5 seconds to check if it gets purged or approved
  await new Promise(r => setTimeout(r, 5000));
  
  const check = await fetch(
    `https://graph.facebook.com/v25.0/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?name=welcome_promo1`,
    { headers: { 'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } }
  );
  const checkData = await check.json();
  console.log("META API CHECK RESPONSE:", JSON.stringify(checkData, null, 2));
}
run();
