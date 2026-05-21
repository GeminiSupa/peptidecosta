import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function POST(req) {
  try {
    const payload = await req.json();

    console.log('[Tilopay webhook] payload:', payload);

    // Typically Tilopay sends an orderNumber or similar identifier.
    // Example: { orderNumber: 'TPCR-XYZ123', status: 'APPROVED', code: 1, ... }
    // Please verify the exact payload structure in your Tilopay dashboard docs or logs.
    
    // Fallbacks based on common Tilopay integrations
    const orderNumber = payload.orderNumber || payload.reference || payload.order_number;
    
    // code: 1 usually means approved, 2 is rejected, 3 is error, etc.
    const statusCode = payload.code || payload.status;
    let statusText = 'Pending';
    
    if (statusCode === 1 || statusCode === 'APPROVED' || statusCode === 'approved') {
      statusText = 'Paid';
    } else if (statusCode === 2 || statusCode === 'REJECTED' || statusCode === 'rejected') {
      statusText = 'Rejected';
    } else if (statusCode === 3 || statusCode === 'ERROR' || statusCode === 'error') {
      statusText = 'Error';
    } else {
      // Just keep whatever status they send if we don't recognize it
      statusText = statusCode ? `Status: ${statusCode}` : 'Pending';
    }

    if (!orderNumber) {
      return NextResponse.json({ error: 'Missing order number' }, { status: 400 });
    }

    if (isSupabaseConfigured && supabase) {
      // Find the order by order_number and update it
      const { error } = await supabase
        .from('orders')
        .update({ status: statusText })
        .eq('order_number', orderNumber);
        
      if (error) {
        console.error('[Tilopay webhook] Error updating Supabase:', error);
        return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[Tilopay webhook] Error processing request:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
