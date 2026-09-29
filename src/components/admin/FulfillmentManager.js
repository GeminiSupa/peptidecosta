"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Package, Clock, MapPin, User, RefreshCw, ChevronRight, Info } from 'lucide-react';
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
  onUndoReadyToPrepare,
  ordersRefreshError = '',
  // True while an order detail panel is open over this tab.
  //
  // refreshOrders replaces the whole orders list AND re-points the open detail
  // panel at the freshly read row. Triggered by a button that is fine: someone
  // asked for it. Triggered by a timer under someone who is halfway through
  // typing a customer's address, it would pull the row out from under them
  // every thirty seconds. The queue is a few seconds stale for as long as the
  // panel is open, which costs nothing - they are looking at one order, not the
  // list - and it resumes the moment they close it.
  paused = false,
}) {
  const queue = (orders || [])
    .filter(isInFulfillmentQueue)
    .sort((a, b) => new Date(a.ready_to_prepare_at) - new Date(b.ready_to_prepare_at));

  const [lastRefreshed, setLastRefreshed] = useState(null);
  // Only a refresh the user asked for is allowed to show a spinner.
  //
  // `refreshingOrders` from the parent goes true for BOTH kinds, so driving the
  // button off it made the icon spin and the label flip to "Checking…" every
  // thirty seconds on its own. On a screen someone stares at all day that is
  // movement in the corner of their eye with nothing behind it. The automatic
  // re-read stays completely silent; the only thing it changes is the "Updated"
  // time, which is the point of it.
  const [manualRefreshing, setManualRefreshing] = useState(false);
  // Collapsed by default: it is for the first week on the tab, not every day.
  const [showHelp, setShowHelp] = useState(false);
  // Held in a ref so the interval below never has to be torn down and rebuilt
  // when the parent hands us a new function identity on every render — which it
  // does, because refreshOrders is redefined each time the admin page renders.
  const refreshRef = useRef(onRefreshOrders);
  refreshRef.current = onRefreshOrders;

  // The silent one, used by the timer.
  const refreshQuietly = useCallback(async () => {
    if (!refreshRef.current) return;
    await refreshRef.current();
    setLastRefreshed(new Date());
  }, []);

  // The one behind the button, which does show it is working.
  const refreshNow = useCallback(async () => {
    if (!refreshRef.current) return;
    setManualRefreshing(true);
    try {
      await refreshQuietly();
    } finally {
      setManualRefreshing(false);
    }
  }, [refreshQuietly]);

  // Read through a ref for the same reason as the callback: the timer is set up
  // once, and must see the current value of `paused` without being rebuilt.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!onRefreshOrders) return undefined;

    // Also paused while the tab is in the background. A packer leaves this open
    // all day behind other windows, and polling a screen nobody is looking at
    // is just load. Coming back re-reads immediately, so what they see on
    // return is current rather than up to thirty seconds stale.
    const tick = () => {
      if (pausedRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshQuietly();
    };

    const timer = setInterval(tick, AUTO_REFRESH_MS);

    const onVisible = () => {
      if (pausedRef.current) return;
      if (typeof document !== 'undefined' && !document.hidden) refreshQuietly();
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
    // onRefreshOrders and paused are read through refs, so only the presence of
    // a refresh function matters here.
  }, [Boolean(onRefreshOrders), refreshQuietly]);

  return (
    <div className="admin-tab-panel">
      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)', padding: '10px', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 15px rgba(251, 191, 36, 0.4)' }}>
            <Package size={22} />
          </div>
          <div>
            <h2 className="admin-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              Fulfillment
              {/* Nothing on this screen says where its orders come from, how one
                  leaves, or that either is reversible. Someone new to it has to
                  be told by a colleague, which is how a queue grows a backlog
                  nobody understands. It is collapsed, so it explains itself
                  once and then stays out of the way. */}
              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                aria-expanded={showHelp}
                title="How this tab works"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                  background: showHelp ? 'rgba(251,191,36,0.18)' : 'rgba(148,163,184,0.12)',
                  border: `1px solid ${showHelp ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.12)'}`,
                  color: showHelp ? '#fbbf24' : '#94a3b8', padding: 0,
                }}
              >
                <Info size={13} />
              </button>
            </h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              {queue.length} order{queue.length === 1 ? '' : 's'} handed off by sales, waiting to be packed
            </p>
          </div>
        </div>

        {onRefreshOrders && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* manualRefreshing, never refreshingOrders: the automatic re-read
                must not announce itself. */}
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              {paused
                ? 'Paused while an order is open'
                : lastRefreshed
                  ? `Updated ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · checks every 30s`
                  : 'Checks for new orders every 30 seconds'}
            </span>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={refreshNow}
              disabled={manualRefreshing}
              title="Check for new orders now, without reloading the page"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={14} style={manualRefreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
              {manualRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      {showHelp && (
        <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.22)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
            <strong style={{ color: '#fbbf24', fontSize: '0.92rem' }}>How this tab works</strong>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              Hide
            </button>
          </div>

          <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.75 }}>
            <li>
              <strong style={{ color: '#e2e8f0' }}>Getting an order here.</strong> In the{' '}
              <strong style={{ color: '#e2e8f0' }}>Orders</strong> tab, find an order that is{' '}
              <strong style={{ color: '#e2e8f0' }}>Paid</strong> or <strong style={{ color: '#e2e8f0' }}>Processing</strong>,
              and click the yellow <strong style={{ color: '#fbbf24' }}>📦 Ready to prepare</strong> button on the right
              of its row. It is a button, not a status — you will not find it in the status dropdown.
            </li>
            <li>
              <strong style={{ color: '#e2e8f0' }}>Packing it.</strong> Click{' '}
              <strong style={{ color: '#e2e8f0' }}>Open order</strong> here. That opens the order — it does not
              ship anything by itself. Inside, add the <strong style={{ color: '#e2e8f0' }}>tracking number</strong>{' '}
              and set the status to <strong style={{ color: '#e2e8f0' }}>Order Complete</strong>. That is what emails
              the customer to say it is on the way.
            </li>
            <li>
              <strong style={{ color: '#e2e8f0' }}>It disappears from here</strong> as soon as the order is{' '}
              <strong style={{ color: '#e2e8f0' }}>Order Complete</strong> — or Cancelled, Declined or Refunded.
              Nothing else removes it, so anything sitting here is genuinely still waiting to be packed.
            </li>
            <li>
              <strong style={{ color: '#e2e8f0' }}>Sent here by mistake?</strong> Click{' '}
              <strong style={{ color: '#e2e8f0' }}>Send back to Orders</strong> on the order below, or click the
              yellow <strong style={{ color: '#fbbf24' }}>📦 Ready</strong> tag on its row in the Orders tab. It
              asks you to confirm, and you can hand it off again any time.
            </li>
          </ol>

          <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.6 }}>
            This list updates itself every 30 seconds — you never need to reload the page. It holds still while
            you have an order open, so nothing you are typing gets wiped.
          </p>
        </div>
      )}

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
                {/* "Open & mark shipped" was a lie: this only opens the order.
                    Marking it shipped is two more steps inside the panel, and a
                    button that claims to have done them is how an order gets
                    packed, closed, and never actually completed. It says what
                    it does; the tooltip says what comes next. */}
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setSelectedOrderDetails?.(order)}
                  style={{ fontSize: '.8rem', padding: '8px 14px', display: 'inline-flex', alignItems: 'center' }}
                  title="Open this order to add the tracking number and set it to Order Complete"
                >
                  Open order <ChevronRight size={14} style={{ marginLeft: 4 }} />
                </button>

                {/* The way out that is not "complete it". Deliberately quiet and
                    below the main action: it is the rarer choice, and an order
                    vanishing from a packer's queue by accident is worse than one
                    extra click. */}
                {onUndoReadyToPrepare && (
                  <button
                    type="button"
                    onClick={() => onUndoReadyToPrepare(order.id)}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#64748b', fontSize: '.72rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                    title="Remove this order from Fulfillment and put it back in the Orders tab"
                  >
                    Send back to Orders
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
