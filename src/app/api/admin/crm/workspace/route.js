import { NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/adminAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const clean = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);

const reminderForClient = (row) => ({
  id: row.id,
  customerId: row.customer_key,
  customerName: row.customer_name,
  dueAt: row.due_at,
  note: row.note,
  status: row.status,
  createdBy: row.created_by,
  createdAt: row.created_at,
  completedBy: row.completed_by,
  completedAt: row.completed_at,
});

const activityForClient = (row) => ({
  id: row.id,
  customerId: row.customer_key,
  customerName: row.customer_name,
  action: row.action,
  detail: row.detail,
  actor: row.actor,
  createdAt: row.created_at,
});

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  const supabase = getSupabaseAdmin();
  const [{ data: reminders, error: reminderError }, { data: activity, error: activityError }] = await Promise.all([
    supabase.from('crm_reminders').select('*').order('due_at', { ascending: true }).limit(1000),
    supabase.from('crm_activity').select('*').order('created_at', { ascending: false }).limit(250),
  ]);
  const error = reminderError || activityError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    reminders: (reminders || []).map(reminderForClient),
    activity: (activity || []).map(activityForClient),
  });
}

export async function POST(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const type = clean(body.type, 30);
    const customerKey = clean(body.customerId, 300);
    const customerName = clean(body.customerName, 160) || null;
    const actor = auth.user.email || auth.profile.name || 'Staff';
    if (!customerKey) return NextResponse.json({ error: 'customerId is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    if (type === 'reminder') {
      const note = clean(body.note, 2000);
      const dueAt = new Date(body.dueAt);
      if (!note || Number.isNaN(dueAt.getTime())) {
        return NextResponse.json({ error: 'A valid due date and note are required' }, { status: 400 });
      }
      const { data, error } = await supabase.from('crm_reminders').insert({
        customer_key: customerKey,
        customer_name: customerName,
        due_at: dueAt.toISOString(),
        note,
        created_by: actor,
      }).select('*').single();
      if (error) throw error;
      return NextResponse.json({ reminder: reminderForClient(data) }, { status: 201 });
    }

    if (type === 'activity') {
      const action = clean(body.action, 160);
      if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 });
      const { data, error } = await supabase.from('crm_activity').insert({
        customer_key: customerKey,
        customer_name: customerName,
        action,
        detail: clean(body.detail, 2000) || null,
        actor,
      }).select('*').single();
      if (error) throw error;
      return NextResponse.json({ activity: activityForClient(data) }, { status: 201 });
    }

    return NextResponse.json({ error: 'type must be reminder or activity' }, { status: 400 });
  } catch (error) {
    console.error('[admin/crm/workspace POST]', error);
    return NextResponse.json({ error: error.message || 'Could not save CRM workspace entry' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const reminderId = clean(body.reminderId, 100);
    if (!reminderId) return NextResponse.json({ error: 'reminderId is required' }, { status: 400 });
    if (!['done', 'cancelled', 'open'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid reminder status' }, { status: 400 });
    }
    const actor = auth.user.email || auth.profile.name || 'Staff';
    const completed = body.status === 'done';
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('crm_reminders').update({
      status: body.status,
      completed_by: completed ? actor : null,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq('id', reminderId).select('*').single();
    if (error) throw error;
    return NextResponse.json({ reminder: reminderForClient(data) });
  } catch (error) {
    console.error('[admin/crm/workspace PATCH]', error);
    return NextResponse.json({ error: error.message || 'Could not update reminder' }, { status: 500 });
  }
}
