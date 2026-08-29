import { NextResponse } from 'next/server';
import { missingColumnFrom } from '@/lib/optionalColumns.mjs';
import { withoutExcludedOrders } from '@/lib/orderRevenue.mjs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import {
  COMMISSION_ELIGIBLE_ORDER_STATUSES,
  getOrderSalesAmounts,
  orderBelongsToAgent,
  isCommissionEligibleOrder,
} from '@/lib/agentOrders';
import {
  commissionRateLabel,
  decorateCommissionOrder,
  summarizeOrderCommissions,
} from '@/lib/orderCommission.mjs';
import { commissionSourceLabel, isAgentReferralSource } from '@/lib/salesAgentAffiliate.mjs';
import { getDatabaseBackedUsdToCrcRate } from '@/lib/exchangeRate';
import { computeOverrideAmounts, overrideRateFor, payableChildrenOf } from '@/lib/subUserCommission.mjs';
import { isSubUser } from '@/lib/subUserTier.mjs';
import { agentAnalyticsRange, orderReportableInRange } from '@/lib/agentDashboard.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ORDER_FIELDS_BASE = 'id, order_number, customer_name, status, sales_agent, total_usd, total_crc, currency, created_at, activity_log, agent_commission_rate_override, agent_commission_source';
// stats_override arrives with add-order-stats-override.sql. Migrations are
// pasted in by hand, so this deploy can land first; naming a column that does
// not exist yet fails the whole query, so it is dropped on the first such
// error and the narrow field list is kept for the paging that follows.
const ORDER_FIELDS = `${ORDER_FIELDS_BASE}, stats_override`;
let orderFieldsInUse = ORDER_FIELDS;
const PAYOUT_FIELDS = 'id, start_date, end_date, usd_sales, crc_sales, usd_commission, crc_commission, weekly_salary_paid, salary_currency, total_payout_usd, total_payout_crc, status';
const PAGE_SIZE = 1000;
const MAX_ORDER_PAGES = 50;

async function fetchAllOrders(supabase, configure) {
  const rows = [];
  for (let page = 0; page < MAX_ORDER_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const run = (fields) => configure(supabase.from('orders').select(fields))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    let { data, error } = await run(orderFieldsInUse);
    if (error && missingColumnFrom(error) === 'stats_override') {
      orderFieldsInUse = ORDER_FIELDS_BASE;
      ({ data, error } = await run(orderFieldsInUse));
    }
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) return rows;
  }
  throw new Error('Agent order history exceeds the supported reporting window');
}

function sumAgentOrders(agentOrders, getAmounts) {
  let usd = 0;
  let crc = 0;
  for (const order of agentOrders) {
    const amounts = getAmounts(order);
    usd += amounts.usd;
    crc += amounts.crc;
  }
  return { usd, crc, count: agentOrders.length };
}

export async function GET(request) {
  // Sub-users need this: it is their earnings screen. Scoped to the caller's own
  // profile throughout, so it shows their orders and nobody else's.
  const auth = await verifyAdminSession(request, { allowSubUser: true });
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const profile = auth.profile;

    const range = agentAnalyticsRange(new Date(), request.nextUrl.searchParams.get('weekOffset'));
    const {
      weekOffset, monthStartUtc, nowUtc, todayStartUtc,
      weekStartUtc, weekEndUtc, weekStartDate, weekEndDate,
    } = range;

    // Completed orders are dated by completion, not creation. Read the complete
    // eligible ledger in pages so long-running orders and Supabase's 1,000-row
    // response cap cannot silently remove earnings. Open orders only need the
    // selected week and current-month pending windows.
    let eligibleRows;
    let weekWindowRows;
    let monthPendingRows;
    try {
      [eligibleRows, weekWindowRows, monthPendingRows] = await Promise.all([
        fetchAllOrders(supabaseAdmin, (query) => query.in('status', COMMISSION_ELIGIBLE_ORDER_STATUSES)),
        fetchAllOrders(supabaseAdmin, (query) => query
          .gte('created_at', weekStartUtc)
          .lt('created_at', weekEndUtc)
          .not('status', 'eq', 'Cancelled')),
        fetchAllOrders(supabaseAdmin, (query) => query
          .gte('created_at', monthStartUtc)
          .lte('created_at', nowUtc)
          .eq('status', 'Pending')),
      ]);
    } catch (ordersError) {
      console.error('Error fetching agent orders:', ordersError);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const { rate: exchangeRate } = await getDatabaseBackedUsdToCrcRate();
    const getAmounts = (order) => getOrderSalesAmounts(order, exchangeRate);
    // A test order held out of the figures must not appear as agent earnings.
    eligibleRows = withoutExcludedOrders(eligibleRows);
    const eligibleAgentOrders = eligibleRows.filter((order) => orderBelongsToAgent(order, profile));
    // Paid/Completed/Order Complete/Partly Refunded orders count toward pay —
    // the exact rule the weekly payout report uses. Pending, processing and
    // blocked orders still show in the lists but do not inflate commission.
    const eligibleOrders = eligibleAgentOrders.filter(isCommissionEligibleOrder);
    // Bucket eligible orders by completion time, so pay
    // periods match the payout report rather than being keyed off created_at.
    const monthOrders = eligibleOrders.filter((order) => orderReportableInRange(order, monthStartUtc, nowUtc));
    const todayOrders = eligibleOrders.filter((order) => orderReportableInRange(order, todayStartUtc, nowUtc));
    const weekOrders = eligibleOrders.filter((order) => orderReportableInRange(order, weekStartUtc, weekEndUtc));
    // Pending orders are inherently recent; keep them keyed off created_at.
    const pendingOrders = monthPendingRows.filter((order) => orderBelongsToAgent(order, profile));
    // Orders in the viewed week that are not yet complete. Surfaced separately
    // so both the agent and the owner can see the pipeline that has not counted
    // toward pay yet. Keyed off created_at because an open order has no
    // completion date.
    const weekPendingOrders = weekWindowRows.filter(
      (order) => orderBelongsToAgent(order, profile) && !isCommissionEligibleOrder(order)
    );

    const monthSales = sumAgentOrders(monthOrders, getAmounts);
    const weekSales = sumAgentOrders(weekOrders, getAmounts);
    const todaySales = sumAgentOrders(todayOrders, getAmounts);
    const weekPendingSales = sumAgentOrders(weekPendingOrders, getAmounts);

    let currentWeekOverrideUSD = 0;
    let currentWeekOverrideCRC = 0;
    let currentWeekOverrideCount = 0;
    const currentWeekOverrideRate = overrideRateFor(profile);
    if (!isSubUser(profile) && currentWeekOverrideRate > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin.from('admin_profiles').select('*');
      if (profilesError) {
        console.error('Error fetching team profiles for agent analytics:', profilesError);
        return NextResponse.json({ error: 'Failed to calculate team earnings' }, { status: 500 });
      }
      const children = payableChildrenOf(profile, profiles || []);
      const childWeekOrders = eligibleRows.filter(
        (order) => orderReportableInRange(order, weekStartUtc, weekEndUtc)
          && children.some((child) => orderBelongsToAgent(order, child))
      );
      const childSales = sumAgentOrders(childWeekOrders, getAmounts);
      const override = computeOverrideAmounts({
        usdSales: childSales.usd,
        crcSales: childSales.crc,
        overrideRate: currentWeekOverrideRate,
      });
      currentWeekOverrideUSD = override.overrideUsd;
      currentWeekOverrideCRC = override.overrideCrc;
      currentWeekOverrideCount = childWeekOrders.length;
    }

    const rate = Number(profile.commission_rate || 0);
    const weekCommissionSummary = summarizeOrderCommissions(
      weekOrders,
      rate,
      getAmounts
    );
    const weekCommissionUsd = weekCommissionSummary.usdCommission;
    const weekCommissionCrc = weekCommissionSummary.crcCommission;
    const reportedWeekOrders = weekOrders.map((order) => decorateCommissionOrder(
      order,
      rate,
      getAmounts,
      commissionSourceLabel
    ));

    const [recentPayoutResult, selectedWeekPayoutResult] = await Promise.all([
      supabaseAdmin
        .from('commission_payouts')
        .select(PAYOUT_FIELDS)
        .eq('agent_email', profile.email)
        .order('created_at', { ascending: false })
        .limit(26),
      // The week picker reaches one year back, while the history list is
      // intentionally shorter. Query the selected period directly so an old
      // frozen payout is never replaced by a live estimate just because it
      // fell outside the 26-row display limit.
      supabaseAdmin
        .from('commission_payouts')
        .select(PAYOUT_FIELDS)
        .eq('agent_email', profile.email)
        .eq('start_date', weekStartUtc)
        .order('created_at', { ascending: false }),
    ]);
    const { data: recentPayouts, error: payoutsError } = recentPayoutResult;
    const { data: selectedWeekPayouts, error: selectedWeekPayoutsError } = selectedWeekPayoutResult;

    if (payoutsError) {
      console.warn('Error fetching payouts:', payoutsError.message);
    }
    if (selectedWeekPayoutsError) {
      console.warn('Error fetching selected week payout:', selectedWeekPayoutsError.message);
    }

    // If the owner has already scanned a payout for the viewed week, show that
    // record's stored figures verbatim so the agent sees exactly what the payout
    // report shows (same USD/CRC, frozen at scan-time FX) instead of a live
    // re-computation that can drift by a few cents on currency conversion.
    // A week can have several rows (re-scans leave Rejected duplicates). Ignore
    // Rejected and prefer the finalized Approved payout, else the Pending one.
    const weekPayoutCandidates = selectedWeekPayoutsError ? recentPayouts : selectedWeekPayouts;
    const weekPayoutMatches = (weekPayoutCandidates || []).filter(
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
        weekEndDate,
        weekPayout,
        weekOrders: reportedWeekOrders.map(({ activity_log, ...rest }) => rest),
        weekPendingOrders: weekPendingOrders.map(({ activity_log, ...rest }) => rest),
        weekPendingCount: weekPendingSales.count,
        weekPendingSalesUSD: weekPendingSales.usd,
        weekPendingSalesCRC: weekPendingSales.crc,
        weeklySalary: profile.weekly_salary || 0,
        salaryCurrency: profile.salary_currency || 'USD',
        commissionRate: rate,
        currentWeekCommissionRateLabel: commissionRateLabel(weekCommissionSummary.rates, rate),
        currentWeekAgentReferralCount: reportedWeekOrders.filter(
          (order) => isAgentReferralSource(order.agent_commission_source)
        ).length,
        commissionStructure: profile.commission_structure || '',
        currentMonthOrdersCount: monthSales.count,
        currentMonthSalesUSD: monthSales.usd,
        currentMonthSalesCRC: monthSales.crc,
        currentWeekOrdersCount: weekSales.count,
        currentWeekSalesUSD: weekSales.usd,
        currentWeekSalesCRC: weekSales.crc,
        currentWeekCommissionUSD: weekCommissionUsd,
        currentWeekCommissionCRC: weekCommissionCrc,
        currentWeekOverrideUSD,
        currentWeekOverrideCRC,
        currentWeekOverrideCount,
        currentWeekOverrideRate,
        todayOrdersCount: todaySales.count,
        todaySalesUSD: todaySales.usd,
        todaySalesCRC: todaySales.crc,
        pendingOrdersCount: pendingOrders.length,
        recentPayouts: recentPayouts || [],
        payoutHistoryError: payoutsError ? 'Payout history is temporarily unavailable.' : null,
        weekPayoutError: selectedWeekPayoutsError ? 'The stored payout for this week could not be checked.' : null,
        generatedAt: nowUtc,
      },
    });
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json({ error: 'Unable to load your dashboard right now.' }, { status: 500 });
  }
}
