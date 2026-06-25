import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .select(`
        *,
        campaign_sends (count),
        campaign_opens (count),
        campaign_clicks (count)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch E-commerce attribution data (orders linked to campaigns)
    const campaignIds = data.map(c => c.id);
    let revenueMap = {};
    if (campaignIds.length > 0) {
      const { data: orderData } = await supabaseAdmin
        .from('orders')
        .select('campaign_id, total_usd')
        .in('campaign_id', campaignIds);
      
      if (orderData) {
        for (const ord of orderData) {
          if (!revenueMap[ord.campaign_id]) {
            revenueMap[ord.campaign_id] = { count: 0, revenue: 0 };
          }
          revenueMap[ord.campaign_id].count++;
          revenueMap[ord.campaign_id].revenue += parseFloat(ord.total_usd || 0);
        }
      }
    }

    // Merge revenue data into campaigns
    const enrichedCampaigns = data.map(c => ({
      ...c,
      orders_count: revenueMap[c.id]?.count || 0,
      orders_revenue: revenueMap[c.id]?.revenue || 0,
    }));

    return NextResponse.json({ campaigns: enrichedCampaigns });
  } catch (err) {
    console.error('Error fetching campaigns:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { 
      title, 
      subject_line, 
      subject_line_b, 
      is_ab_test, 
      target_tags, 
      design_json, 
      html_content 
    } = await request.json();
    
    if (!title || !subject_line) {
      return NextResponse.json({ error: 'Title and Subject Line are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('email_campaigns')
      .insert([{ 
        title, 
        subject_line, 
        subject_line_b: subject_line_b || null,
        is_ab_test: is_ab_test || false,
        target_tags: target_tags || null,
        design_json, 
        html_content,
        status: 'draft'
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ campaign: data });
  } catch (err) {
    console.error('Error saving campaign:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
