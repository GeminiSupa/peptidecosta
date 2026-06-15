const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('orders').select('id, created_at, sales_agent, status').gte('created_at', '2026-06-08').lte('created_at', '2026-06-15').eq('sales_agent', 'Pollita').neq('status', 'Cancelled');
  if (error) {
    console.error(error);
  } else {
    console.log("Orders found:", data.length);
    console.log(data);
  }
}
run();
