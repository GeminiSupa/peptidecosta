const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});
async function run() {
  const response = await fetch(
    `https://graph.facebook.com/v25.0/${env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,status,language&limit=50`,
    {
      headers: {
        'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`
      }
    }
  );
  const data = await response.json();
  console.log("TEMPLATES:", JSON.stringify(data, null, 2));
}
run();
