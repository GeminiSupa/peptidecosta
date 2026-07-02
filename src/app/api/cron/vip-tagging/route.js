import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const maxDuration = 60; 
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    request.headers.get('x-vercel-cron') !== '1'
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // 1. Fetch all orders that are completed/paid
  const { data: orders, error: ordersErr } = await supabaseAdmin
    .from('orders')
    .select('customer_email, total_usd')
    .eq('status', 'Completed');

  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  }

  // 2. Aggregate LTV per email
  const ltvMap = {};
  for (const o of orders) {
    if (!o.customer_email) continue;
    const email = o.customer_email.toLowerCase();
    const amount = parseFloat(o.total_usd) || 0;
    ltvMap[email] = (ltvMap[email] || 0) + amount;
  }

  // 3. Find VIPs (LTV >= 500)
  const vipEmails = Object.keys(ltvMap).filter(email => ltvMap[email] >= 500);

  if (vipEmails.length === 0) {
    return NextResponse.json({ success: true, message: 'No VIPs to tag.' });
  }

  // 4. Update tags in catalog_leads table for these VIPs
  const { data: leads, error: leadsErr } = await supabaseAdmin
    .from('catalog_leads')
    .select('id, email, tags')
    .in('email', vipEmails);

  if (leadsErr) {
    return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  }

  let taggedCount = 0;
  for (const lead of leads) {
    const currentTags = lead.tags || [];
    if (!currentTags.includes('VIP')) {
      const newTags = [...currentTags, 'VIP'];
      await supabaseAdmin
        .from('catalog_leads')
        .update({ tags: newTags })
        .eq('id', lead.id);
      taggedCount++;
    }
  }

  return NextResponse.json({
    success: true,
    vip_count: vipEmails.length,
    newly_tagged: taggedCount
  });
}
