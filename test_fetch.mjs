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
  const res = await fetch(`${url}/rest/v1/promo_codes?select=*,affiliates(name)`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

check();
