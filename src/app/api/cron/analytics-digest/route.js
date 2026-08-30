import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyCronRequest } from '@/lib/cronAuth';
import { getOrderMailSettings } from '@/lib/transactionalSmtp';
import { campaignEngagement } from '@/lib/campaignEngagement.mjs';
import {
  campaignRevenueIndex,
  isSuccessfulAnalyticsOrder,
} from '@/lib/analyticsDashboard.mjs';
import { orderNetRevenue } from '@/lib/orderRevenue.mjs';
import { buildAnalyticsDigest, renderAnalyticsDigestEmail } from '@/lib/analyticsDigest.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ORDER_COLUMNS = 'id, status, total_usd, total_crc, created_at, items, campaign_id';

/**
 * The best analytics screen is one nobody has to remember to open.
 *
 * Revenue here goes through orderNetRevenue and campaign attribution through
 * campaignRevenueIndex — the same helpers the tab uses — so the Monday email
 * and the dashboard cannot report different numbers for the same week.
 */
async function ordersBetween(supabase, start, end) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .limit(10000);
  if (error) throw error;
  return data || [];
}

function revenueOf(orders) {
  const successful = (orders || []).filter(isSuccessfulAnalyticsOrder);
  const revenueUsd = successful.reduce((sum, order) => sum + orderNetRevenue(order).usd, 0);
  return {
    orders: successful.length,
    revenueUsd,
    aovUsd: successful.length > 0 ? revenueUsd / successful.length : 0,
    successful,
  };
}

const cartValue = (cartData) => (Array.isArray(cartData) ? cartData : []).reduce((total, item) => {
  const price = parseFloat(String(item?.price_usd || item?.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
  return total + price * (item?.qty || 1);
}, 0);

async function windowSummary(supabase, start, end) {
  const [orders, cartsResult, overview] = await Promise.all([
    ordersBetween(supabase, start, end),
    supabase
      .from('abandoned_carts')
      .select('id, status, cart_data, created_at')
      .gte('created_at', start)
      .lt('created_at', end)
      .limit(10000),
    supabase.rpc('analytics_overview', { range_start: start, range_end: end }),
  ]);

  const money = revenueOf(orders);
  const carts = (cartsResult.data || []).filter((cart) => cart.status === 'active');
  // Null until analytics-aggregates-migration.sql is run; the digest then omits
  // the visitor-based rows rather than quoting a 1,000-row sample at you.
  const visitors = Number(overview.data?.sessions?.total || 0);

  return {
    ...money,
    visitors,
    conversionRate: visitors > 0 ? Math.min((money.orders / visitors) * 100, 100) : 0,
    abandonedCarts: carts.length,
    abandonedUsd: carts.reduce((sum, cart) => sum + cartValue(cart.cart_data), 0),
    productViews: overview.data?.productViews || [],
  };
}

/** The campaign that earned the most in the week, if any did. */
function bestCampaign(campaigns, successfulOrders) {
  const revenue = campaignRevenueIndex(successfulOrders);
  let best = null;
  for (const campaign of campaigns || []) {
    const earned = revenue.get(campaign.id);
    if (!earned || earned.revenueUsd <= 0) continue;
    if (!best || earned.revenueUsd > best.revenueUsd) {
      best = {
        name: campaign.title || campaign.subject_line || 'Campaign',
        revenueUsd: earned.revenueUsd,
        orders: earned.orders,
        sends: campaignEngagement(campaign).sends,
      };
    }
  }
  return best;
}

export async function GET(request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  const { smtp, from } = getOrderMailSettings();
  const recipients = (process.env.ANALYTICS_DIGEST_EMAILS
    || process.env.COMMISSION_REPORT_ADMIN_EMAILS
    || 'omerforce@gmail.com')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);

  try {
    const supabase = getSupabaseAdmin();
    const now = new Date();
    const start = new Date(now.getTime() - WEEK_MS).toISOString();
    const previousStart = new Date(now.getTime() - 2 * WEEK_MS).toISOString();

    const [current, previous, campaignsResult, listHealth] = await Promise.all([
      windowSummary(supabase, start, now.toISOString()),
      windowSummary(supabase, previousStart, start),
      supabase
        .from('email_campaigns')
        .select('id, title, subject_line, status, sent_at, created_at')
        .gte('sent_at', start)
        .limit(200),
      readListHealth(supabase, start),
    ]);

    const digest = buildAnalyticsDigest({
      current,
      previous,
      listHealth,
      topCampaign: bestCampaign(campaignsResult.data, current.successful),
      topProducts: current.productViews.slice(0, 3),
    });

    const rangeLabel = `week to ${new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Costa_Rica', month: 'short', day: 'numeric',
    }).format(now)}`;
    const mail = renderAnalyticsDigestEmail(digest, {
      rangeLabel,
      dashboardUrl: process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin` : '',
    });

    if (!smtp.host || recipients.length === 0) {
      // Answering 200 while quietly sending nothing is what hid days of missing
      // order mail once already. Say so instead.
      return NextResponse.json({
        sent: false,
        reason: smtp.host ? 'No recipients configured' : 'SMTP is not configured',
        preview: mail.subject,
      }, { status: 503 });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    await transporter.sendMail({
      from,
      to: recipients.join(', '),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    return NextResponse.json({ sent: true, recipients: recipients.length, subject: mail.subject });
  } catch (error) {
    console.error('[Analytics Digest]', error);
    return NextResponse.json({ error: 'Could not build or send the weekly digest.' }, { status: 500 });
  }
}

/** Exact counts, so the list figures are not a sample. */
async function readListHealth(supabase, start) {
  const count = (query) => query.then(({ count: total, error }) => (error ? 0 : Number(total || 0)));
  const emailChannels = ['email', 'all'];
  const optOutReasons = ['unsubscribe', 'complaint', 'bounce'];
  const [subscribed, added, optedOut] = await Promise.all([
    count(supabase.from('email_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'subscribed')),
    count(supabase.from('email_subscribers').select('id', { count: 'exact', head: true }).gte('created_at', start)),
    count(supabase.from('marketing_suppressions').select('id', { count: 'exact', head: true })
      .in('channel', emailChannels).in('reason', optOutReasons).gte('created_at', start)),
  ]);
  return { subscribed, added, optedOut };
}
