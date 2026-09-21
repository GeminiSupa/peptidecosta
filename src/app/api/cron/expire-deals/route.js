import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cronAuth';
import { expireDueDeals, startDueScheduledDeals } from '@/lib/dealsEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Restore prices when a Deal of the Week ends.
 *
 * Mandatory, not cosmetic. Past sale_end_time the catalog stops drawing the sale
 * ribbon and stops striking through the old price, but it never puts price_usd
 * back — so without this job the deal price becomes the permanent price, and
 * nothing on the page shows it. Runs every 5 minutes, so a missed run costs
 * minutes of discount rather than a week.
 *
 * Also starts scheduled deals, so a deal set to begin when the last one ends
 * goes live within 5 minutes of that time.
 */
export async function GET(request) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const results = await expireDueDeals();
    // Expiry first, so a deal scheduled for the moment the old one ends starts
    // in this same run instead of waiting behind it.
    const started = await startDueScheduledDeals();
    const failed = [...results, ...started].filter((result) => !result.ok);

    if (failed.length > 0) {
      // 500 so the platform surfaces it as a failed cron: prices are still
      // discounted, or a scheduled deal did not start, and the next run retries.
      return NextResponse.json(
        { ok: false, expired: results.length, failed, results, started },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, expired: results.length, results, started });
  } catch (err) {
    console.error('[cron/expire-deals]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
