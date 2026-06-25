const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  if (line.includes('=') && !line.startsWith('#')) {
    const [key, ...val] = line.split('=');
    env[key.trim()] = val.join('=').trim();
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function createPromo() {
  // Tomorrow at 11:59 PM CST (Costa Rica Time)
  // CST is UTC-6
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setUTCHours(23 + 6, 59, 0, 0); // 11:59 PM CST -> 05:59 AM UTC next day

  const { data, error } = await supabase.from('promo_codes').insert([{
    code: 'PIELHERMOSA',
    discount_pct: 0.15,
    is_flash_sale: true,
    target_product: 'GHK-Cu', // We will assume the target_product just needs to contain 'GHK' or 'GHK-Cu'
    valid_from: new Date().toISOString(),
    valid_until: date.toISOString(),
    is_active: true
  }]).select();

  if (error) {
    console.error('Error creating promo:', error);
  } else {
    console.log('Promo created:', data);
  }
}

createPromo();
