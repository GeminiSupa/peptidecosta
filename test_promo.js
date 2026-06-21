import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cbanvzipzfmllexraiei.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiYW52emlwemZtbGxleHJhaWVpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5MDYxMCwiZXhwIjoyMDk0NTY2NjEwfQ.vTByaMVMSCZVX2gFfyGwD__3TAJ6H0COJnzWC_MH7sI'
);

async function check() {
  const { data, error } = await supabase.from('promo_codes').select('target_product').limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Success:", data);
  }
}
check();
