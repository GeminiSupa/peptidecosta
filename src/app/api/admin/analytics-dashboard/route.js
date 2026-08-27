import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { analyticsRangeStart } from '@/lib/analyticsDashboard.mjs';

export const dynamic = 'force-dynamic';

const SAMPLE_LIMIT = 1000;
const COMPLETE_LIMIT = 10000;

const SOURCES = [
  {
    key: 'sessions',
    table: 'visitor_sessions',
    select: 'id, session_id, visitor_id, last_active, catalog_duration, city, device_info, created_at, hostname, current_path, page_title, known_customer, cart_items, first_touch_source, last_touch_source, utm_source, utm_medium, utm_campaign, gclid, fbclid, referrer',
    timeColumn: 'last_active',
  },
  {
    key: 'productViews',
    table: 'product_views',
    select: 'id, session_id, product_name, created_at',
  },
  {
    key: 'orders',
    table: 'orders',
    select: 'id, customer_name, status, total_usd, total_crc, created_at, items, payment_method, location_data, shipping_address, whatsapp_source, campaign_id, journey_id, source',
    complete: true,
  },
  {
    key: 'carts',
    table: 'abandoned_carts',
    select: 'id, session_id, status, cart_data, currency, created_at',
    complete: true,
  },
  {
    key: 'clicks',
    table: 'click_events',
    select: 'id, element_name, is_mobile, path, x_pct, y_pct, created_at',
    mobileOnly: true,
  },
  {
    key: 'events',
    table: 'analytics_events',
    select: 'id, event_type, hostname, path, page_title, session_id, visitor_id, utm_source, utm_medium, utm_campaign, gclid, fbclid, known_customer, referrer, created_at',
  },
];

async function fetchSource(supabase, source, start) {
  const rows = [];
  const rowLimit = source.complete ? COMPLETE_LIMIT : SAMPLE_LIMIT;
  const timeColumn = source.timeColumn || 'created_at';
  let count = 0;
  let error = null;

  for (let from = 0; from < rowLimit; from += SAMPLE_LIMIT) {
    let query = supabase
      .from(source.table)
      .select(source.select, { count: 'exact' })
      .order(timeColumn, { ascending: false })
      .range(from, Math.min(from + SAMPLE_LIMIT - 1, rowLimit - 1));
    if (start) query = query.gte(timeColumn, start);
    if (source.mobileOnly) query = query.eq('is_mobile', true);

    const result = await query;
    if (result.error) {
      error = result.error;
      break;
    }
    if (from === 0) count = Number(result.count || 0);
    rows.push(...(result.data || []));
    if (!source.complete || (result.data || []).length < SAMPLE_LIMIT) break;
  }

  return {
    key: source.key,
    rows: error ? [] : rows,
    count: error ? 0 : count,
    sampled: !error && count > rows.length,
    error: error?.message || null,
  };
}

async function fetchCampaigns(supabase) {
  const { data, error, count } = await supabase
    .from('email_campaigns')
    .select(`
      id, title, subject_line, status, sent_at, created_at,
      campaign_sends (count),
      campaign_opens (count),
      campaign_clicks (count)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(SAMPLE_LIMIT);

  if (error) {
    return { key: 'campaigns', rows: [], count: 0, sampled: false, error: error.message };
  }

  const campaignIds = (data || []).map((campaign) => campaign.id);
  let engagementByCampaign = {};
  if (campaignIds.length > 0) {
    const engagementResult = await supabase
      .from('campaign_engagement_stats')
      .select('*')
      .in('campaign_id', campaignIds);
    if (!engagementResult.error) {
      engagementByCampaign = Object.fromEntries(
        (engagementResult.data || []).map((row) => [row.campaign_id, row]),
      );
    }
  }

  return {
    key: 'campaigns',
    rows: (data || []).map((campaign) => ({
      ...campaign,
      engagement: engagementByCampaign[campaign.id] || null,
    })),
    count: Number(count || 0),
    sampled: Number(count || 0) > (data || []).length,
    error: null,
  };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requirePermission: 'analytics' });
  if (auth.error) return auth.error;

  const range = new URL(request.url).searchParams.get('range') || 'all';
  const start = analyticsRangeStart(range);
  const supabase = getSupabaseAdmin();

  try {
    const results = await Promise.all([
      ...SOURCES.map((source) => fetchSource(supabase, source, start)),
      fetchCampaigns(supabase),
    ]);
    const data = {};
    const counts = {};
    const sampled = [];
    const errors = [];

    for (const result of results) {
      data[result.key] = result.rows;
      counts[result.key] = result.count;
      if (result.sampled) sampled.push(result.key);
      if (result.error) errors.push({ source: result.key, message: result.error });
    }

    return NextResponse.json({
      success: errors.length < SOURCES.length,
      range,
      start,
      sampleLimit: SAMPLE_LIMIT,
      data,
      counts,
      sampled,
      errors,
    });
  } catch (error) {
    console.error('[Analytics Dashboard]', error);
    return NextResponse.json({ error: 'Unable to load analytics data.' }, { status: 500 });
  }
}
