import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  const { error } = await supabase.rpc('execute_sql', {
    sql: 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ; UPDATE public.orders SET completed_at = created_at WHERE status IN (\'Paid\', \'Completed\', \'Order Complete\') AND completed_at IS NULL;'
  });
  if (error) {
    console.log("RPC execute_sql failed, trying REST API logic or outputting SQL");
    console.log(error);
  } else {
    console.log("Success");
  }
}
main();
