'use client';

import React, { useMemo } from 'react';
import {
  ClipboardList, ShoppingCart, Target, DollarSign, Package,
  AlertTriangle, Inbox, MessageSquare, TrendingUp, ChevronRight,
} from 'lucide-react';

const FALLBACK_RATE = 454.48;

function isOutOfStock(status) {
  const s = (status || '').toLowerCase();
  return s.includes('out of stock') || s.includes('agotado');
}

function isComingSoon(status) {
  const s = (status || '').toLowerCase();
  return s.includes('coming soon') || s.includes('próximamente');
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
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

    const paidStatuses = new Set(['Paid', 'Completed', 'Order Complete', 'Processing']);
    const pendingOrders = orders.filter((o) => (o.status || 'Pending') === 'Pending');

    const revenueInRange = (start) =>
      orders
        .filter((o) => paidStatuses.has(o.status) && new Date(o.created_at) >= start)
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

    return {
      pendingOrders,
      revenueToday,
      revenueWeek,
      recoverableCarts,
      recoverableValue,
      hotLeads,
      stockAlerts,
      recentOrders,
    };
  }, [orders, abandonedCarts, leads, products]);

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
      </div>

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
                const _oSubtotal = _oItems.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
                const _oVials = _oItems.reduce((s, i) => s + (Number(i.qty) || 1), 0);
                let _oDisc = 0;
                if (_oVials >= 10) _oDisc = 20;
                else if (_oVials >= 5) _oDisc = 15;
                const _oDiscSubtotal = _oDisc > 0 ? _oSubtotal * (1 - _oDisc / 100) : _oSubtotal;
                const _oShip = o.currency === 'USD' ? (Number(o.shipping_cost_usd) || 0) : (Number(o.shipping_cost_crc) || 0);
                const _oComputed = _oDiscSubtotal + _oShip;
                const _oStored = o.currency === 'USD' ? Number(o.total_usd || 0) : Number(o.total_crc || 0);
                const _oDisplay = (_oSubtotal > 0 && Math.abs(_oComputed - _oStored) > 1) ? _oComputed : _oStored;
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
