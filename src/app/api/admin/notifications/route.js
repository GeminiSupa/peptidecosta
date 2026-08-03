import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyAdminSession } from '@/lib/adminAuth';
import { orderVisibleToAgent } from '@/lib/agentOrders';
import { resolveAdminTabAccess } from '@/lib/adminModules';
import { notificationsEnabled } from '@/lib/notificationPreferences.mjs';
import {
  conversationVisibleToProfile,
  normalizeWaId,
} from '@/lib/whatsappConversations.mjs';

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

const NOTIFICATION_TYPE_TABS = {
  low_inventory: 'spreadsheet',
  new_order: 'orders',
  order_save_failed: 'orders',
  payment_received: 'orders',
  pending_order: 'orders',
  inquiry: 'inquiries',
  whatsapp: 'whatsapp_ai',
  facebook: 'messenger',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notificationTargetTab(notification) {
  const explicit = String(notification?.link_tab || '').trim();
  if (explicit === 'facebook') return 'messenger';
  if (explicit) return explicit;
  return NOTIFICATION_TYPE_TABS[notification?.type] || null;
}

function canAccessNotificationTarget(notification, profile) {
  if (!profile) return false;
  if (profile.is_superadmin) return true;
  const tab = notificationTargetTab(notification);
  if (!tab) return false;
  return resolveAdminTabAccess(tab, profile);
}

function isOrderNotification(notification) {
  return notificationTargetTab(notification) === 'orders';
}

async function getPersistedOrderMap(supabase, notifications, profile) {
  if (!profile || profile.is_superadmin) return new Map();

  const refs = [
    ...new Set(
      (notifications || [])
        .filter(isOrderNotification)
        .map((n) => String(n.link_ref || '').trim())
        .filter(Boolean)
    ),
  ];
  if (!refs.length) return new Map();

  const byRef = new Map();
  const addRows = (rows = []) => {
    for (const order of rows) {
      if (order.id) byRef.set(String(order.id), order);
      if (order.order_number) byRef.set(String(order.order_number), order);
    }
  };

  const uuidRefs = refs.filter((ref) => UUID_RE.test(ref));
  if (uuidRefs.length) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, sales_agent')
      .in('id', uuidRefs);
    if (error) {
      console.warn('[admin/notifications] order id visibility lookup:', error.message);
    } else {
      addRows(data);
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, sales_agent')
    .in('order_number', refs);
  if (error) {
    console.warn('[admin/notifications] order number visibility lookup:', error.message);
  } else {
    addRows(data);
  }

  return byRef;
}

async function getWhatsappConversationMap(supabase, messages) {
  const waIds = [
    ...new Set(
      (messages || [])
        .map((message) => normalizeWaId(message.wa_id))
        .filter(Boolean)
    ),
  ];
  if (!waIds.length) return new Map();

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('wa_id, assigned_to, assigned_to_email, assigned_to_name, status')
    .in('wa_id', waIds);

  if (error) {
    console.warn('[admin/notifications] WhatsApp conversation visibility lookup:', error.message);
    return new Map();
  }

  return new Map((data || []).map((conversation) => [normalizeWaId(conversation.wa_id), conversation]));
}

function canSeeNotification(notification, profile, orderMap = new Map()) {
  if (!canAccessNotificationTarget(notification, profile)) return false;
  if (!profile || profile.is_superadmin || !isOrderNotification(notification)) return true;

  const ref = String(notification.link_ref || '').trim();
  const order = ref ? orderMap.get(ref) : null;
  return order ? orderVisibleToAgent(order, profile) : true;
}

async function buildNotifications(supabase, profile = null) {
  const since = new Date(Date.now() - 7 * 24 * 3600000).toISOString();

  const [notifRes, ordersRes, inquiriesRes, waRes, facebookRes] = await Promise.all([
    supabase
      .from('admin_notifications')
      .select('*')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('orders')
      .select('id, order_number, customer_name, status, sales_agent, created_at')
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
      .select('id, wa_id, display_name, message_text, created_at, direction')
      .eq('direction', 'inbound')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('facebook_notifications')
      .select('id, type, sender_name, content, external_link, status, created_at')
      .eq('status', 'unread')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  const persistedOrderMap = await getPersistedOrderMap(supabase, notifRes.data || [], profile);
  const whatsappConversationMap = await getWhatsappConversationMap(supabase, waRes.data || []);
  const persisted = (notifRes.data || []).filter((n) => canSeeNotification(n, profile, persistedOrderMap));
  const dynamic = [];

  for (const o of ordersRes.data || []) {
    if (!resolveAdminTabAccess('orders', profile)) continue;
    if (profile && !profile.is_superadmin && !orderVisibleToAgent(o, profile)) continue;
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
    if (!resolveAdminTabAccess('inquiries', profile)) continue;
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
    if (!resolveAdminTabAccess('whatsapp_ai', profile)) continue;
    const conversation = whatsappConversationMap.get(normalizeWaId(m.wa_id));
    if (conversation && !conversationVisibleToProfile(conversation, profile)) continue;
    dynamic.push({
      id: `wa-${m.id}`,
      type: 'whatsapp',
      title: `WhatsApp from ${m.display_name || 'Customer'}`,
      body: (m.message_text || '').slice(0, 80),
      link_tab: 'whatsapp_ai',
      link_ref: String(m.wa_id || '').replace(/\D/g, ''),
      created_at: m.created_at,
      dynamic: true,
    });
  }

  for (const item of facebookRes.data || []) {
    if (!resolveAdminTabAccess('messenger', profile)) continue;
    const typeLabel = item.type === 'message' ? 'Messenger' : item.type === 'comment' ? 'Facebook comment' : 'Facebook lead';
    dynamic.push({
      id: `facebook-${item.id}`,
      type: 'facebook',
      title: `${typeLabel} from ${item.sender_name || 'Facebook user'}`,
      body: (item.content || '').slice(0, 100),
      link_tab: 'facebook',
      link_ref: item.id,
      link_url: item.external_link || null,
      created_at: item.created_at,
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

  // Master switch: this member has asked for no notifications at all.
  if (!notificationsEnabled(auth.profile)) {
    return NextResponse.json({ ok: true, notifications: [], unreadCount: 0 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const adminUserId = auth.user.id;
    const dismissed = await getDismissedKeys(supabase, adminUserId);
    const merged = await buildNotifications(supabase, auth.profile);

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
      const merged = await buildNotifications(supabase, auth.profile);
      const dismissed = await getDismissedKeys(supabase, adminUserId);
      const visible = merged.filter((n) => !dismissed.has(n.id));
      const keys = visible.map((n) => n.id);
      const persistedIds = visible
        .filter((n) => n.id && !n.dynamic)
        .map((n) => n.id);

      if (persistedIds.length) {
        const { error: readError } = await supabase
          .from('admin_notifications')
          .update({ read_at: new Date().toISOString() })
          .in('id', persistedIds)
          .is('read_at', null);

        if (readError && readError.code !== '42P01' && !readError.message?.includes('does not exist')) {
          console.warn('[admin/notifications] mark all persisted:', readError.message);
        }
      }

      await dismissKeys(supabase, adminUserId, keys);

      return NextResponse.json({ ok: true, dismissed: keys.length });
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing notification id' }, { status: 400 });
    }

    const visibleNotifications = await buildNotifications(supabase, auth.profile);
    const targetNotification = visibleNotifications.find((n) => String(n.id) === String(id));
    if (!targetNotification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    if (isDynamicNotificationId(id)) {
      if (String(id).startsWith('facebook-')) {
        const facebookId = String(id).slice('facebook-'.length);
        const { error: facebookError } = await supabase
          .from('facebook_notifications')
          .update({ status: 'read' })
          .eq('id', facebookId);
        if (facebookError) console.warn('[admin/notifications] Facebook mark read:', facebookError.message);
      }
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
