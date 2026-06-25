const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim();
  return acc;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking catalog_leads...");
  const { data: leads } = await supabase.from('catalog_leads').select('*').order('created_at', { ascending: false }).limit(3);
  console.log(JSON.stringify(leads, null, 2));

  console.log("\nChecking whatsapp_messages...");
  const { data: waMsgs } = await supabase.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(3);
  console.log(JSON.stringify(waMsgs, null, 2));
}
run();
