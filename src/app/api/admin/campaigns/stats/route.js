import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// One campaign's worth of engagement, so the per-link rollup can be done in
// JS when the views from campaign-engagement-stats.sql are not there yet.
const EVENT_ROW_CAP = 5000;
const RECENT_ACTIVITY_LIMIT = 25;

function isMissingRelationError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || message.includes('schema cache');
}

async function safeRows(label, query, warnings) {
  const { data, error } = await query;
  if (error) {
    if (!isMissingRelationError(error)) console.warn(`[Campaign stats] ${label}:`, error.message);
    warnings.push(label);
    return null;
  }
  return data || [];
}

/** Group clicks by destination. Prefers the view; falls back to raw rows. */
function rollUpLinks(rows) {
  const links = new Map();
  for (const row of rows) {
    const url = row.target_url;
    if (!url) continue;
    const entry = links.get(url) || { target_url: url, clicks: 0, subscribers: new Set(), last_clicked_at: null };
    entry.clicks += 1;
    if (row.subscriber_id) entry.subscribers.add(row.subscriber_id);
    if (!entry.last_clicked_at || row.created_at > entry.last_clicked_at) entry.last_clicked_at = row.created_at;
    links.set(url, entry);
  }
  return [...links.values()]
    .map(({ subscribers, ...link }) => ({ ...link, unique_clicks: subscribers.size }))
    .sort((a, b) => b.unique_clicks - a.unique_clicks || b.clicks - a.clicks);
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const campaignId = new URL(request.url).searchParams.get('id');
  if (!campaignId) return NextResponse.json({ error: 'A campaign id is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const warnings = [];

  try {
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const [engagementRows, linkRows, clickRows, openRows, batches] = await Promise.all([
      safeRows('engagement view', supabase.from('campaign_engagement_stats').select('*').eq('campaign_id', campaignId).limit(1), warnings),
      safeRows('link view', supabase.from('campaign_link_clicks').select('*').eq('campaign_id', campaignId), warnings),
      safeRows('clicks', supabase.from('campaign_clicks').select('subscriber_id, target_url, created_at').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(EVENT_ROW_CAP), warnings),
      safeRows('opens', supabase.from('campaign_opens').select('subscriber_id, created_at').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(EVENT_ROW_CAP), warnings),
      safeRows('delivery batches', supabase.from('campaign_delivery_batches').select('*').eq('campaign_id', campaignId).order('started_at', { ascending: false }).limit(10), warnings),
    ]);

    // The view is authoritative when present: it counts the whole table, while
    // the raw rows are capped and would undercount a large campaign.
    let engagement = engagementRows?.[0] || null;
    if (!engagement) {
      const { count: sends } = await supabase
        .from('campaign_sends')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);
      const uniqueOpens = new Set((openRows || []).map(row => row.subscriber_id).filter(Boolean));
      const uniqueClicks = new Set((clickRows || []).map(row => row.subscriber_id).filter(Boolean));
      engagement = {
        campaign_id: campaignId,
        sends: sends || 0,
        total_opens: (openRows || []).length,
        unique_opens: uniqueOpens.size,
        total_clicks: (clickRows || []).length,
        unique_clicks: uniqueClicks.size,
      };
    }

    const links = Array.isArray(linkRows) && linkRows.length
      ? [...linkRows].sort((a, b) => b.unique_clicks - a.unique_clicks || b.clicks - a.clicks)
      : rollUpLinks(clickRows || []);

    // Put a face on the most recent engagement. Bounded by the ids actually
    // seen in the capped event rows, so this never fans out to the whole list.
    const recentIds = [...new Set([
      ...(openRows || []).slice(0, RECENT_ACTIVITY_LIMIT).map(row => row.subscriber_id),
      ...(clickRows || []).slice(0, RECENT_ACTIVITY_LIMIT).map(row => row.subscriber_id),
    ].filter(Boolean))];

    let subscriberMap = {};
    if (recentIds.length) {
      const people = await safeRows('subscribers', supabase.from('email_subscribers').select('id, email, first_name').in('id', recentIds), warnings);
      subscriberMap = Object.fromEntries((people || []).map(person => [person.id, person]));
    }

    const describe = (row, action) => ({
      action,
      at: row.created_at,
      email: subscriberMap[row.subscriber_id]?.email || null,
      first_name: subscriberMap[row.subscriber_id]?.first_name || null,
      target_url: row.target_url || null,
    });

    const recentActivity = [
      ...(clickRows || []).slice(0, RECENT_ACTIVITY_LIMIT).map(row => describe(row, 'click')),
      ...(openRows || []).slice(0, RECENT_ACTIVITY_LIMIT).map(row => describe(row, 'open')),
    ]
      .filter(entry => entry.email)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, RECENT_ACTIVITY_LIMIT);

    const { data: orders } = await supabase
      .from('orders')
      .select('total_usd')
      .eq('campaign_id', campaignId);

    return NextResponse.json({
      campaign,
      engagement,
      links,
      recentActivity,
      deliveryBatches: batches || [],
      revenue: {
        orders: (orders || []).length,
        total: (orders || []).reduce((sum, order) => sum + parseFloat(order.total_usd || 0), 0),
      },
      // The events tables are read with a cap; say so rather than letting a
      // large campaign quietly present a partial link table as the whole truth.
      truncated: (clickRows || []).length >= EVENT_ROW_CAP,
      warnings,
    });
  } catch (err) {
    console.error('[Campaign stats]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
