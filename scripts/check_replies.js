const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read env variables
const envPath = path.join(__dirname, '..', '.env.local');
let envs = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const delimiterIndex = trimmed.indexOf('=');
    if (delimiterIndex === -1) return;
    envs[trimmed.substring(0, delimiterIndex).trim()] = trimmed.substring(delimiterIndex + 1).trim();
  });
}

const supabaseUrl = envs.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envs.SUPABASE_SERVICE_ROLE_KEY || envs.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error("❌ Error fetching messages:", error);
    process.exit(1);
  }

  console.log("\n--- Latest WhatsApp Messages ---");
  data.forEach((m, idx) => {
    console.log(`\n[${idx + 1}] Direction: ${m.direction.toUpperCase()} | Sender: ${m.display_name} | Phone: ${m.wa_id} | Time: ${m.created_at}`);
    console.log(`Content: "${m.message_text}"`);
  });
}

run();
