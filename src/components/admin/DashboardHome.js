'use client';

import React, { useMemo } from 'react';
import {
  ClipboardList, ShoppingCart, Target, DollarSign, Package,
  AlertTriangle, Inbox, MessageSquare, TrendingUp, ChevronRight, Star,
} from 'lucide-react';
import { COMMISSION_ELIGIBLE_ORDER_STATUSES } from '@/lib/agentOrders';

const FALLBACK_RATE = 454.48;

// Statuses that count as recognized revenue. Mirrors the commission logic so the
// Today dashboard and the commission report always agree on what "earned" means.
const REVENUE_STATUSES = new Set(COMMISSION_ELIGIBLE_ORDER_STATUSES);

// Matches the status_change log messages written when an order is marked
// paid/complete (e.g. "Status changed to Order Complete").
const COMPLETION_MESSAGE_RE = /paid|complet/i;

// Trustpilot's FREE plan sends 50 verified review invitations per month.
// If the account is upgraded, change this (Starter = 100, Plus = 300).
const TRUSTPILOT_MONTHLY_LIMIT = 50;
// The order-complete email (which BCCs Trustpilot to trigger an invitation) only
// fires for these statuses, so we count these to estimate invitations used.
const INVITE_TRIGGER_STATUSES = new Set(['Completed', 'Order Complete']);

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
}) {
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    const pendingOrders = orders.filter((o) => (o.status || 'Pending') === 'Pending');

    const revenueInRange = (start) =>
      orders
        .filter((o) => REVENUE_STATUSES.has(o.status) && getRevenueDate(o) >= start)
        .reduce((sum, o) => sum + Number(o.total_usd || 0), 0);

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
    const trustpilotUsed = orders.filter((o) =>
      INVITE_TRIGGER_STATUSES.has(o.status) && o.customer_email && getRevenueDate(o) >= monthStart
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
  }, [orders, abandonedCarts, leads, products]);

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
      tab: 'orders',
    },
    stats.recoverableCarts.length > 0 && {
      key: 'carts',
      icon: ShoppingCart,
      color: '#38bdf8',
      title: `${stats.recoverableCarts.length} abandoned cart${stats.recoverableCarts.length > 1 ? 's' : ''}`,
      sub: `~$${Math.round(stats.recoverableValue)} recoverable`,
      tab: 'carts',
    },
    inquiryCount > 0 && {
      key: 'inquiries',
      icon: Inbox,
      color: '#c084fc',
      title: `${inquiryCount} new inquir${inquiryCount > 1 ? 'ies' : 'y'}`,
      sub: 'Contact form messages',
      tab: 'inquiries',
    },
    stats.hotLeads.length > 0 && {
      key: 'leads',
      icon: Target,
      color: '#4ade80',
      title: `${stats.hotLeads.length} hot lead${stats.hotLeads.length > 1 ? 's' : ''}`,
      sub: 'Not yet contacted',
      tab: 'leads',
    },
    stats.stockAlerts.length > 0 && {
      key: 'stock',
      icon: AlertTriangle,
      color: '#f87171',
      title: `${stats.stockAlerts.length} stock alert${stats.stockAlerts.length > 1 ? 's' : ''}`,
      sub: 'Out of stock or coming soon',
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
        <button type="button" className="admin-btn admin-btn-primary" onClick={onCreateOrder}>
          + Manual Order
        </button>
      </div>

      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <ClipboardList size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">{stats.pendingOrders.length}</div>
            <div className="dashboard-kpi-label">Pending Orders</div>
          </div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">${stats.revenueToday.toLocaleString()}</div>
            <div className="dashboard-kpi-label">Revenue Today</div>
          </div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">${stats.revenueWeek.toLocaleString()}</div>
            <div className="dashboard-kpi-label">Revenue This Week</div>
          </div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
            <ShoppingCart size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">${Math.round(stats.recoverableValue).toLocaleString()}</div>
            <div className="dashboard-kpi-label">Recoverable Carts</div>
          </div>
        </div>
        {/* Trustpilot review-invitation quota (Free plan = 50/month). Estimate only —
            the Free plan has no API, so we approximate from completed orders. */}
        <div className="dashboard-kpi-card" title={`Estimate (~${trustpilotRemaining} left): ${stats.trustpilotUsed} of ${TRUSTPILOT_MONTHLY_LIMIT} invitations approx. sent this month. Free plan has no Trustpilot API, so this is not the exact count.`}>
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(52, 211, 153, 0.15)', color: trustpilotColor }}>
            <Star size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value" style={{ color: trustpilotColor }}>≈{trustpilotRemaining}</div>
            <div className="dashboard-kpi-label">Trustpilot invites left (est.) · {stats.trustpilotUsed}/{TRUSTPILOT_MONTHLY_LIMIT}</div>
          </div>
        </div>
      </div>

      {/* Honesty note: the Trustpilot number is an estimate, not the real count. */}
      <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '10px 2px 0', lineHeight: 1.5 }}>
        ★ <strong style={{ color: '#cbd5e1' }}>Trustpilot invites left</strong> is an <strong style={{ color: '#cbd5e1' }}>estimate</strong>, not the exact count.
        The Free plan has no Trustpilot API, so we approximate it from completed orders this month. For the real number, check your Trustpilot dashboard.
      </p>

      {attention.length > 0 && (
        <section className="dashboard-section">
          <h3 className="dashboard-section-title">Needs Attention</h3>
          <div className="dashboard-attention-list">
            {attention.map((item) => (
              <button
                key={item.key}
                type="button"
                className="dashboard-attention-item"
                onClick={() => onNavigate(item.tab)}
              >
                <item.icon size={18} style={{ color: item.color, flexShrink: 0 }} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="dashboard-attention-title">{item.title}</div>
                  <div className="dashboard-attention-sub">{item.sub}</div>
                </div>
                <ChevronRight size={16} style={{ color: '#64748b' }} />
              </button>
            ))}
          </div>
        </section>
      )}

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
    </div>
  );
}
