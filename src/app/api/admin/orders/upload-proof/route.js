import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { orderVisibleToAgent } from '@/lib/agentOrders';

export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const form = await request.formData();
    const file = form.get('file');
    const orderId = form.get('orderId');

    if (!file || typeof file === 'string' || !orderId) {
      return NextResponse.json({ error: 'file and orderId required' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `payment-proofs/${orderId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = getSupabaseAdmin();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, sales_agent')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || 'Order not found' }, { status: 404 });
    }

    if (!orderVisibleToAgent(order, auth.profile)) {
      return NextResponse.json({ error: 'Forbidden: order is not visible to this staff member' }, { status: 403 });
    }

    const { error: uploadErr } = await supabase.storage
      .from('product-pics')
      .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: true });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('product-pics').getPublicUrl(path);

    return NextResponse.json({ ok: true, url: urlData.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
