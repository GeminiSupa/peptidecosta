const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Fetch one row to see actual column names
  const { data, error } = await supabaseAdmin
      .from('commission_payouts')
      .select('*')
      .limit(1);
      
  if (error) {
    console.error("Error:", error);
  } else if (data && data.length > 0) {
    console.log("Actual columns:", Object.keys(data[0]));
    console.log("Sample row:", data[0]);
  } else {
    console.log("Table is empty — trying insert with minimal fields to see what's required...");
    const { error: e2 } = await supabaseAdmin.from('commission_payouts').insert([{
      agent_email: 'test@test.com', status: 'Pending'
    }]);
    console.log("Minimal insert error:", e2);
  }
}
run();
