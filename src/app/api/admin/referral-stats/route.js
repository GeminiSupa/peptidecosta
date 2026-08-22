import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { buildReferralStats } from '@/lib/referralStats.mjs';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DAYS = 365;

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get('days')) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const supabase = getSupabaseAdmin();

    const [scansResult, ordersResult, exchangeRateResult] = await Promise.all([
      supabase
        .from('referral_scans')
        .select('sales_agent, promo_code, referral, session_id, is_first_visit, device_type, country, created_at')
        .gte('created_at', since)
        .limit(20000),
      supabase
        .from('orders')
        // orders has total_usd / total_crc only - there is no `total` column.
        // orderUsd() still falls back to `total` for callers that pass order
        // objects assembled elsewhere, but it must not be selected here.
        .select('sales_agent, promo_code, status, total_usd, total_crc, refunded_amount_usd, refunded_amount_crc, currency, created_at')
        .gte('created_at', since)
        .limit(20000),
      getDatabaseBackedUsdToCrcRate(),
    ]);

    if (scansResult.error) {
      // The table may not exist yet if the migration has not been run.
      const message = scansResult.error.message || '';
      if (/relation .* does not exist/i.test(message)) {
        return NextResponse.json({
          ok: true, days, stats: [],
          migrationRequired: true,
          note: 'Run add-referral-scans.sql to start recording scans.',
        });
      }
      console.error('[admin/referral-stats]', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (ordersResult.error) {
      console.error('[admin/referral-stats]', ordersResult.error.message);
      return NextResponse.json({ error: ordersResult.error.message }, { status: 500 });
    }

    const rate = exchangeRateResult.rate;
    const allStats = buildReferralStats(scansResult.data || [], ordersResult.data || [], rate);

    // This dashboard is for PEOPLE's QR/referral performance - sales reps and
    // named referral partners. Bare promo-code rows (e.g. TESA20, TESA15) are
    // marketing codes, not people, so they are excluded here to keep the view
    // about the team. Promo-code performance lives in the Affiliates section.
    const stats = allStats.filter((row) => row.kind !== 'promo');

    return NextResponse.json({
      ok: true,
      days,
      exchangeRate: rate,
      totals: {
        scans: stats.reduce((sum, row) => sum + row.scans, 0),
        orders: stats.reduce((sum, row) => sum + row.orders, 0),
        revenueUsd: Math.round(stats.reduce((sum, row) => sum + row.revenueUsd, 0) * 100) / 100,
      },
      stats,
    });
  } catch (err) {
    console.error('[admin/referral-stats]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
