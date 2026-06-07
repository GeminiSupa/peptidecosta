import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function PATCH(request) {
  try {
    const { inquiryId, status } = await request.json();

    if (!inquiryId) {
      return NextResponse.json({ error: 'Missing inquiryId' }, { status: 400 });
    }

    const validStatuses = ['New', 'Read', 'Replied', 'Closed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updateData = {};
    if (status) updateData.status = status;

    const { error } = await supabase
      .from('customer_inquiries')
      .update(updateData)
      .eq('id', inquiryId);

    if (error) {
      console.error('[Inquiry Update] Error:', error);
      return NextResponse.json({ error: 'Failed to update inquiry' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Inquiry Update] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const inquiryId = searchParams.get('id');

    if (!inquiryId) {
      return NextResponse.json({ error: 'Missing inquiry id' }, { status: 400 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from('customer_inquiries')
      .delete()
      .eq('id', inquiryId);

    if (error) {
      console.error('[Inquiry Delete] Error:', error);
      return NextResponse.json({ error: 'Failed to delete inquiry' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Inquiry Delete] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
