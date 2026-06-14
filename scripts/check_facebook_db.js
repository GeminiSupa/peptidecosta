import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('facebook_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) console.error('Error fetching:', error);
  else {
    console.log('Recent 5 notifications:');
    data.forEach(n => console.log(`- [${n.type}] ${n.sender_name}: ${n.content} (Read: ${n.status})`));
  }
}
check();
