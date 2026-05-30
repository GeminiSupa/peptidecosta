const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manually parse .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value.trim();
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase credentials not found.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLeadsTable() {
  console.log('🔍 Querying catalog_leads table schema...');
  const { data, error } = await supabase.from('catalog_leads').select('*').limit(1);
  if (error) {
    console.error('❌ Error querying catalog_leads:', error.message);
    process.exit(1);
  }
  
  if (data && data.length > 0) {
    console.log('✅ Lead row keys found:', Object.keys(data[0]));
    console.log('Full row data:', data[0]);
  } else {
    console.log('ℹ️ No leads found in the catalog_leads table, but the table exists.');
  }
}

checkLeadsTable();
