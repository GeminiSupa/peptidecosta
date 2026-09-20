import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';

export async function GET(request) {
  const auth = await verifyAdminSession(request, { requirePermission: 'spreadsheet' });
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin.from('product_batches').select('*').order('created_at', { ascending: false });

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data: batches, error } = await query;
    if (error) {
      // If table doesn't exist yet, return empty list gracefully
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json({ success: true, batches: [] });
      }
      throw error;
    }

    return NextResponse.json({ success: true, batches: batches || [] });
  } catch (error) {
    console.error('[API Product Batches GET Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch batches' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request, { requirePermission: 'spreadsheet' });
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { productId, batchNumber, supplierName, vialCount, unitCostUsd, manufacturedDate, expiryDate, notes } = body;

    if (!productId || !batchNumber) {
      return NextResponse.json({ error: 'productId and batchNumber are required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: newBatch, error } = await supabaseAdmin
      .from('product_batches')
      .insert({
        product_id: productId,
        batch_number: String(batchNumber).trim(),
        supplier_name: supplierName ? String(supplierName).trim() : null,
        vial_count: Number(vialCount) || 0,
        unit_cost_usd: Number(unitCostUsd) || 0,
        manufactured_date: manufacturedDate || null,
        expiry_date: expiryDate || null,
        notes: notes ? String(notes).trim() : null,
      })
      .select('*')
      .single();

    if (error) throw error;

    // Also update current active batch_number and supplier_name on products table
    await supabaseAdmin
      .from('products')
      .update({
        batch_number: String(batchNumber).trim(),
        supplier_name: supplierName ? String(supplierName).trim() : null,
        batch_expiry_date: expiryDate || null,
        cost_usd: Number(unitCostUsd) || 0,
      })
      .eq('id', productId);

    return NextResponse.json({ success: true, batch: newBatch });
  } catch (error) {
    console.error('[API Product Batches POST Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to create product batch' }, { status: 500 });
  }
}
