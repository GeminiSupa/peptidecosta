const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});

async function run() {
  const pageId = env.FACEBOOK_PAGE_ID;
  const token = env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) {
    console.error("Missing FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN");
    return;
  }
  
  const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}/subscribed_apps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      subscribed_fields: ['messages', 'messaging_postbacks', 'feed', 'leadgen']
    })
  });
  
  const data = await res.json();
  console.log("Response:", data);
}
run();
