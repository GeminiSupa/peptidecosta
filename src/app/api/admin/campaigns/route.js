import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const OPTIONAL_CAMPAIGN_COLUMNS = ['preview_text', 'from_name', 'from_email', 'reply_to'];

function isSchemaCacheColumnError(error) {
  const message = String(error?.message || '');
  return message.includes('schema cache') && OPTIONAL_CAMPAIGN_COLUMNS.some(column => message.includes(`'${column}'`) || message.includes(`"${column}"`) || message.includes(column));
}

function stripOptionalCampaignColumns(row) {
  const safeRow = { ...row };
  for (const column of OPTIONAL_CAMPAIGN_COLUMNS) delete safeRow[column];
  return safeRow;
}

async function insertCampaignWithSchemaFallback(supabaseAdmin, row) {
  let result = await supabaseAdmin
    .from('email_campaigns')
    .insert([row])
    .select()
    .single();

  if (result.error && isSchemaCacheColumnError(result.error)) {
    console.warn('[Campaigns] Sender/preview columns missing from schema cache; retrying draft save without optional fields.');
    result = await supabaseAdmin
      .from('email_campaigns')
      .insert([stripOptionalCampaignColumns(row)])
      .select()
      .single();
  }

  return result;
}

async function updateCampaignWithSchemaFallback(supabaseAdmin, id, updates) {
  let result = await supabaseAdmin
    .from('email_campaigns')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (result.error && isSchemaCacheColumnError(result.error)) {
    console.warn('[Campaigns] Sender/preview columns missing from schema cache; retrying draft update without optional fields.');
    result = await supabaseAdmin
      .from('email_campaigns')
      .update(stripOptionalCampaignColumns(updates))
      .eq('id', id)
      .select()
      .single();
  }

  return result;
}

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
      html_content,
      from_name,
      from_email,
      reply_to,
      preview_text,
      scheduled_at
    } = await request.json();
    
    if (!title || !subject_line) {
      return NextResponse.json({ error: 'Title and Subject Line are required' }, { status: 400 });
    }

    const status = scheduled_at ? 'scheduled' : 'draft';

    const { data, error } = await insertCampaignWithSchemaFallback(supabaseAdmin, {
      title,
      subject_line,
      subject_line_b: subject_line_b || null,
      is_ab_test: is_ab_test || false,
      target_tags: target_tags || null,
      design_json,
      html_content,
      preview_text: preview_text || null,
      from_name: from_name || null,
      from_email: from_email || null,
      reply_to: reply_to || null,
      scheduled_for: scheduled_at || null,
      status
    });

    if (error) throw error;

    return NextResponse.json({ campaign: data });
  } catch (err) {
    console.error('Error saving campaign:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { 
      id,
      title, 
      subject_line, 
      subject_line_b, 
      is_ab_test, 
      target_tags, 
      design_json, 
      html_content,
      from_name,
      from_email,
      reply_to,
      preview_text,
      scheduled_at
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (subject_line !== undefined) updates.subject_line = subject_line;
    if (subject_line_b !== undefined) updates.subject_line_b = subject_line_b || null;
    if (is_ab_test !== undefined) updates.is_ab_test = is_ab_test;
    if (target_tags !== undefined) updates.target_tags = target_tags || null;
    if (design_json !== undefined) updates.design_json = design_json;
    if (html_content !== undefined) updates.html_content = html_content;
    if (preview_text !== undefined) updates.preview_text = preview_text || null;
    if (from_name !== undefined) updates.from_name = from_name || null;
    if (from_email !== undefined) updates.from_email = from_email || null;
    if (reply_to !== undefined) updates.reply_to = reply_to || null;
    if (scheduled_at !== undefined) {
      updates.scheduled_for = scheduled_at || null;
      updates.status = scheduled_at ? 'scheduled' : 'draft';
    }

    const { data, error } = await updateCampaignWithSchemaFallback(supabaseAdmin, id, updates);

    if (error) throw error;

    return NextResponse.json({ campaign: data });
  } catch (err) {
    console.error('Error updating campaign:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('email_campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting campaign:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
