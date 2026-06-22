import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.log("No env vars found");
  process.exit(1);
}

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

async function check() {
  const payload = {
    code: "TEST12",
    discount_pct: 0.15,
    is_flash_sale: true,
    target_product: "Tirzepatide",
    valid_from: new Date().toISOString(),
    valid_until: new Date(Date.now() + 86400000).toISOString()
  };

  const res = await fetch(`${url}/rest/v1/promo_codes`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    console.error(await res.text());
  } else {
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  }
}

check();
