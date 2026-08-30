import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { analyticsRangeStart } from '@/lib/analyticsDashboard.mjs';

export const dynamic = 'force-dynamic';

const SAMPLE_LIMIT = 1000;
const COMPLETE_LIMIT = 10000;
// The link view is pre-grouped, so this is "top links across every campaign on
// screen", not a row sample.
const LINK_CLICK_LIMIT = 200;
// One column, so the ceiling can be high without the payload following.
const TIMESTAMP_LIMIT = 10000;

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

  const links = await fetchLinkClicks(supabase, campaignIds);

  return {
    key: 'campaigns',
    rows: (data || []).map((campaign) => ({
      ...campaign,
      engagement: engagementByCampaign[campaign.id] || null,
    })),
    links: links.rows,
    linksError: links.error,
    count: Number(count || 0),
    sampled: Number(count || 0) > (data || []).length,
    error: null,
  };
}

/**
 * What people actually clicked, per campaign.
 *
 * `campaign_link_clicks` has existed since the engagement migration and
 * analytics had never opened it, so the tab could report a click rate without
 * ever saying which link earned it. The view is already grouped, so this is a
 * few dozen rows however large the click table gets.
 */
async function fetchLinkClicks(supabase, campaignIds) {
  if (!campaignIds || campaignIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase
    .from('campaign_link_clicks')
    .select('campaign_id, target_url, clicks, unique_clicks, last_clicked_at')
    .in('campaign_id', campaignIds)
    .order('clicks', { ascending: false })
    .limit(LINK_CLICK_LIMIT);

  // A missing view should cost the tab its link breakdown, not its campaigns.
  if (error) return { rows: [], error: error.message };
  return { rows: data || [], error: null };
}

async function exactCount(query) {
  const { count, error } = await query;
  return error ? null : Number(count || 0);
}

/**
 * Timestamps only, for a daily series.
 *
 * The rest of this route's problem is that it ships whole rows to be counted in
 * the browser. This asks for one column, so a year of list activity is a few
 * hundred kilobytes rather than tens of megabytes, and the cap is reported so
 * the chart can say when it is showing a window rather than everything.
 */
async function fetchTimestamps(supabase, table, column, start, filter) {
  const rows = [];
  for (let from = 0; from < TIMESTAMP_LIMIT; from += SAMPLE_LIMIT) {
    let query = supabase
      .from(table)
      .select(column)
      .order(column, { ascending: false })
      .range(from, Math.min(from + SAMPLE_LIMIT - 1, TIMESTAMP_LIMIT - 1));
    if (start) query = query.gte(column, start);
    if (filter) query = filter(query);

    const { data, error } = await query;
    if (error) return { values: [], capped: false, error: error.message };
    rows.push(...(data || []).map((row) => row[column]).filter(Boolean));
    if ((data || []).length < SAMPLE_LIMIT) return { values: rows, capped: false, error: null };
  }
  return { values: rows, capped: true, error: null };
}

/**
 * List health: how the audience grew, and how much of it walked away.
 *
 * Totals come back as exact counts rather than as rows to be counted, so this
 * panel is never subject to the sampling caveat the rest of the tab carries.
 */
async function fetchListHealth(supabase, start) {
  // A fresh builder per query on purpose: postgrest-js mutates the URL held by
  // the query builder and hands the same object to every filter builder it
  // makes, so reusing one would leak each query's filters into the next.
  const from = (table) => supabase.from(table);
  // A suppression on 'all' silences email too, so counting only 'email' would
  // under-report opt-outs.
  const emailChannels = ['email', 'all'];
  const optOutReasons = ['unsubscribe', 'complaint', 'bounce'];
  const countOf = (table) => from(table).select('id', { count: 'exact', head: true });
  const since = (query, column) => (start ? query.gte(column, start) : query);

  const [
    subscribed,
    unsubscribed,
    added,
    optedOut,
    bounced,
    growthSeries,
    optOutSeries,
  ] = await Promise.all([
    exactCount(countOf('email_subscribers').eq('status', 'subscribed')),
    exactCount(countOf('email_subscribers').eq('status', 'unsubscribed')),
    exactCount(since(countOf('email_subscribers'), 'created_at')),
    exactCount(since(
      countOf('marketing_suppressions').in('channel', emailChannels).in('reason', optOutReasons),
      'created_at',
    )),
    exactCount(since(countOf('marketing_delivery_events').eq('status', 'failed').eq('channel', 'email'), 'last_attempt_at')),
    fetchTimestamps(supabase, 'email_subscribers', 'created_at', start),
    fetchTimestamps(
      supabase,
      'marketing_suppressions',
      'created_at',
      start,
      (query) => query.in('channel', emailChannels).in('reason', optOutReasons),
    ),
  ]);

  return {
    subscribed,
    unsubscribed,
    added,
    optedOut,
    bounced,
    addedAt: growthSeries.values,
    optedOutAt: optOutSeries.values,
    capped: growthSeries.capped || optOutSeries.capped,
    error: growthSeries.error || optOutSeries.error || null,
  };
}

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requirePermission: 'analytics' });
  if (auth.error) return auth.error;

  const range = new URL(request.url).searchParams.get('range') || 'all';
  const start = analyticsRangeStart(range);
  const supabase = getSupabaseAdmin();

  try {
    const [listHealth, ...results] = await Promise.all([
      fetchListHealth(supabase, start),
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
      if (result.links) data.campaignLinks = result.links;
      if (result.linksError) errors.push({ source: 'campaign links', message: result.linksError });
    }
    if (listHealth.error) errors.push({ source: 'list health', message: listHealth.error });

    return NextResponse.json({
      success: errors.length < SOURCES.length,
      range,
      start,
      sampleLimit: SAMPLE_LIMIT,
      data,
      counts,
      sampled,
      listHealth,
      errors,
    });
  } catch (error) {
    console.error('[Analytics Dashboard]', error);
    return NextResponse.json({ error: 'Unable to load analytics data.' }, { status: 500 });
  }
}
