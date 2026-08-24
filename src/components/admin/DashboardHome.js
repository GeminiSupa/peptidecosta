'use client';

import React, { useMemo, useState } from 'react';
import {
  ClipboardList, ShoppingCart, Target, DollarSign, Package,
  AlertTriangle, Inbox, MessageSquare, TrendingUp, ChevronRight, Star, CheckCircle,
} from 'lucide-react';
import { orderCountsAsSale, orderGrossUsd, orderNetRevenueUsd, orderRevenueBasis } from '@/lib/orderRevenue.mjs';
import KpiBreakdownModal from './KpiBreakdownModal';

const FALLBACK_RATE = 454.48;

// Matches the status_change log messages written when an order is marked
// paid/complete (e.g. "Status changed to Order Complete").
const COMPLETION_MESSAGE_RE = /paid|complet/i;

// Trustpilot's FREE plan sends 50 verified review invitations per month.
// If the account is upgraded, change this (Starter = 100, Plus = 300).
const TRUSTPILOT_MONTHLY_LIMIT = 50;
// The order-complete email (which BCCs Trustpilot to trigger an invitation) only
// fires for these statuses, so we count these to estimate invitations used.
const INVITE_TRIGGER_STATUSES = new Set(['Completed', 'Order Complete']);
// The Trustpilot AFS integration went live on this date (CR midnight). Orders
// completed BEFORE this never BCC'd Trustpilot, so counting them would wildly
// over-report the first month — we only count completions from here onward.
const TRUSTPILOT_GO_LIVE = new Date('2026-07-14T06:00:00Z');

function isOutOfStock(status) {
  const s = (status || '').toLowerCase();
  return s.includes('out of stock') || s.includes('agotado');
}

function isComingSoon(status) {
  const s = (status || '').toLowerCase();
  return s.includes('coming soon') || s.includes('próximamente');
}

// Costa Rica is UTC−6 year-round (no daylight saving), so we anchor "today" and
// "this week" to Costa Rica time — every admin sees the same day regardless of
// their own machine's timezone.
const CR_OFFSET_MS = 6 * 60 * 60 * 1000;

// Start of "today" in Costa Rica, returned as an absolute instant (real Date).
function startOfDay(d = new Date()) {
  const cr = new Date(d.getTime() - CR_OFFSET_MS); // shift into CR wall-clock frame
  cr.setUTCHours(0, 0, 0, 0);                       // midnight, CR time
  return new Date(cr.getTime() + CR_OFFSET_MS);     // back to the real UTC instant
}

// Start of the week (Monday) in Costa Rica, as an absolute instant.
function startOfWeek(d = new Date()) {
  const cr = new Date(d.getTime() - CR_OFFSET_MS);
  cr.setUTCHours(0, 0, 0, 0);
  const day = cr.getUTCDay();                        // 0 = Sunday, in CR time
  const diff = day === 0 ? 6 : day - 1;
  cr.setUTCDate(cr.getUTCDate() - diff);
  return new Date(cr.getTime() + CR_OFFSET_MS);
}

// Start of the current month in Costa Rica, as an absolute instant. Used for the
// monthly Trustpilot invitation quota, which resets on the 1st.
function startOfMonth(d = new Date()) {
  const cr = new Date(d.getTime() - CR_OFFSET_MS);
  cr.setUTCHours(0, 0, 0, 0);
  cr.setUTCDate(1);
  return new Date(cr.getTime() + CR_OFFSET_MS);
}

// The date revenue should be recognized on: the moment the order was marked
// paid/complete, not when it was created. Derived from the order's activity_log
// (falling back to created_at for orders with no completion event logged).
// Mirrors the commission weekly-report so both features agree.
function getRevenueDate(order) {
  let when = new Date(order.created_at);
  if (Array.isArray(order.activity_log)) {
    const completionLogs = order.activity_log.filter(
      (log) => log?.type === 'status_change' && COMPLETION_MESSAGE_RE.test(log?.message || '')
    );
    if (completionLogs.length > 0) {
      // activity_log is newest-first, so the last match is the FIRST time the
      // order reached completion — the correct recognition date.
      when = new Date(completionLogs[completionLogs.length - 1].at);
    }
  }
  return when;
}

function cartValue(cart) {
  if (!Array.isArray(cart.cart_data)) return 0;
  return cart.cart_data.reduce((sum, item) => {
    const p = parseFloat(String(item.price_usd || item.priceUsd || item.price || '0').replace(/[^0-9.]/g, '')) || 0;
    return sum + p * (item.qty || 1);
  }, 0);
}

export default function DashboardHome({
  orders = [],
  abandonedCarts = [],
  leads = [],
  products = [],
  inquiryCount = 0,
  onNavigate,
  onOpenOrder,
  onCreateOrder,
  isSuperadmin = false,
  onOverrideStats,
  exchangeRate = FALLBACK_RATE,
}) {
  // Which tile's breakdown is open: 'revenueToday' | 'revenueWeek' | 'pendingOrders'.
  const [openTile, setOpenTile] = useState(null);
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    const pendingOrders = orders.filter((o) => (o.status || 'Pending') === 'Pending');

    // Net of refunds: a $100 order with $30 given back is $70 of revenue, not
    // $100. The same sum backs the commission report and the analytics chart, so
    // the three screens cannot disagree about what one order was worth.
    // The rate is passed because a WooCommerce order off the main site arrives
    // with its colón total only, and is converted here rather than counting $0.
    const revenueInRange = (start) =>
      orders
        .filter((o) => orderCountsAsSale(o) && getRevenueDate(o) >= start)
        .reduce((sum, o) => sum + orderNetRevenueUsd(o, exchangeRate), 0);

    const revenueToday = revenueInRange(todayStart);
    const revenueWeek = revenueInRange(weekStart);

    const recoverableCarts = abandonedCarts.filter((c) => c.status === 'active' || !c.status);
    const recoverableValue = recoverableCarts.reduce((s, c) => s + cartValue(c), 0);

    const hotLeads = leads
      .filter((l) => (l.status || 'New') === 'New' || !l.contacted)
      .slice(0, 5);

    const stockAlerts = products.filter((p) => isOutOfStock(p.status) || isComingSoon(p.status));

    const recentOrders = [...orders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6);

    // Trustpilot invitations used this month (estimate): every order marked
    // complete with a customer email triggers one verified invitation via the
    // order-complete email BCC. Dated by completion (CR time), like revenue.
    const monthStart = startOfMonth(now);
    // Count from the later of "start of month" and "integration go-live" so the
    // first month isn't inflated by completions that predate the Trustpilot BCC.
    const countFrom = monthStart > TRUSTPILOT_GO_LIVE ? monthStart : TRUSTPILOT_GO_LIVE;
    const trustpilotUsed = orders.filter((o) =>
      INVITE_TRIGGER_STATUSES.has(o.status) && o.customer_email && getRevenueDate(o) >= countFrom
    ).length;

    return {
      pendingOrders,
      revenueToday,
      revenueWeek,
      recoverableCarts,
      recoverableValue,
      hotLeads,
      stockAlerts,
      recentOrders,
      trustpilotUsed,
    };
  }, [orders, abandonedCarts, leads, products, exchangeRate]);

  // What actually made each tile. Deliberately wider than the tile itself: it
  // carries the orders inside the window that are NOT counting too, since the
  // point is to be able to force one in as well as hold one out.
  const breakdowns = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    const inWindow = (start) => orders
      .filter((order) => getRevenueDate(order) >= start)
      .map((order) => ({
        id: order.id,
        orderNumber: order.order_number,
        customer: order.customer_name,
        date: getRevenueDate(order),
        amountUsd: orderNetRevenueUsd(order, exchangeRate) || orderGrossUsd(order, exchangeRate),
        basis: orderRevenueBasis(order),
      }))
      // Counting orders first, then newest, so the money is at the top.
      .sort((a, b) => Number(b.basis.counts) - Number(a.basis.counts) || b.date - a.date);

    return {
      revenueToday: inWindow(todayStart),
      revenueWeek: inWindow(weekStart),
      pendingOrders: orders
        .filter((order) => (order.status || 'Pending') === 'Pending')
        .map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          customer: order.customer_name,
          date: new Date(order.created_at),
          amountUsd: orderGrossUsd(order, exchangeRate),
          basis: orderRevenueBasis(order),
        }))
        .sort((a, b) => b.date - a.date),
    };
  }, [orders, exchangeRate]);

  const TILE_TITLES = {
    revenueToday: 'Revenue Today',
    revenueWeek: 'Revenue This Week',
    pendingOrders: 'Pending Orders',
  };
  const TILE_SUBTITLES = {
    revenueToday: 'Orders dated today by when they were marked paid or complete, not when they were created.',
    revenueWeek: 'Orders dated this week by when they were marked paid or complete, not when they were created.',
    pendingOrders: 'Orders still sitting at Pending. These are not counted as revenue.',
  };

  const applyOverrides = async (changes, reason) => {
    if (!onOverrideStats) throw new Error('Changing the figures is not available here.');
    await onOverrideStats(changes, reason);
  };

  // Remaining invitations + a color that warns as the monthly quota runs low.
  const trustpilotRemaining = Math.max(0, TRUSTPILOT_MONTHLY_LIMIT - stats.trustpilotUsed);
  const trustpilotColor = trustpilotRemaining === 0 ? '#f87171' : trustpilotRemaining <= 10 ? '#fbbf24' : '#34d399';

  const attention = [
    stats.pendingOrders.length > 0 && {
      key: 'pending',
      icon: ClipboardList,
      color: '#f59e0b',
      title: `${stats.pendingOrders.length} pending order${stats.pendingOrders.length > 1 ? 's' : ''}`,
      sub: 'Need confirmation or payment',
      action: 'Open orders',
      tab: 'orders',
    },
    stats.recoverableCarts.length > 0 && {
      key: 'carts',
      icon: ShoppingCart,
      color: '#38bdf8',
      title: `${stats.recoverableCarts.length} abandoned cart${stats.recoverableCarts.length > 1 ? 's' : ''}`,
      sub: `~$${Math.round(stats.recoverableValue)} recoverable`,
      action: 'Recover carts',
      tab: 'carts',
    },
    inquiryCount > 0 && {
      key: 'inquiries',
      icon: Inbox,
      color: '#c084fc',
      title: `${inquiryCount} new inquir${inquiryCount > 1 ? 'ies' : 'y'}`,
      sub: 'Contact form messages',
      action: 'Reply now',
      tab: 'inquiries',
    },
    stats.hotLeads.length > 0 && {
      key: 'leads',
      icon: Target,
      color: '#4ade80',
      title: `${stats.hotLeads.length} hot lead${stats.hotLeads.length > 1 ? 's' : ''}`,
      sub: 'Not yet contacted',
      action: 'Follow up',
      tab: 'leads',
    },
    stats.stockAlerts.length > 0 && {
      key: 'stock',
      icon: AlertTriangle,
      color: '#f87171',
      title: `${stats.stockAlerts.length} stock alert${stats.stockAlerts.length > 1 ? 's' : ''}`,
      sub: 'Out of stock or coming soon',
      action: 'Fix stock',
      tab: 'spreadsheet',
    },
  ].filter(Boolean);

  return (
    <div className="dashboard-home">
      <div className="dashboard-home-header">
        <div>
          <h2 className="dashboard-home-title">Today</h2>
          <p className="dashboard-home-subtitle">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary dashboard-manual-order-btn" onClick={onCreateOrder}>
          + Manual Order
        </button>
      </div>

      <section className="dashboard-section dashboard-next-actions">
        <div className="dashboard-section-heading-row">
          <h3 className="dashboard-section-title">Next Actions</h3>
          <span className="dashboard-section-count">{attention.length || 'Clear'}</span>
        </div>
        {attention.length > 0 ? (
          <div className="dashboard-attention-list">
            {attention.map((item) => (
              <button
                key={item.key}
                type="button"
                className="dashboard-attention-item"
                onClick={() => onNavigate(item.tab)}
              >
                <span className="dashboard-attention-icon" style={{ background: `${item.color}1f`, color: item.color }}>
                  <item.icon size={20} />
                </span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="dashboard-attention-title">{item.title}</div>
                  <div className="dashboard-attention-sub">{item.sub}</div>
                </div>
                <span className="dashboard-attention-action">
                  {item.action}
                  <ChevronRight size={15} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty-card">
            <CheckCircleFallback />
            <div>
              <div className="dashboard-empty-title">No urgent work waiting</div>
              <div className="dashboard-empty-copy">Orders, carts, inquiries, leads, and stock alerts are clear.</div>
            </div>
          </div>
        )}
      </section>

      <div className="dashboard-kpi-grid">
        <button
          type="button"
          className="dashboard-kpi-card is-clickable"
          onClick={() => setOpenTile('pendingOrders')}
          title="See what made this number"
        >
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <ClipboardList size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">{stats.pendingOrders.length}</div>
            <div className="dashboard-kpi-label">Pending Orders</div>
          </div>
        </button>
        <button
          type="button"
          className="dashboard-kpi-card is-clickable"
          onClick={() => setOpenTile('revenueToday')}
          title="See what made this number"
        >
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">${stats.revenueToday.toLocaleString()}</div>
            <div className="dashboard-kpi-label">Revenue Today</div>
          </div>
        </button>
        <button
          type="button"
          className="dashboard-kpi-card is-clickable"
          onClick={() => setOpenTile('revenueWeek')}
          title="See what made this number"
        >
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">${stats.revenueWeek.toLocaleString()}</div>
            <div className="dashboard-kpi-label">Revenue This Week</div>
          </div>
        </button>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
            <ShoppingCart size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">${Math.round(stats.recoverableValue).toLocaleString()}</div>
            <div className="dashboard-kpi-label">Recoverable Carts</div>
          </div>
        </div>
      </div>

      <section className="dashboard-section dashboard-health-section">
        <div className="dashboard-section-heading-row">
          <h3 className="dashboard-section-title">Health</h3>
        </div>
        <div className="dashboard-health-card" title={`Estimate (~${trustpilotRemaining} left): ${stats.trustpilotUsed} of ${TRUSTPILOT_MONTHLY_LIMIT} invitations approx. sent this month. Free plan has no Trustpilot API, so this is not the exact count.`}>
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(52, 211, 153, 0.15)', color: trustpilotColor }}>
            <Star size={20} />
          </div>
          <div>
            <div className="dashboard-health-title" style={{ color: trustpilotColor }}>~{trustpilotRemaining} Trustpilot invites left</div>
            <div className="dashboard-health-copy">
              Estimate only from completed orders this month. Used {stats.trustpilotUsed}/{TRUSTPILOT_MONTHLY_LIMIT}.
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-two-col">
        <section className="dashboard-section">
          <h3 className="dashboard-section-title">Recent Orders</h3>
          {stats.recentOrders.length === 0 ? (
            <p className="dashboard-empty">No orders yet.</p>
          ) : (
            <div className="dashboard-mini-list">
              {stats.recentOrders.map((o) => {
                const _oItems = Array.isArray(o.items) ? o.items : [];
                const _oStored = o.currency === 'USD' ? Number(o.total_usd || 0) : Number(o.total_crc || 0);
                const _oDisplay = _oStored;
                return (
                <button
                  key={o.id}
                  type="button"
                  className="dashboard-mini-row"
                  onClick={() => onOpenOrder(o)}
                >
                  <div>
                    <div className="dashboard-mini-title">#{o.order_number || o.id.slice(0, 8)}</div>
                    <div className="dashboard-mini-sub">{o.customer_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="dashboard-mini-val">
                      {o.currency === 'CRC' ? `₡${Math.round(_oDisplay).toLocaleString()}` : `$${_oDisplay.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                    </div>
                    <div className="dashboard-mini-sub">{o.status || 'Pending'}</div>
                  </div>
                </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="dashboard-section">
          <h3 className="dashboard-section-title">Stock Alerts</h3>
          {stats.stockAlerts.length === 0 ? (
            <p className="dashboard-empty">All products in stock.</p>
          ) : (
            <div className="dashboard-mini-list">
              {stats.stockAlerts.slice(0, 8).map((p) => (
                <button
                  key={p.id || p.product}
                  type="button"
                  className="dashboard-mini-row"
                  onClick={() => onNavigate('spreadsheet')}
                >
                  <Package size={16} style={{ color: isOutOfStock(p.status) ? '#f87171' : '#fbbf24' }} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div className="dashboard-mini-title">{p.product}</div>
                    <div className="dashboard-mini-sub">{p.status}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {stats.hotLeads.length > 0 && (
        <section className="dashboard-section">
          <h3 className="dashboard-section-title">Hot Leads</h3>
          <div className="dashboard-mini-list">
            {stats.hotLeads.map((l) => (
              <button
                key={l.id}
                type="button"
                className="dashboard-mini-row"
                onClick={() => onNavigate('leads')}
              >
                <Target size={16} style={{ color: '#4ade80' }} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="dashboard-mini-title">{l.name || l.email || l.phone || 'Lead'}</div>
                  <div className="dashboard-mini-sub">{l.phone || l.email || 'No contact'}</div>
                </div>
                <MessageSquare size={14} style={{ color: '#64748b' }} />
              </button>
            ))}
          </div>
        </section>
      )}

      <KpiBreakdownModal
        open={Boolean(openTile)}
        title={TILE_TITLES[openTile] || ''}
        subtitle={TILE_SUBTITLES[openTile] || ''}
        rows={openTile ? (breakdowns[openTile] || []) : []}
        canEdit={isSuperadmin && Boolean(onOverrideStats)}
        onClose={() => setOpenTile(null)}
        onApply={applyOverrides}
      />
    </div>
  );
}

function CheckCircleFallback() {
  return (
    <span className="dashboard-empty-icon" aria-hidden="true">
      <CheckCircle size={18} />
    </span>
  );
}
