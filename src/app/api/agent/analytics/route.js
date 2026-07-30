import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getOrderSalesAmounts, orderBelongsToAgent, isCommissionEligibleOrder } from '@/lib/agentOrders';

const CR_OFFSET = -6;

function nowCR() {
  const nowUTC = new Date();
  return new Date(nowUTC.getTime() + CR_OFFSET * 60 * 60 * 1000);
}

function startOfMonthCR(date = nowCR()) {
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfWeekCR(date = nowCR()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const dayOffset = day === 0 ? 7 : day;
  d.setUTCDate(d.getUTCDate() - dayOffset + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfDayCR(date = nowCR()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function crToUtc(crDate) {
  return new Date(crDate.getTime() - CR_OFFSET * 60 * 60 * 1000);
}

function sumAgentOrders(agentOrders) {
  let usd = 0;
  let crc = 0;
  for (const order of agentOrders) {
    const amounts = getOrderSalesAmounts(order);
    usd += amounts.usd;
    crc += amounts.crc;
  }
  return { usd, crc, count: agentOrders.length };
}

// When an order counts toward pay = when it was marked Paid/Complete, not when
// it was created. Mirrors the weekly payout report exactly so an order created
// in one week but paid the next lands in the same week on both screens. Falls
// back to created_at when there is no completion entry in the activity log.
function orderCompletedAtMs(order) {
  let ts = order.created_at;
  const log = Array.isArray(order.activity_log) ? order.activity_log : null;
  if (log) {
    const completions = log.filter(
      (l) => l && l.type === 'status_change' && typeof l.message === 'string'
        && (l.message.includes('Paid') || l.message.includes('Complet'))
    );
    if (completions.length) ts = completions[completions.length - 1].at;
  }
  return new Date(ts).getTime();
}

const MAX_WEEK_OFFSET = 52;

export async function GET(request) {
  // Sub-users need this: it is their earnings screen. Scoped to the caller's own
  // profile throughout, so it shows their orders and nobody else's.
  const auth = await verifyAdminSession(request, { allowSubUser: true });
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const profile = auth.profile;

    const rawOffset = parseInt(request.nextUrl.searchParams.get('weekOffset') || '0', 10);
    const weekOffset = Math.min(Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0), MAX_WEEK_OFFSET);

    const monthStartUtc = crToUtc(startOfMonthCR()).toISOString();
    const nowUtc = crToUtc(nowCR()).toISOString();
    const todayStartUtc = crToUtc(startOfDayCR()).toISOString();

    const selectedWeekStartCR = startOfWeekCR();
    selectedWeekStartCR.setUTCDate(selectedWeekStartCR.getUTCDate() - weekOffset * 7);
    const selectedWeekEndCR = new Date(selectedWeekStartCR);
    selectedWeekEndCR.setUTCDate(selectedWeekEndCR.getUTCDate() + 7);
    const weekStartUtc = crToUtc(selectedWeekStartCR).toISOString();
    const weekEndUtc = weekOffset === 0 ? nowUtc : crToUtc(selectedWeekEndCR).toISOString();

    const rangeStartUtc = weekStartUtc < monthStartUtc ? weekStartUtc : monthStartUtc;
    // Orders are dated by completion, so an order created before the window can
    // still be paid inside it. Fetch a buffer earlier so those are not missed.
    const COMPLETION_LAG_BUFFER_MS = 31 * 24 * 60 * 60 * 1000;
    const fetchStartUtc = new Date(new Date(rangeStartUtc).getTime() - COMPLETION_LAG_BUFFER_MS).toISOString();

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, customer_name, status, sales_agent, total_usd, total_crc, currency, created_at, activity_log')
      .gte('created_at', fetchStartUtc)
      .lte('created_at', nowUtc)
      .not('status', 'eq', 'Cancelled')
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching agent orders:', ordersError);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const agentOrders = (orders || []).filter((o) => orderBelongsToAgent(o, profile));
    // Only Paid/Completed/Order Complete orders count toward pay — this is the
    // exact rule the weekly payout report uses. Pending/processing/blocked orders
    // still show in the lists, but must never inflate sales or commission (they
    // are not paid yet), otherwise the agent's screen disagrees with the payout.
    const eligibleOrders = agentOrders.filter(isCommissionEligibleOrder);
    // Bucket eligible orders by completion time (see orderCompletedAtMs), so pay
    // periods match the payout report rather than being keyed off created_at.
    const monthStartMs = new Date(monthStartUtc).getTime();
    const todayStartMs = new Date(todayStartUtc).getTime();
    const weekStartMs = new Date(weekStartUtc).getTime();
    const weekEndMs = new Date(weekEndUtc).getTime();
    const monthOrders = eligibleOrders.filter((o) => orderCompletedAtMs(o) >= monthStartMs);
    const todayOrders = eligibleOrders.filter((o) => orderCompletedAtMs(o) >= todayStartMs);
    const weekOrders = eligibleOrders.filter((o) => {
      const t = orderCompletedAtMs(o);
      return t >= weekStartMs && t < weekEndMs;
    });
    // Pending orders are inherently recent; keep them keyed off created_at.
    const pendingOrders = agentOrders.filter(
      (o) => o.created_at >= monthStartUtc && (o.status || 'Pending') === 'Pending'
    );
    // Orders in the viewed week that are NOT yet paid (any non-cancelled status
    // that isn't Paid/Completed). Surfaced separately so both the agent and the
    // owner can see the pipeline that hasn't counted toward pay yet. Keyed off
    // created_at since a not-yet-paid order has no completion date.
    const weekPendingOrders = agentOrders.filter(
      (o) => !isCommissionEligibleOrder(o)
        && o.created_at >= weekStartUtc && o.created_at < weekEndUtc
    );

    const monthSales = sumAgentOrders(monthOrders);
    const weekSales = sumAgentOrders(weekOrders);
    const todaySales = sumAgentOrders(todayOrders);
    const weekPendingSales = sumAgentOrders(weekPendingOrders);

    const rate = Number(profile.commission_rate || 0);
    const weekCommissionUsd = weekSales.usd * (rate / 100);
    const weekCommissionCrc = weekSales.crc * (rate / 100);

    const { data: recentPayouts, error: payoutsError } = await supabaseAdmin
      .from('commission_payouts')
      .select('id, start_date, end_date, usd_sales, crc_sales, usd_commission, crc_commission, weekly_salary_paid, salary_currency, total_payout_usd, total_payout_crc, status')
      .eq('agent_email', profile.email)
      .order('created_at', { ascending: false })
      .limit(26);

    if (payoutsError) {
      console.warn('Error fetching payouts:', payoutsError.message);
    }

    const displayEndCR = new Date(selectedWeekEndCR);
    displayEndCR.setUTCDate(displayEndCR.getUTCDate() - 1);

    const weekStartDate = selectedWeekStartCR.toISOString().slice(0, 10);

    // If the owner has already scanned a payout for the viewed week, show that
    // record's stored figures verbatim so the agent sees exactly what the payout
    // report shows (same USD/CRC, frozen at scan-time FX) instead of a live
    // re-computation that can drift by a few cents on currency conversion.
    // A week can have several rows (re-scans leave Rejected duplicates). Ignore
    // Rejected and prefer the finalized Approved payout, else the Pending one.
    const weekPayoutMatches = (recentPayouts || []).filter(
      (p) => typeof p.start_date === 'string'
        && p.start_date.slice(0, 10) === weekStartDate
        && p.status !== 'Rejected'
    );
    const weekPayoutRecord = weekPayoutMatches.find((p) => p.status === 'Approved')
      || weekPayoutMatches[0]
      || null;
    const weekPayout = weekPayoutRecord
      ? {
          usdSales: Number(weekPayoutRecord.usd_sales || 0),
          crcSales: Number(weekPayoutRecord.crc_sales || 0),
          usdCommission: Number(weekPayoutRecord.usd_commission || 0),
          crcCommission: Number(weekPayoutRecord.crc_commission || 0),
          totalPayoutUsd: Number(weekPayoutRecord.total_payout_usd || 0),
          totalPayoutCrc: Number(weekPayoutRecord.total_payout_crc || 0),
          status: weekPayoutRecord.status || 'Pending',
        }
      : null;

    return NextResponse.json({
      success: true,
      stats: {
        weekOffset,
        weekStartDate,
        weekEndDate: displayEndCR.toISOString().slice(0, 10),
        weekPayout,
        weekOrders: weekOrders.map(({ activity_log, ...rest }) => rest),
        weekPendingOrders: weekPendingOrders.map(({ activity_log, ...rest }) => rest),
        weekPendingCount: weekPendingSales.count,
        weekPendingSalesUSD: weekPendingSales.usd,
        weekPendingSalesCRC: weekPendingSales.crc,
        weeklySalary: profile.weekly_salary || 0,
        salaryCurrency: profile.salary_currency || 'USD',
        commissionRate: rate,
        commissionStructure: profile.commission_structure || '',
        currentMonthOrdersCount: monthSales.count,
        currentMonthSalesUSD: monthSales.usd,
        currentMonthSalesCRC: monthSales.crc,
        currentWeekOrdersCount: weekSales.count,
        currentWeekSalesUSD: weekSales.usd,
        currentWeekSalesCRC: weekSales.crc,
        currentWeekCommissionUSD: weekCommissionUsd,
        currentWeekCommissionCRC: weekCommissionCrc,
        todayOrdersCount: todaySales.count,
        todaySalesUSD: todaySales.usd,
        todaySalesCRC: todaySales.crc,
        pendingOrdersCount: pendingOrders.length,
        recentPayouts: recentPayouts || [],
      },
    });
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
