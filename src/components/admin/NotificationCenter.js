'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, ClipboardList, Inbox, MessageSquare, AlertCircle, MessageCircle } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import {
  dismissNotificationIds,
  filterDismissedNotifications,
} from '@/lib/adminNotifications';

const TYPE_ICON = {
  pending_order: ClipboardList,
  inquiry: Inbox,
  whatsapp: MessageSquare,
  facebook: MessageCircle,
  order_save_failed: AlertCircle,
};

const MOBILE_BREAKPOINT = 1024;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

export default function NotificationCenter({ onNavigate, refreshKey = 0, adminUserId = null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const [mounted, setMounted] = useState(false);
  const bellRef = useRef(null);
  const isMobile = useIsMobile();

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/notifications');
      const data = await res.json();
      if (res.ok) {
        const visible = filterDismissedNotifications(
          data.notifications || [],
          adminUserId
        );
        setItems(visible);
        setUnreadCount(visible.length);
      }
    } catch (err) {
      console.error('Notifications fetch failed:', err);
    }
    setLoading(false);
  }, [adminUserId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications, refreshKey]);

  const updatePanelPosition = useCallback(() => {
    if (!open || isMobile || !bellRef.current) {
      setPanelStyle({});
      return;
    }
    const rect = bellRef.current.getBoundingClientRect();
    const panelWidth = Math.min(360, window.innerWidth - 24);
    let left = rect.right - panelWidth;
    left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));
    const top = rect.bottom + 8;
    const maxHeight = Math.min(420, window.innerHeight - top - 16);
    setPanelStyle({
      position: 'fixed',
      top,
      left,
      width: panelWidth,
      maxHeight: Math.max(200, maxHeight),
    });
  }, [open, isMobile]);

  useEffect(() => {
    updatePanelPosition();
    if (!open) return;
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleClick = async (n) => {
    if (n.link_tab) onNavigate(n.link_tab, n.link_ref || null);
    setOpen(false);

    if (n.id) {
      setItems((prev) => prev.filter((item) => item.id !== n.id));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await adminFetch('/api/admin/notifications', {
          method: 'PATCH',
          body: JSON.stringify({ id: n.id }),
        });
        dismissNotificationIds(adminUserId, [n.id]);
      } catch {
        dismissNotificationIds(adminUserId, [n.id]);
      }
    }
    fetchNotifications();
  };

  const markAllRead = async () => {
    const ids = items.map((n) => n.id).filter(Boolean);
    try {
      const res = await adminFetch('/api/admin/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        dismissNotificationIds(adminUserId, ids);
        setItems([]);
        setUnreadCount(0);
      }
    } catch {
      dismissNotificationIds(adminUserId, ids);
      setItems([]);
      setUnreadCount(0);
    }
    fetchNotifications();
  };

  const panelContent = open && mounted ? (
    <>
      <button
        type="button"
        className="notification-backdrop"
        aria-label="Close notifications"
        onClick={() => setOpen(false)}
      />
      <div
        className={`notification-panel ${isMobile ? 'notification-panel--sheet' : 'notification-panel--dropdown'}`}
        style={isMobile ? undefined : panelStyle}
        role="dialog"
        aria-label="Notifications"
      >
        <div className="notification-panel-header">
          <span>Notifications</span>
          <div className="notification-panel-actions">
            {unreadCount > 0 && (
              <button type="button" className="notification-mark-read" onClick={markAllRead}>
                Mark read
              </button>
            )}
            <button
              type="button"
              className="notification-close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="notification-list">
          {loading && items.length === 0 ? (
            <p className="notification-empty">Loading…</p>
          ) : items.length === 0 ? (
            <p className="notification-empty">All caught up.</p>
          ) : (
            items.map((n) => {
              const Icon = TYPE_ICON[n.type] || Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  className="notification-item"
                  onClick={() => handleClick(n)}
                >
                  <Icon size={16} className="notification-item-icon" />
                  <div className="notification-item-content">
                    <div className="notification-item-title">{n.title}</div>
                    {n.body && <div className="notification-item-body">{n.body}</div>}
                    <div className="notification-item-time">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="notification-center">
      <button
        ref={bellRef}
        type="button"
        className="notification-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {mounted && panelContent && createPortal(panelContent, document.body)}
    </div>
  );
}
