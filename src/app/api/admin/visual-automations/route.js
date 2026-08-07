import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    // For now, we'll just fetch the first active workflow or a default one
    const { data, error } = await supabaseAdmin
      .from('automations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json({ workflow: data || null });
  } catch (err) {
    console.error('[Visual Automations] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const { workflowData, id, name } = await request.json();
    const supabaseAdmin = getSupabaseAdmin();

    let result;
    if (id) {
      // Update existing
      result = await supabaseAdmin
        .from('automations')
        .update({
          workflow_data: workflowData,
          name: name || 'Updated Automation',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
    } else {
      // Insert new
      result = await supabaseAdmin
        .from('automations')
        .insert({
          name: name || 'New Automation',
          workflow_data: workflowData,
          is_active: true
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    return NextResponse.json({ success: true, workflow: result.data });
  } catch (err) {
    console.error('[Visual Automations] POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
