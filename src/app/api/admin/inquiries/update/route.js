import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { inquiryId, status, assignedTo } = await request.json();

    if (!inquiryId) {
      return NextResponse.json({ error: 'Missing inquiryId' }, { status: 400 });
    }

    const validStatuses = ['New', 'Read', 'Replied', 'Closed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    if (assignedTo !== undefined && assignedTo !== null && typeof assignedTo !== 'string') {
      return NextResponse.json({ error: 'assignedTo must be a string or null' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const updateData = {};
    if (status) updateData.status = status;
    if (assignedTo !== undefined) {
      const normalized = String(assignedTo || '').trim();
      updateData.assigned_to = normalized && normalized !== 'Unassigned' ? normalized : null;
      updateData.assigned_by = auth.user.email || null;
      updateData.assigned_at = new Date().toISOString();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No changes supplied' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('customer_inquiries')
      .update(updateData)
      .eq('id', inquiryId)
      .select('*')
      .single();

    if (error) {
      console.error('[Inquiry Update] Error:', error);
      return NextResponse.json({ error: 'Failed to update inquiry' }, { status: 500 });
    }

    return NextResponse.json({ success: true, inquiry: data });
  } catch (err) {
    console.error('[Inquiry Update] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const inquiryId = searchParams.get('id');

    if (!inquiryId) {
      return NextResponse.json({ error: 'Missing inquiry id' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

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
