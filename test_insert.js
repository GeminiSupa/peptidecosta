require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  console.log("Testing insert into email_subscribers...");
  const { data, error } = await supabase.from('email_subscribers').insert([{
    email: 'test_insert@test.com',
    first_name: 'Test',
    last_name: 'Test',
    tags: ['test']
  }]).select();
  
  if (error) {
    console.error("INSERT ERROR:", error);
  } else {
    console.log("INSERT SUCCESS:", data);
  }
}

test();
