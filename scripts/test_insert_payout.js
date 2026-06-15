const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function agentMatchKeys(profile) {
  const keys = new Set();
  if (!profile) return keys;
  const name = String(profile.name || '').trim().toLowerCase();
  const email = String(profile.email || '').trim().toLowerCase();
  if (name) keys.add(name);
  if (email) { keys.add(email); const local = email.split('@')[0]; if (local) keys.add(local); }
  return keys;
}
function orderBelongsToAgent(order, profile) {
  if (!order || !profile) return false;
  const orderAgent = String(order.sales_agent || '').trim().toLowerCase();
  if (!orderAgent) return false;
  return agentMatchKeys(profile).has(orderAgent);
}
function getOrderSalesAmounts(order) {
  let usd = Number(order.total_usd || 0);
  let crc = Number(order.total_crc || 0);
  if (!usd && !crc && order.total != null) {
    const total = Number(order.total || 0);
    if (order.currency === 'USD') usd = total;
    else crc = total;
  }
  return { usd, crc };
}

async function run() {
  // Use the exact same date range as the UI (custom 2026-06-08 to 2026-06-14)
  // Custom dates are treated as CR time midnight start/end
  const startDateStr = new Date('2026-06-08T00:00:00.000Z').toISOString(); // 2026-06-08 midnight UTC
  const endDateStr = new Date('2026-06-14T23:59:59.999Z').toISOString();   // 2026-06-14 end UTC

  console.log("Querying orders from", startDateStr, "to", endDateStr);

  const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .gte('created_at', startDateStr)
      .lte('created_at', endDateStr)
      .not('status', 'eq', 'Cancelled');

  const { data: profiles } = await supabaseAdmin.from('admin_profiles').select('*');
  const agent = profiles.find(p => p.email === 'Camilledankers11@gmail.com');

  const agentOrders = (orders || []).filter((order) => orderBelongsToAgent(order, agent));
  let usdSales = 0; let crcSales = 0;
  for (const order of agentOrders) {
    const amounts = getOrderSalesAmounts(order);
    usdSales += amounts.usd;
    crcSales += amounts.crc;
  }

  console.log("Agent:", agent.name, "| Orders:", agentOrders.length, "| USD:", usdSales, "| CRC:", crcSales);

  // Test the exact insert without period_label
  const { data, error } = await supabaseAdmin
    .from('commission_payouts')
    .insert([{
      agent_id: agent.user_id,
      agent_name: agent.name,
      agent_email: agent.email,
      start_date: startDateStr,
      end_date: endDateStr,
      usd_sales: usdSales,
      crc_sales: crcSales,
      commission_rate: agent.commission_rate,
      usd_commission: usdSales * (agent.commission_rate / 100),
      crc_commission: crcSales * (agent.commission_rate / 100),
      weekly_salary_paid: agent.weekly_salary,
      salary_currency: agent.salary_currency,
      total_payout_usd: usdSales * (agent.commission_rate / 100) + (agent.salary_currency === 'USD' ? agent.weekly_salary : 0),
      total_payout_crc: crcSales * (agent.commission_rate / 100) + (agent.salary_currency !== 'USD' ? agent.weekly_salary : 0),
      orders_data: agentOrders.map(o => ({ id: o.id, order_number: o.order_number, total_usd: o.total_usd, total_crc: o.total_crc, currency: o.currency, customer_name: o.customer_name, created_at: o.created_at, status: o.status })),
      email_html: 'test',
      status: 'Pending'
    }])
    .select('id');

  if (error) {
    console.error("INSERT ERROR:", error);
  } else {
    console.log("✅ Insert successful! ID:", data[0].id);
    // Clean up test row
    await supabaseAdmin.from('commission_payouts').delete().eq('id', data[0].id);
    console.log("Test row cleaned up.");
  }
}
run();
