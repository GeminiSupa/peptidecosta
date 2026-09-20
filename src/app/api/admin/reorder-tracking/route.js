import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { calculateCustomerReorderStats } from '@/lib/reorderTracking.mjs';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Fetch all non-cancelled orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, customer_name, customer_email, customer_phone, whatsapp_wa_id, items, status, created_at')
      .neq('status', 'Cancelled')
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    // Fetch site_settings for custom supply duration overrides
    const { data: settings } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('id', 'reorder_supply_overrides')
      .single();

    const customSupplyOverrides = settings?.value || {};

    // Calculate customer reorder stats
    const stats = calculateCustomerReorderStats(orders || [], customSupplyOverrides);

    // Calculate overall dashboard KPIs
    const overdueCount = stats.filter((s) => s.alertStatus === 'overdue').length;
    const dueSoonCount = stats.filter((s) => s.alertStatus === 'due_soon').length;
    const onTrackCount = stats.filter((s) => s.alertStatus === 'on_track').length;

    const repeatCustomers = stats.filter((s) => s.orderCount >= 2);
    const avgInterval = repeatCustomers.length
      ? Math.round(repeatCustomers.reduce((acc, curr) => acc + (curr.avgIntervalDays || 0), 0) / repeatCustomers.length)
      : 0;

    return NextResponse.json({
      success: true,
      summary: {
        totalTracked: stats.length,
        overdueCount,
        dueSoonCount,
        onTrackCount,
        avgIntervalDays: avgInterval,
      },
      customers: stats,
    });
  } catch (error) {
    console.error('[API Reorder Tracking GET Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch reorder tracking stats' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { customerKey, supplyDays } = body;

    if (!customerKey) {
      return NextResponse.json({ error: 'customerKey is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Get current overrides
    const { data: settings } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('id', 'reorder_supply_overrides')
      .single();

    const currentOverrides = settings?.value || {};

    if (supplyDays && Number(supplyDays) > 0) {
      currentOverrides[customerKey] = Number(supplyDays);
    } else {
      delete currentOverrides[customerKey];
    }

    // Save updated overrides to site_settings
    const { error: saveError } = await supabaseAdmin
      .from('site_settings')
      .upsert({
        id: 'reorder_supply_overrides',
        value: currentOverrides,
        updated_at: new Date().toISOString(),
      });

    if (saveError) throw saveError;

    return NextResponse.json({
      success: true,
      message: 'Reorder supply duration override updated',
      customerKey,
      supplyDays: currentOverrides[customerKey] || null,
    });
  } catch (error) {
    console.error('[API Reorder Tracking POST Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to update supply duration' }, { status: 500 });
  }
}
