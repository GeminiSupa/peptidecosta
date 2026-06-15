const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function agentMatchKeys(profile) {
  const keys = new Set();
  if (!profile) return keys;
  const name = String(profile.name || '').trim().toLowerCase();
  const email = String(profile.email || '').trim().toLowerCase();
  if (name) keys.add(name);
  if (email) {
    keys.add(email);
    const local = email.split('@')[0];
    if (local) keys.add(local);
  }
  return keys;
}

function orderBelongsToAgent(order, profile) {
  if (!order || !profile) return false;
  const orderAgent = String(order.sales_agent || '').trim().toLowerCase();
  if (!orderAgent) return false;
  return agentMatchKeys(profile).has(orderAgent);
}

async function run() {
  const startDateStr = '2026-06-08T06:00:00.000Z';
  const endDateStr = '2026-06-15T05:59:59.999Z';
  
  const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr)
      .not('status', 'eq', 'Cancelled');
      
  const { data: profiles } = await supabaseAdmin
      .from('admin_profiles')
      .select('*');
      
  const agent = profiles.find(p => p.email === 'Camilledankers11@gmail.com');
  
  const agentOrders = (orders || []).filter((order) => {
    return orderBelongsToAgent(order, agent);
  });
  
  console.log("Agent:", agent.name, agent.email);
  console.log("Total orders in range:", orders ? orders.length : 0);
  console.log("Agent orders:", agentOrders.length);
}
run();
