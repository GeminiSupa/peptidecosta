import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cronAuth';
import { expireDueDeals } from '@/lib/dealsEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Restore prices when a Deal of the Week ends.
 *
 * Mandatory, not cosmetic. Past sale_end_time the catalog stops drawing the sale
 * ribbon and stops striking through the old price, but it never puts price_usd
 * back — so without this job the deal price becomes the permanent price, and
 * nothing on the page shows it. Runs hourly so a missed run costs at most an
 * hour of discount rather than a week.
 */
export async function GET(request) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const results = await expireDueDeals();
    const failed = results.filter((result) => !result.ok);

    if (failed.length > 0) {
      // 500 so the platform surfaces it as a failed cron: prices are still
      // discounted and the next run must retry.
      return NextResponse.json(
        { ok: false, expired: results.length, failed, results },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, expired: results.length, results });
  } catch (err) {
    console.error('[cron/expire-deals]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
