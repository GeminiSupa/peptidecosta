import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const userEmail = auth.user.email;

    // Fetch the agent's profile to get salary and commission rate
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('admin_profiles')
      .select('*')
      .eq('email', userEmail)
      .single();

    if (profileError) {
      console.error('Error fetching agent profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch agent profile' }, { status: 500 });
    }

    // Calculate current week boundaries
    const CR_OFFSET = -6; // Costa Rica is UTC-6 all year
    const nowUTC = new Date();
    const nowCR = new Date(nowUTC.getTime() + (CR_OFFSET * 60 * 60 * 1000));
    const day = nowCR.getUTCDay();
    const dayOffset = day === 0 ? 7 : day; 

    const currentMondayCR = new Date(nowCR);
    currentMondayCR.setUTCDate(nowCR.getUTCDate() - dayOffset + 1);
    currentMondayCR.setUTCHours(0, 0, 0, 0);

    const startDate = new Date(currentMondayCR.getTime() - (CR_OFFSET * 60 * 60 * 1000));
    const endDate = new Date(nowCR.getTime() - (CR_OFFSET * 60 * 60 * 1000));

    // Fetch orders for this week
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('total, currency, sales_agent, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .not('status', 'eq', 'Cancelled');

    let currentWeekSalesUSD = 0;
    let currentWeekSalesCRC = 0;
    let currentWeekOrdersCount = 0;

    if (!ordersError && orders) {
      const agentName = String(profile.name || '').trim().toLowerCase();
      const agentEmailStr = String(profile.email || '').trim().toLowerCase();

      for (const order of orders) {
        const orderAgent = String(order.sales_agent || '').trim().toLowerCase();
        if (orderAgent && (orderAgent === agentName || orderAgent === agentEmailStr)) {
          currentWeekOrdersCount++;
          const totalAmount = Number(order.total || 0);
          if (order.currency === 'USD') {
            currentWeekSalesUSD += totalAmount;
          } else {
            currentWeekSalesCRC += totalAmount;
          }
        }
      }
    }

    // Fetch recent payouts
    const { data: recentPayouts, error: payoutsError } = await supabaseAdmin
      .from('commission_payouts')
      .select('id, start_date, end_date, usd_sales, crc_sales, usd_commission, crc_commission, weekly_salary_paid, salary_currency, total_payout_usd, total_payout_crc, status')
      .eq('agent_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      stats: {
        weeklySalary: profile.weekly_salary || 0,
        salaryCurrency: profile.salary_currency || 'USD',
        commissionRate: profile.commission_rate || 0,
        commissionStructure: profile.commission_structure || '',
        currentWeekSalesUSD,
        currentWeekSalesCRC,
        currentWeekOrdersCount,
        recentPayouts: recentPayouts || []
      }
    });

  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
