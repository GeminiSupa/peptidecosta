const fs = require('fs');
const https = require('https');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) {
    env[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  }
});

const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?order_number=eq.WPCR-MR02F7SH`;
const payload = JSON.stringify({ total_crc: 600030 });

const req = https.request(url, {
  method: 'PATCH',
  headers: {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log("Updated order response:", data);
  });
});

req.on('error', e => console.error(e));
req.write(payload);
req.end();
