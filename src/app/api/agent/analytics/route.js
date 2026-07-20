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

const MAX_WEEK_OFFSET = 52;

export async function GET(request) {
  const auth = await verifyAdminSession(request);
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

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, customer_name, status, sales_agent, total_usd, total_crc, currency, created_at')
      .gte('created_at', rangeStartUtc)
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
    const monthOrders = eligibleOrders.filter((o) => o.created_at >= monthStartUtc);
    const todayOrders = eligibleOrders.filter((o) => o.created_at >= todayStartUtc);
    const weekOrders = eligibleOrders.filter(
      (o) => o.created_at >= weekStartUtc && o.created_at < weekEndUtc
    );
    const pendingOrders = agentOrders.filter(
      (o) => o.created_at >= monthStartUtc && (o.status || 'Pending') === 'Pending'
    );

    const monthSales = sumAgentOrders(monthOrders);
    const weekSales = sumAgentOrders(weekOrders);
    const todaySales = sumAgentOrders(todayOrders);

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

    const { data: recentAll } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, customer_name, status, sales_agent, total_usd, total_crc, currency, created_at')
      .not('status', 'eq', 'Cancelled')
      .order('created_at', { ascending: false })
      .limit(500);

    const recentOrders = (recentAll || [])
      .filter((o) => orderBelongsToAgent(o, profile))
      .slice(0, 50);

    const displayEndCR = new Date(selectedWeekEndCR);
    displayEndCR.setUTCDate(displayEndCR.getUTCDate() - 1);

    return NextResponse.json({
      success: true,
      stats: {
        weekOffset,
        weekStartDate: selectedWeekStartCR.toISOString().slice(0, 10),
        weekEndDate: displayEndCR.toISOString().slice(0, 10),
        weekOrders,
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
        recentOrders,
        recentPayouts: recentPayouts || [],
      },
    });
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
