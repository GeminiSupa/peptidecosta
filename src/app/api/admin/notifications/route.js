import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { isDynamicNotificationId } from '@/lib/adminNotifications';

export const runtime = 'nodejs';

async function getDismissedKeys(supabase, adminUserId) {
  const { data, error } = await supabase
    .from('admin_notification_dismissals')
    .select('notification_key')
    .eq('admin_user_id', adminUserId);

  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return new Set();
    }
    console.warn('[admin/notifications] dismissals read:', error.message);
    return new Set();
  }

  return new Set((data || []).map((row) => row.notification_key));
}

async function dismissKeys(supabase, adminUserId, keys) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;

  const rows = unique.map((notification_key) => ({
    admin_user_id: adminUserId,
    notification_key,
    dismissed_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('admin_notification_dismissals')
    .upsert(rows, { onConflict: 'admin_user_id,notification_key' });

  if (error && error.code !== '42P01' && !error.message?.includes('does not exist')) {
    console.warn('[admin/notifications] dismissals write:', error.message);
  }
}

async function buildNotifications(supabase) {
  const since = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

  const [notifRes, ordersRes, inquiriesRes, waRes] = await Promise.all([
    supabase
      .from('admin_notifications')
      .select('*')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('orders')
      .select('id, order_number, customer_name, status, created_at')
      .eq('status', 'Pending')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('customer_inquiries')
      .select('id, name, status, created_at')
      .in('status', ['new', 'New'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('whatsapp_messages')
      .select('id, display_name, message_text, created_at, direction')
      .eq('direction', 'inbound')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const persisted = notifRes.data || [];
  const dynamic = [];

  for (const o of ordersRes.data || []) {
    dynamic.push({
      id: `order-pending-${o.id}`,
      type: 'pending_order',
      title: `Pending order #${o.order_number || o.id.slice(0, 8)}`,
      body: o.customer_name || 'Customer',
      link_tab: 'orders',
      link_ref: o.id,
      created_at: o.created_at,
      dynamic: true,
    });
  }

  for (const q of inquiriesRes.data || []) {
    dynamic.push({
      id: `inquiry-${q.id}`,
      type: 'inquiry',
      title: 'New inquiry',
      body: q.name || 'Contact form',
      link_tab: 'inquiries',
      link_ref: q.id,
      created_at: q.created_at,
      dynamic: true,
    });
  }

  for (const m of waRes.data || []) {
    dynamic.push({
      id: `wa-${m.id}`,
      type: 'whatsapp',
      title: `WhatsApp from ${m.display_name || 'Customer'}`,
      body: (m.message_text || '').slice(0, 80),
      link_tab: 'whatsapp_ai',
      link_ref: m.id,
      created_at: m.created_at,
      dynamic: true,
    });
  }

  const merged = [...persisted, ...dynamic].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  return merged;
}

export async function GET(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const supabase = getSupabaseAdmin();
    const adminUserId = auth.user.id;
    const dismissed = await getDismissedKeys(supabase, adminUserId);
    const merged = await buildNotifications(supabase);

    const visible = merged
      .filter((n) => !dismissed.has(n.id))
      .slice(0, 40);

    return NextResponse.json({
      ok: true,
      notifications: visible,
      unreadCount: visible.length,
    });
  } catch (err) {
    console.error('[admin/notifications]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await verifyAdminSession(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { id, markAllRead } = body;
    const supabase = getSupabaseAdmin();
    const adminUserId = auth.user.id;

    if (markAllRead) {
      const merged = await buildNotifications(supabase);
      const dismissed = await getDismissedKeys(supabase, adminUserId);
      const visible = merged.filter((n) => !dismissed.has(n.id));
      const keys = visible.map((n) => n.id);

      const { error: readError } = await supabase
        .from('admin_notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);

      if (readError && readError.code !== '42P01' && !readError.message?.includes('does not exist')) {
        console.warn('[admin/notifications] mark all persisted:', readError.message);
      }

      await dismissKeys(supabase, adminUserId, keys);

      return NextResponse.json({ ok: true, dismissed: keys.length });
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing notification id' }, { status: 400 });
    }

    if (isDynamicNotificationId(id)) {
      await dismissKeys(supabase, adminUserId, [id]);
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.warn('[admin/notifications] mark read:', error.message);
    }

    await dismissKeys(supabase, adminUserId, [id]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
