import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  // We restrict hard deletion to superadmins to prevent accidental data loss
  if (!auth.profile.is_superadmin) {
    return NextResponse.json({ error: 'Only superadmins can permanently delete customer data.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, phone, name } = body;
    
    // We need at least one identifier to delete by
    if (!email && !phone && !name) {
      return NextResponse.json({ error: 'At least one identifier (email, phone, or name) is required to delete a customer.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    
    // Delete from catalog_leads
    let leadsQuery = supabase.from('catalog_leads').delete();
    if (email) leadsQuery = leadsQuery.eq('email', email);
    else if (phone) leadsQuery = leadsQuery.eq('phone', phone);
    else leadsQuery = leadsQuery.eq('name', name);
    await leadsQuery;

    // Delete from abandoned_carts
    let cartsQuery = supabase.from('abandoned_carts').delete();
    if (email) cartsQuery = cartsQuery.eq('customer_email', email);
    else if (phone) cartsQuery = cartsQuery.eq('customer_phone', phone);
    else cartsQuery = cartsQuery.eq('customer_name', name);
    await cartsQuery;

    // Delete from orders
    let ordersQuery = supabase.from('orders').delete();
    if (email) ordersQuery = ordersQuery.eq('customer_email', email);
    else if (phone) ordersQuery = ordersQuery.eq('customer_phone', phone);
    else ordersQuery = ordersQuery.eq('customer_name', name);
    await ordersQuery;

    return NextResponse.json({ ok: true, message: 'Customer data deleted successfully.' });
  } catch (error) {
    console.error('[admin/crm/customer/delete]', error);
    return NextResponse.json({ error: error.message || 'Could not delete customer' }, { status: 500 });
  }
}
