import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim();
  return acc;
}, {});

const supabaseUrl = envConfig['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = envConfig['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
  if (cleaned.length === 8) cleaned = '506' + cleaned;
  else if (cleaned.length === 10) cleaned = '1' + cleaned;
  return cleaned;
};

async function run() {
  console.log('Starting phone number formatting migration...');
  
  let totalOrders = 0;
  let totalCarts = 0;
  let totalLeads = 0;

  // 1. Orders
  console.log('Fetching orders...');
  const { data: orders, error: ordersErr } = await supabase.from('orders').select('id, customer_phone');
  if (ordersErr) console.error('Orders fetch error:', ordersErr);
  if (orders) {
    console.log(`Found ${orders.length} orders to check.`);
    for (const order of orders) {
      if (order.customer_phone) {
        const formatted = cleanPhoneNumber(order.customer_phone);
        if (formatted !== order.customer_phone) {
          await supabase.from('orders').update({ customer_phone: formatted }).eq('id', order.id);
          totalOrders++;
        }
      }
    }
  }

  // 2. Abandoned Carts
  const { data: carts } = await supabase.from('abandoned_carts').select('id, customer_phone');
  if (carts) {
    for (const cart of carts) {
      if (cart.customer_phone) {
        const formatted = cleanPhoneNumber(cart.customer_phone);
        if (formatted !== cart.customer_phone) {
          await supabase.from('abandoned_carts').update({ customer_phone: formatted }).eq('id', cart.id);
          totalCarts++;
        }
      }
    }
  }

  // 3. Catalog Leads
  const { data: leads } = await supabase.from('catalog_leads').select('id, contact_value').eq('contact_method', 'whatsapp');
  if (leads) {
    for (const lead of leads) {
      if (lead.contact_value) {
        const formatted = cleanPhoneNumber(lead.contact_value);
        if (formatted !== lead.contact_value) {
          await supabase.from('catalog_leads').update({ contact_value: formatted }).eq('id', lead.id);
          totalLeads++;
        }
      }
    }
  }

  console.log('Migration Complete!');
  console.log(`Updated Orders: ${totalOrders}`);
  console.log(`Updated Abandoned Carts: ${totalCarts}`);
  console.log(`Updated Catalog Leads: ${totalLeads}`);
  process.exit(0);
}

run().catch(console.error);
