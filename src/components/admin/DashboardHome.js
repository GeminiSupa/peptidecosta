'use client';

import React, { useMemo, useState } from 'react';
import {
  ClipboardList, ShoppingCart, Target, DollarSign, Package,
  AlertTriangle, Inbox, MessageSquare, ChevronRight, Star, CheckCircle,
} from 'lucide-react';
import { orderCountsAsSale, orderGrossUsd, orderNetRevenueUsd, orderRevenueBasis } from '@/lib/orderRevenue.mjs';
import { orderReportableAtMs } from '@/lib/agentDashboard.mjs';
import KpiBreakdownModal from './KpiBreakdownModal';
import { formatCrDate, formatCrInstant } from '@/lib/crTime.mjs';
import { isAwaitingPayment } from '@/lib/orderAwaitingPayment.mjs';
import { FALLBACK_EXCHANGE_RATE } from '@/lib/pricing';
import ExchangeRateSettings from './ExchangeRateSettings';
import { calculateExpandedSalesMetrics } from '@/lib/salesAnalytics.mjs';

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

// The date revenue should be recognized on: the first moment the order was
// marked Paid or complete. The shared helper falls back to created_at for
// legacy reportable orders with no status event logged.
function getRevenueDate(order) {
  return new Date(orderReportableAtMs(order));
}

function cartValue(cart) {
  if (!Array.isArray(cart.cart_data)) return 0;
  return cart.cart_data.reduce((sum, item) => {
    const p = parseFloat(String(item.price_usd || item.priceUsd || item.price || '0').replace(/[^0-9.]/g, '')) || 0;
    return sum + p * (item.qty || 1);
  }, 0);
}

// One window for the whole KPI row. Every start is a Costa Rica instant,
// because the business day belongs to Costa Rica and not to whoever is reading,
// and the week runs Monday to Sunday.
const KPI_RANGES = [
  { id: 'week', label: 'This week', start: (now) => startOfWeek(now) },
  { id: 'today', label: 'Today', start: (now) => startOfDay(now) },
  { id: '30d', label: 'Last 30 days', start: (now) => new Date(startOfDay(now).getTime() - 29 * 86400000) },
  { id: 'all', label: 'All time', start: () => null },
];

const KPI_RANGE_BY_ID = new Map(KPI_RANGES.map((range) => [range.id, range]));

/** Spelled out on hover, because "this week" alone does not say whose week. */
function kpiRangeTooltip(range, start, now) {
  if (!start) return 'Everything on record, with no date limit.';
  const day = { weekday: 'short', day: 'numeric', month: 'short' };
  return `${range.label}: ${formatCrDate(start, day)} to ${formatCrDate(now, day)}, Costa Rica time.`;
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
  exchangeRate = FALLBACK_EXCHANGE_RATE,
  manualExchangeRate = null,
  onExchangeRateChanged,
}) {
  // Which tile's breakdown is open: 'revenue' | 'pendingOrders'.
  const [openTile, setOpenTile] = useState(null);
  // One window over the whole row, opening on today because this screen is the
  // day's work. Early in the Costa Rica morning that is legitimately zero, and
  // the row says so on hover rather than looking broken; the week is one click
  // away in the dropdown.
  const [kpiRange, setKpiRange] = useState('today');

  const activeKpiRange = KPI_RANGE_BY_ID.get(kpiRange) || KPI_RANGES[0];
  const kpiRangeStart = useMemo(() => activeKpiRange.start(new Date()), [activeKpiRange]);
  const kpiRangeHint = kpiRangeTooltip(activeKpiRange, kpiRangeStart, new Date());

  const expandedMetrics = useMemo(
    () => calculateExpandedSalesMetrics(orders, products, exchangeRate),
    [orders, products, exchangeRate]
  );

  const stats = useMemo(() => {
    const now = new Date();
    // 'All time' has no start, so an absent start means everything qualifies.
    const inRange = (date) => !kpiRangeStart || date >= kpiRangeStart;

    // Every state that is waiting on money, not just the literal 'Pending'.
    const pendingOrders = orders.filter(
      (o) => isAwaitingPayment(o.status) && inRange(new Date(o.created_at))
    );

    // Net of refunds: a $100 order with $30 given back is $70 of revenue, not
    // $100. The same sum backs the commission report and the analytics chart, so
    // the three screens cannot disagree about what one order was worth.
    // The rate is passed because a WooCommerce order off the main site arrives
    // with its colón total only, and is converted here rather than counting $0.
    const revenue = orders
      .filter((o) => orderCountsAsSale(o) && inRange(getRevenueDate(o)))
      .reduce((sum, o) => sum + orderNetRevenueUsd(o, exchangeRate), 0);

    const recoverableCarts = abandonedCarts.filter(
      (c) => (c.status === 'active' || !c.status) && inRange(new Date(c.created_at))
    );
    const recoverableValue = recoverableCarts.reduce((s, c) => s + cartValue(c), 0);

    // The lists below are not KPI tiles and keep their own windows on purpose.
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
    // Deliberately outside the row's window: it is a monthly quota, so showing
    // a week of it against a limit of 50 would misread as five times the room.
    const monthStart = startOfMonth(now);
    // Count from the later of "start of month" and "integration go-live" so the
    // first month isn't inflated by completions that predate the Trustpilot BCC.
    const countFrom = monthStart > TRUSTPILOT_GO_LIVE ? monthStart : TRUSTPILOT_GO_LIVE;
    const trustpilotUsed = orders.filter((o) =>
      INVITE_TRIGGER_STATUSES.has(o.status) && o.customer_email && getRevenueDate(o) >= countFrom
    ).length;

    return {
      pendingOrders,
      revenue,
      recoverableCarts,
      recoverableValue,
      hotLeads,
      stockAlerts,
      recentOrders,
      trustpilotUsed,
    };
  }, [orders, abandonedCarts, leads, products, exchangeRate, kpiRangeStart]);

  // What actually made each tile. Deliberately wider than the tile itself: it
  // carries the orders inside the window that are NOT counting too, since the
  // point is to be able to force one in as well as hold one out.
  const breakdowns = useMemo(() => {
    const inRange = (date) => !kpiRangeStart || date >= kpiRangeStart;

    return {
      revenue: orders
        .filter((order) => inRange(getRevenueDate(order)))
        .map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          customer: order.customer_name,
          // Two different dates, so each is labelled: revenue lands on the day the
          // order first became Paid/complete, while the Orders list shows when it
          // came in. An order placed on the 22nd and paid today belongs in today.
          date: getRevenueDate(order),
          countedLabel: orderCountsAsSale(order) ? 'Counted' : 'Would count',
          placedAt: new Date(order.created_at),
          amountUsd: orderNetRevenueUsd(order, exchangeRate) || orderGrossUsd(order, exchangeRate),
          basis: orderRevenueBasis(order),
        }))
        // Counting orders first, then newest, so the money is at the top.
        .sort((a, b) => Number(b.basis.counts) - Number(a.basis.counts) || b.date - a.date),
      pendingOrders: orders
        .filter((order) => isAwaitingPayment(order.status) && inRange(new Date(order.created_at)))
        .map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          customer: order.customer_name,
          // This tile is about orders waiting, so its date is when they came in,
          // the same date the Orders list shows, and there is no second one.
          date: new Date(order.created_at),
          countedLabel: 'Placed',
          placedAt: null,
          amountUsd: orderGrossUsd(order, exchangeRate),
          basis: orderRevenueBasis(order),
        }))
        .sort((a, b) => b.date - a.date),
    };
  }, [orders, exchangeRate, kpiRangeStart]);

  // The window is named in the heading so a breakdown opened from a tile cannot
  // be read as the whole picture.
  const TILE_TITLES = {
    revenue: `Revenue, ${activeKpiRange.label.toLowerCase()}`,
    pendingOrders: `Pending Orders, ${activeKpiRange.label.toLowerCase()}`,
  };
  const TILE_SUBTITLES = {
    revenue: 'Orders dated by when they were first marked paid or complete, not when they were created.',
    pendingOrders: 'Orders still waiting to be paid, newest first, dated by when they came in. None of these count as revenue.',
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
      // The card counts strictly Pending, so the queue it opens is filtered to
      // match. Landing on the unfiltered list made the number look wrong.
      navOptions: { orderStatus: 'group:needs_payment' },
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
            {/* The day the tiles below are counting, which is Costa Rica's — an
                admin 11 hours ahead would otherwise be shown tomorrow's date
                over today's figures. */}
            {formatCrDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })} (Costa Rica)
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary dashboard-manual-order-btn" onClick={onCreateOrder}>
          + Manual Order
        </button>
      </div>

      {/* A hand-set rate never updates itself, so it is named here every day
          it stays on rather than being forgotten. */}
      {manualExchangeRate && (
        <div
          role="status"
          style={{
            margin: '0 0 16px', padding: '10px 14px', borderRadius: '10px',
            border: '1px solid rgba(251, 191, 36, 0.4)', background: 'rgba(251, 191, 36, 0.08)',
            color: '#fde68a', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap',
            gap: '8px', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span>
            <strong>Manual exchange rate in use:</strong> $1 = ₡{Number(manualExchangeRate.rate).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            {manualExchangeRate.setBy ? `, set by ${manualExchangeRate.setBy}` : ''}
            {manualExchangeRate.setAt ? ` on ${formatCrInstant(manualExchangeRate.setAt)}` : ''}.
            {' '}The automatic market rate is being ignored.
          </span>
          {isSuperadmin && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => document.getElementById('exchange-rate-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              Change
            </button>
          )}
        </div>
      )}

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
                onClick={() => onNavigate(item.tab, null, item.navOptions)}
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

      {/* One window over every tile below it. Hovering the dropdown spells the
          dates out, because "this week" alone does not say whose week. */}
      <div className="dashboard-kpi-rangebar">
        <span className="dashboard-kpi-rangebar-label">Showing</span>
        <select
          className="dashboard-kpi-range"
          aria-label="Date range for the figures below"
          title={kpiRangeHint}
          value={kpiRange}
          onChange={(event) => setKpiRange(event.target.value)}
        >
          {KPI_RANGES.map((range) => (
            <option key={range.id} value={range.id}>{range.label}</option>
          ))}
        </select>
      </div>

      <div className="dashboard-kpi-grid">
        <button
          type="button"
          className="dashboard-kpi-card is-clickable"
          onClick={() => setOpenTile('pendingOrders')}
          title={kpiRangeHint}
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
          onClick={() => setOpenTile('revenue')}
          title={kpiRangeHint}
        >
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">${stats.revenue.toLocaleString()}</div>
            <div className="dashboard-kpi-label">Revenue</div>
          </div>
        </button>
        <div className="dashboard-kpi-card" title={kpiRangeHint}>
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
            <ShoppingCart size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">${Math.round(stats.recoverableValue).toLocaleString()}</div>
            <div className="dashboard-kpi-label">Recoverable Carts</div>
          </div>
        </div>
      </div>

      {/* Expanded Sales & Inventory Analytics Grid */}
      <section className="dashboard-section" style={{ marginTop: '24px' }}>
        <div className="dashboard-section-heading-row">
          <h3 className="dashboard-section-title">Sales &amp; Inventory Overview</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <DollarSign size={20} />
            </div>
            <div>
              <div className="dashboard-kpi-value">${expandedMetrics.revenueTodayUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</div>
              <div className="dashboard-kpi-label">Revenue Today (₡{expandedMetrics.revenueTodayCrc.toLocaleString()})</div>
            </div>
          </div>

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <DollarSign size={20} />
            </div>
            <div>
              <div className="dashboard-kpi-value">${expandedMetrics.revenueMonthUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</div>
              <div className="dashboard-kpi-label">Revenue This Month ({expandedMetrics.ordersMonthCount} orders)</div>
            </div>
          </div>

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
              <Target size={20} />
            </div>
            <div>
              <div className="dashboard-kpi-value">{expandedMetrics.repeatCustomerPct}%</div>
              <div className="dashboard-kpi-label">Repeat Customer Rate ({expandedMetrics.repeatCustomers}/{expandedMetrics.totalCustomers})</div>
            </div>
          </div>

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
              <Package size={20} />
            </div>
            <div>
              <div className="dashboard-kpi-value">${expandedMetrics.aovUsd.toFixed(2)}</div>
              <div className="dashboard-kpi-label">Avg Order Value (AOV)</div>
            </div>
          </div>

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-icon" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>
              <Star size={20} />
            </div>
            <div>
              <div className="dashboard-kpi-value">${expandedMetrics.ltvUsd.toFixed(2)}</div>
              <div className="dashboard-kpi-label">Customer Lifetime Value (LTV)</div>
            </div>
          </div>

          <div className="dashboard-kpi-card">
            <div className="dashboard-kpi-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
              <Package size={20} />
            </div>
            <div>
              <div className="dashboard-kpi-value">${expandedMetrics.inventoryCostValueUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</div>
              <div className="dashboard-kpi-label">Inventory Cost (Retail: ${expandedMetrics.inventoryRetailValueUsd.toLocaleString()})</div>
            </div>
          </div>
        </div>

        {expandedMetrics.bestSellers.length > 0 && (
          <div style={{ background: 'rgba(15, 23, 42, 0.5)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 700 }}>🏆 Top Selling Products</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {expandedMetrics.bestSellers.slice(0, 4).map((item, idx) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : '#cd7f32' }}>#{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.unitsSold} units sold · ${item.revenueUsd.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

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

      {/* One authority for every USD -> CRC conversion. The editor belongs on
          Home where the owner sees shop health, not inside product editing.
          It is mounted only for superadmins; the route repeats that check. */}
      {isSuperadmin && (
        <ExchangeRateSettings onChanged={onExchangeRateChanged} />
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
