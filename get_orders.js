const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('orders').select('*').in('order_number', ['WPCR-MR02F7SH', 'WPCR-MQZRHEN1']);
  console.log(JSON.stringify(data, null, 2));
}
run();
