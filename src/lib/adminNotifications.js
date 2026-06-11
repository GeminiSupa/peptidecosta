/** Dynamic notification ids are synthesized in GET — not rows in admin_notifications. */
export function isDynamicNotificationId(id) {
  const s = String(id || '');
  return (
    s.startsWith('order-pending-') ||
    s.startsWith('inquiry-') ||
    s.startsWith('wa-')
  );
}

export function dismissedStorageKey(adminUserId) {
  return `admin_notif_dismissed_${adminUserId || 'default'}`;
}

export function readDismissedIds(adminUserId) {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(dismissedStorageKey(adminUserId));
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function writeDismissedIds(adminUserId, ids) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      dismissedStorageKey(adminUserId),
      JSON.stringify([...ids])
    );
  } catch {
    // ignore quota errors
  }
}

export function dismissNotificationIds(adminUserId, ids) {
  const set = readDismissedIds(adminUserId);
  for (const id of ids) set.add(id);
  writeDismissedIds(adminUserId, set);
}

export function filterDismissedNotifications(notifications, adminUserId, serverDismissed = null) {
  const local = readDismissedIds(adminUserId);
  const server = serverDismissed instanceof Set ? serverDismissed : new Set();
  return (notifications || []).filter((n) => !local.has(n.id) && !server.has(n.id));
}
