"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Package, Clock, MapPin, Phone, User, RefreshCw } from 'lucide-react';
import { formatCrDate } from '@/lib/crTime.mjs';

// How often the queue re-reads itself while the tab is open.
//
// This screen is watched, not visited: whoever is packing leaves it up and
// works from it, so an order handed over by sales has to appear on its own.
// Thirty seconds is fast enough that nobody sits waiting and slow enough that
// a full day on the tab is a few hundred queries, not a few thousand.
const AUTO_REFRESH_MS = 30000;

// Orders leave this queue the same way they leave "packing" in real life:
// once they are marked Order Complete (with a tracking number), which is the
// existing status that already fires the customer's shipped notification.
// Nothing here invents a second "done" state to keep in sync with that one.
const DONE_STATUSES = new Set(['completed', 'order complete']);
const DEAD_STATUSES = new Set(['cancelled', 'declined', 'refunded']);

function isInFulfillmentQueue(order) {
  if (!order?.ready_to_prepare_at) return false;
  const status = String(order.status || '').toLowerCase();
  return !DONE_STATUSES.has(status) && !DEAD_STATUSES.has(status);
}

function timeWaiting(sinceIso) {
  const since = new Date(sinceIso).getTime();
  if (!Number.isFinite(since)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - since) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function orderItemsSummary(order) {
  return (order.items || [])
    .map((item) => `${Number(item.qty) || 1}x ${item.product || item.name || 'Item'}`)
    .join(', ') || 'No items on file';
}

function orderTotalLabel(order) {
  return order.currency === 'USD'
    ? `$${Number(order.total_usd || 0).toLocaleString('en-US')}`
    : `₡${Number(order.total_crc || 0).toLocaleString('es-CR')}`;
}

export default function FulfillmentManager({
  orders = [],
  setSelectedOrderDetails,
  onRefreshOrders,
  refreshingOrders = false,
  ordersRefreshError = '',
}) {
  const queue = (orders || [])
    .filter(isInFulfillmentQueue)
    .sort((a, b) => new Date(a.ready_to_prepare_at) - new Date(b.ready_to_prepare_at));

  const [lastRefreshed, setLastRefreshed] = useState(null);
  // Held in a ref so the interval below never has to be torn down and rebuilt
  // when the parent hands us a new function identity on every render — which it
  // does, because refreshOrders is redefined each time the admin page renders.
  const refreshRef = useRef(onRefreshOrders);
  refreshRef.current = onRefreshOrders;

  const refreshNow = useCallback(async () => {
    if (!refreshRef.current) return;
    await refreshRef.current();
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    if (!onRefreshOrders) return undefined;

    // Paused while the tab is in the background. A packer leaves this open all
    // day behind other windows, and polling a screen nobody is looking at is
    // just load. Coming back re-reads immediately, so what they see on return
    // is current rather than up to thirty seconds stale.
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshNow();
    };

    const timer = setInterval(tick, AUTO_REFRESH_MS);

    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) refreshNow();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }

    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
    // onRefreshOrders is read through the ref, so only its presence matters.
  }, [Boolean(onRefreshOrders), refreshNow]);

  return (
    <div className="admin-tab-panel">
      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)', padding: '10px', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 15px rgba(251, 191, 36, 0.4)' }}>
            <Package size={22} />
          </div>
          <div>
            <h2 className="admin-section-title" style={{ margin: 0 }}>Fulfillment</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              {queue.length} order{queue.length === 1 ? '' : 's'} handed off by sales, waiting to be packed
            </p>
          </div>
        </div>

        {onRefreshOrders && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              {refreshingOrders
                ? 'Checking…'
                : lastRefreshed
                  ? `Updated ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · checks every 30s`
                  : 'Checks for new orders every 30 seconds'}
            </span>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={refreshNow}
              disabled={refreshingOrders}
              title="Check for new orders now, without reloading the page"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={14} style={refreshingOrders ? { animation: 'spin 0.8s linear infinite' } : undefined} />
              {refreshingOrders ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      {ordersRefreshError && (
        <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, color: '#fecaca', fontSize: '0.85rem' }}>
          {ordersRefreshError}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="admin-empty-state" style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <div className="empty-icon" style={{ opacity: 0.5 }}><Package size={48} /></div>
          <h3>Nothing waiting</h3>
          <p>Orders show up here the moment an agent marks them "ready to prepare".</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {queue.map((order) => (
            <article
              key={order.id}
              style={{
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(251, 191, 36, 0.25)',
                borderRadius: 14,
                padding: '16px 18px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: '1 1 320px', minWidth: 260 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <strong style={{ color: '#f8fafc', fontSize: '1rem' }}>#{order.order_number}</strong>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#fbbf24', fontSize: '.75rem', fontWeight: 700 }}>
                    <Clock size={12} /> waiting {timeWaiting(order.ready_to_prepare_at)}
                  </span>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <User size={13} /> {order.customer_name || 'Customer'}
                  {order.customer_phone && <span style={{ color: '#64748b' }}>· {order.customer_phone}</span>}
                </div>
                {order.shipping_address && (
                  <div style={{ color: '#94a3b8', fontSize: '.8rem', display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                    <MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} /> {order.shipping_address}
                  </div>
                )}
                <div style={{ color: '#e2e8f0', fontSize: '.85rem', marginTop: 6 }}>{orderItemsSummary(order)}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 160 }}>
                <strong style={{ color: '#4ade80', fontSize: '1rem' }}>{orderTotalLabel(order)}</strong>
                <span style={{ color: '#64748b', fontSize: '.72rem', textAlign: 'right' }}>
                  Handed off {order.ready_to_prepare_by ? `by ${order.ready_to_prepare_by}` : ''}
                  <br />
                  {formatCrDate(order.ready_to_prepare_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setSelectedOrderDetails?.(order)}
                  style={{ fontSize: '.8rem', padding: '8px 14px' }}
                >
                  <Phone size={13} style={{ marginRight: 6 }} /> Open & mark shipped
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
