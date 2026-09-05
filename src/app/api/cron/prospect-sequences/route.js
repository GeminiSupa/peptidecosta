import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeOutreachChannel } from '@/lib/prospectOutreach.mjs';

// Vercel cron handler
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  
  // Find enrollments that are active and due
  const { data: enrollments, error } = await supabase
    .from('prospect_sequence_enrollments')
    .select(`
      id, prospect_id, current_step_index,
      prospects ( id, email, phone, organization_name, status, email_permission_status, whatsapp_permission_status ),
      prospect_sequences ( id, steps )
    `)
    .eq('status', 'active')
    .lte('next_execution_at', new Date().toISOString())
    .limit(20);

  if (error) {
    console.error('[Prospect Sequences] Error fetching enrollments:', error.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!enrollments?.length) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  let processed = 0;

  // Ideally, this calls the same send logic as /api/admin/prospects/outreach/send
  // Here we map the basic logic to advance the steps.
  for (const enrollment of enrollments) {
    const sequence = enrollment.prospect_sequences;
    const steps = sequence.steps || [];
    const stepIndex = enrollment.current_step_index;

    if (stepIndex >= steps.length) {
      await supabase.from('prospect_sequence_enrollments').update({ status: 'completed' }).eq('id', enrollment.id);
      continue;
    }

    const step = steps[stepIndex];
    // In a full implementation, we'd draft the template, check suppressions, and dispatch via nodemailer/whatsapp
    // For now, we simulate processing and schedule the next step
    console.log(`[Prospect Sequences] Processing step ${stepIndex} for prospect ${enrollment.prospect_id}`);
    
    const isLastStep = stepIndex === steps.length - 1;
    const nextExecutionAt = new Date();
    // Default to +2 days if waitDays is missing
    nextExecutionAt.setDate(nextExecutionAt.getDate() + (step.waitDays || 2));

    await supabase.from('prospect_sequence_enrollments')
      .update({
        current_step_index: stepIndex + 1,
        status: isLastStep ? 'completed' : 'active',
        next_execution_at: nextExecutionAt.toISOString(),
      })
      .eq('id', enrollment.id);
      
    processed++;
  }

  return NextResponse.json({ success: true, processed });
}
