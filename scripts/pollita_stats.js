import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: profiles } = await supabase.from('admin_profiles').select('*').ilike('name', '%pollita%');
  if (!profiles || profiles.length === 0) {
    console.log("No agent found with name Pollita");
    return;
  }
  
  const pollita = profiles[0];
  console.log('Found Agent:', pollita.name, pollita.email);
  console.log('Commission Rate:', pollita.commission_rate, '%');
  console.log('Weekly Salary:', pollita.weekly_salary, pollita.salary_currency);
  
  // Get this week boundaries
  const CR_OFFSET = -6;
  const nowUTC = new Date();
  const nowCR = new Date(nowUTC.getTime() + (CR_OFFSET * 60 * 60 * 1000));
  const day = nowCR.getUTCDay();
  const dayOffset = day === 0 ? 7 : day; 

  const currentMondayCR = new Date(nowCR);
  currentMondayCR.setUTCDate(nowCR.getUTCDate() - dayOffset + 1);
  currentMondayCR.setUTCHours(0, 0, 0, 0);

  const startDate = new Date(currentMondayCR.getTime() - (CR_OFFSET * 60 * 60 * 1000));
  const endDate = new Date(nowCR.getTime() - (CR_OFFSET * 60 * 60 * 1000));
  
  console.log('Scanning from:', startDate.toISOString(), 'to', endDate.toISOString());

  const { data: orders } = await supabase
    .from('orders')
    .select('id, total_usd, total_crc, currency, sales_agent, created_at, status')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .not('status', 'eq', 'Cancelled');
    
  let usdSales = 0;
  let crcSales = 0;
  let count = 0;
  
  const agentName = String(pollita.name || '').trim().toLowerCase();
  const agentEmail = String(pollita.email || '').trim().toLowerCase();
  const agentEmailLocal = agentEmail.split('@')[0];

  for (const o of orders || []) {
    const orderAgent = String(o.sales_agent || '').trim().toLowerCase();
    if (orderAgent && (orderAgent === agentName || orderAgent === agentEmail || orderAgent === agentEmailLocal)) {
      count++;
      usdSales += Number(o.total_usd || 0);
      crcSales += Number(o.total_crc || 0);
    }
  }
  
  const usdComm = usdSales * (Number(pollita.commission_rate) / 100);
  const crcComm = crcSales * (Number(pollita.commission_rate) / 100);
  
  let totalUSD = usdComm;
  let totalCRC = crcComm;
  if (pollita.salary_currency === 'USD') totalUSD += Number(pollita.weekly_salary || 0);
  else totalCRC += Number(pollita.weekly_salary || 0);
  
  console.log('-----------------------------------');
  console.log(`Pollita's Current Week To Date:`);
  console.log(`Closed Orders: ${count}`);
  console.log(`Gross Sales USD: $${usdSales.toFixed(2)}`);
  console.log(`Gross Sales CRC: ₡${crcSales.toFixed(0)}`);
  console.log(`Earned Commissions USD: $${usdComm.toFixed(2)}`);
  console.log(`Earned Commissions CRC: ₡${crcComm.toFixed(0)}`);
  console.log(`Total Payout Owed USD: $${totalUSD.toFixed(2)}`);
  console.log(`Total Payout Owed CRC: ₡${totalCRC.toFixed(0)}`);
  console.log('-----------------------------------');
}
check();
