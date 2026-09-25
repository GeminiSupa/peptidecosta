import { NextResponse } from 'next/server';
import { requireAffiliateSession } from '@/lib/affiliateSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * My Payouts — what is waiting, what was approved, what it was made of.
 *
 * orders_data on a payout is a snapshot of full order rows taken when the
 * payout was built, so it is trimmed here to the four things an affiliate
 * asked to see: order number, customer name, total, and nothing else. Sending
 * the snapshot untouched would leak exactly the customer details the orders
 * screen is careful to withhold.
 */
export async function GET(request) {
  const session = await requireAffiliateSession(request);
  if (session.error) return session.error;

  const { affiliate, supabaseAdmin } = session;

  const { data, error } = await supabaseAdmin
    .from('affiliate_payouts')
    .select('id, start_date, end_date, usd_sales, crc_sales, commission_rate, usd_commission, crc_commission, status, orders_data, created_at, approved_at')
    .eq('affiliate_id', affiliate.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[affiliate/payouts]', error.message);
    return NextResponse.json({ ok: false, error: 'Could not load your payouts' }, { status: 500 });
  }

  const payouts = (data || []).map((payout) => ({
    id: payout.id,
    startDate: payout.start_date,
    endDate: payout.end_date,
    status: payout.status,
    createdAt: payout.created_at,
    approvedAt: payout.approved_at,
    commissionRate: Number(payout.commission_rate || 0),
    usdCommission: Number(payout.usd_commission || 0),
    crcCommission: Number(payout.crc_commission || 0),
    orders: (Array.isArray(payout.orders_data) ? payout.orders_data : []).map((order) => ({
      orderNumber: order?.order_number ?? null,
      customerName: order?.customer_name ?? null,
      totalUsd: order?.total_usd ?? null,
      totalCrc: order?.total_crc ?? null,
      currency: order?.currency ?? null,
    })),
  }));

  return NextResponse.json({ ok: true, payouts });
}
