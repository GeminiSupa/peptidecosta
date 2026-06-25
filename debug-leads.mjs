import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking catalog_leads...");
  const { data: leads, error: leadErr } = await supabase
    .from('catalog_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  if (leadErr) console.error("Lead Err:", leadErr);
  else console.log(JSON.stringify(leads, null, 2));

  console.log("\nChecking whatsapp_messages...");
  const { data: waMsgs, error: waErr } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  if (waErr) console.error("WA Err:", waErr);
  else console.log(JSON.stringify(waMsgs, null, 2));
}

run();
