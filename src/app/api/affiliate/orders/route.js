import { NextResponse } from 'next/server';
import { requireAffiliateSession } from '@/lib/affiliateSession';
import { affiliateSafeOrder } from '@/lib/affiliateAccess.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

/**
 * My Orders — orders placed with this affiliate's code, and no others.
 *
 * The filter is on affiliate_id, taken from the session. There is no parameter
 * anywhere on this route that names an affiliate, so there is nothing for a
 * hand-written request to change.
 *
 * Every row goes through affiliateSafeOrder, which keeps the order number, the
 * customer's name, what they bought and the total, and drops the phone, email
 * and address. The whole row is never sent and then hidden in the browser.
 */
export async function GET(request) {
  const session = await requireAffiliateSession(request);
  if (session.error) return session.error;

  const { affiliate, supabaseAdmin } = session;

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, created_at, status, customer_name, items, total_usd, total_crc, currency, affiliate_commission_usd, affiliate_commission_crc')
    .eq('affiliate_id', affiliate.id)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error('[affiliate/orders]', error.message);
    return NextResponse.json({ ok: false, error: 'Could not load your orders' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    orders: (data || []).map(affiliateSafeOrder),
  });
}
