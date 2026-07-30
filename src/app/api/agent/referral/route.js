import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { agentMatchKeys, orderBelongsToAgent, getOrderSalesAmounts } from '@/lib/agentOrders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same catalog origin the admin Affiliates QR builder uses, so a rep's personal
// QR points at exactly the same storefront as every other referral link.
const CATALOG_BASE_URL =
  process.env.NEXT_PUBLIC_AFFILIATE_CATALOG_URL ||
  'https://catalog.peptidescostarica.net/catalog?lang=es';

const MAX_DAYS = 365;

// An order counts as a conversion once it is actually paid, matching how the
// admin referral dashboard and the payout report treat "paid".
const PAID = new Set(['paid', 'completed', 'order complete', 'processing']);
const norm = (v) => String(v || '').trim().toLowerCase();

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * The rep's personal catalog link. sales_agent carries their team-profile name,
 * which is the exact value that lands on an order at checkout
 * (catalog reads ?sales_agent= into localStorage, then onto the order). So a
 * scan of this QR and the order it produces are attributed to the same key.
 */
function buildReferralLink(name) {
  const url = new URL(CATALOG_BASE_URL);
  if (!url.searchParams.get('lang')) url.searchParams.set('lang', 'es');
  url.searchParams.set('sales_agent', name);
  url.searchParams.set('utm_source', 'sales_rep');
  url.searchParams.set('utm_medium', 'qr');
  url.searchParams.set('utm_campaign', slugify(name) || 'rep');
  url.searchParams.set('referral', name);
  url.searchParams.set('gate', 'skip');
  return url.toString();
}

/**
 * A single sales rep's own referral link + their own scan/conversion numbers.
 *
 * Scoped strictly to the caller via agentMatchKeys (name + email variants), the
 * same match rule the pay/commission code uses, so a rep only ever sees the
 * numbers for links attributed to them.
 */
export async function GET(request) {
  // Sub-users need this: sharing their referral link is the whole job.
  const auth = await verifyAdminSession(request, { allowSubUser: true });
  if (auth.error) return auth.error;

  try {
    const profile = auth.profile;
    const name = String(profile?.name || '').trim();
    if (!name) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Your team profile has no name set yet. Ask an admin to add your name so your personal QR code can be created.',
        },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get('days')) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const link = buildReferralLink(name);

    const supabase = getSupabaseAdmin();
    const keys = agentMatchKeys(profile);
    const matchesMe = (value) => {
      const key = norm(value);
      return key ? keys.has(key) : false;
    };

    const [scansRes, ordersRes] = await Promise.all([
      supabase
        .from('referral_scans')
        .select('sales_agent, referral, device_type, is_first_visit, created_at')
        .gte('created_at', since)
        .limit(20000),
      supabase
        .from('orders')
        .select('sales_agent, status, total_usd, total_crc, currency, created_at')
        .gte('created_at', since)
        .limit(20000),
    ]);

    // Scan tracking is optional — the table may not exist until the migration
    // has run. That is not an error; the rep still gets their link and QR, with
    // scan numbers simply reported as zero until tracking is switched on.
    let scans = [];
    let migrationRequired = false;
    if (scansRes.error) {
      if (/relation .* does not exist/i.test(scansRes.error.message || '')) {
        migrationRequired = true;
      } else {
        console.error('[agent/referral]', scansRes.error.message);
        return NextResponse.json({ ok: false, error: scansRes.error.message }, { status: 500 });
      }
    } else {
      scans = (scansRes.data || []).filter(
        (s) => matchesMe(s.sales_agent) || matchesMe(s.referral)
      );
    }

    if (ordersRes.error) {
      console.error('[agent/referral]', ordersRes.error.message);
      return NextResponse.json({ ok: false, error: ordersRes.error.message }, { status: 500 });
    }

    const paidOrders = (ordersRes.data || []).filter(
      (o) => orderBelongsToAgent(o, profile) && PAID.has(norm(o.status))
    );

    let revenueUsd = 0;
    for (const order of paidOrders) revenueUsd += getOrderSalesAmounts(order).usd;

    const byDevice = {};
    let firstVisits = 0;
    for (const scan of scans) {
      const device = scan.device_type || 'unknown';
      byDevice[device] = (byDevice[device] || 0) + 1;
      if (scan.is_first_visit) firstVisits += 1;
    }
    const totalScans = scans.length;
    const topDevice = Object.entries(byDevice).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return NextResponse.json({
      ok: true,
      name,
      link,
      days,
      migrationRequired,
      stats: {
        scans: totalScans,
        firstVisits,
        orders: paidOrders.length,
        revenueUsd: Math.round(revenueUsd * 100) / 100,
        // Undefined rather than 0 with no scans: 0% would imply the link was
        // tried and failed, when in fact nothing was measured yet.
        conversionRate:
          totalScans > 0 ? Math.round((paidOrders.length / totalScans) * 1000) / 10 : null,
        byDevice,
        topDevice,
      },
    });
  } catch (err) {
    console.error('[agent/referral]', err);
    return NextResponse.json({ ok: false, error: err.message || 'Internal error' }, { status: 500 });
  }
}
