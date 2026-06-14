import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('facebook_notifications')
    .insert({
      type: 'message',
      sender_name: 'Test',
      sender_id: '123',
      content: 'Hello'
    })
    .select();
  
  if (error) console.error('Error inserting:', error);
  else console.log('Inserted:', data);
}
check();
