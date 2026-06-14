import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public');
  if (error) {
    console.log("Could not query information_schema directly. Try calling a raw query or checking some common tables.");
    // Supabase JS doesn't support information_schema via `from()` if it's not exposed. Let's try REST API or just guess some tables.
  }
}
check();
