'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase, TrendingUp, DollarSign, Target, ClipboardList,
  ChevronRight, ChevronLeft, Wallet, Camera, Upload,
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { getOrderSalesAmounts } from '@/lib/agentOrders';

function formatDay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMoney(val, curr) {
  const num = Number(val || 0);
  if (curr === 'USD') {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₡${Math.round(num).toLocaleString('en-US')}`;
}

export default function AgentDashboard({
  currentUserProfile,
  currentUserEmail,
  title = 'My Pay',
  onOpenOrder,
  onNavigate,
  // 'sub_user' trims the screen to what that tier actually has: commission on
  // their own referred orders, no salary, no store-wide anything.
  variant = 'staff',
}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState(currentUserProfile?.avatar_url || '');
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    setAvatarUrl(currentUserProfile?.avatar_url || '');
  }, [currentUserProfile?.avatar_url]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminFetch(`/api/agent/analytics?weekOffset=${weekOffset}`);
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      } else {
        setError(data.error || 'Failed to load your dashboard');
      }
    } catch (err) {
      console.error(err);
      setError('Could not load your earnings data');
    }
    setLoading(false);
  }, [weekOffset]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return <p className="dashboard-empty" style={{ padding: '32px 0' }}>Loading your dashboard…</p>;
  }
  if (error) {
    return <p className="dashboard-empty" style={{ padding: '32px 0', color: '#f87171' }}>{error}</p>;
  }
  if (!stats) return null;

  const name = currentUserProfile?.name || currentUserEmail?.split('@')[0] || 'Agent';
  const isSubUser = variant === 'sub_user';
  const salaryCurr = stats.salaryCurrency || 'USD';
  const viewingPastWeek = (stats.weekOffset || 0) > 0;
  const weekRange = stats.weekStartDate
    ? `${formatDay(stats.weekStartDate)} – ${formatDay(stats.weekEndDate)}`
    : '';
  const weekWord = viewingPastWeek
    ? `week of ${weekRange}`
    : weekRange
      ? `this week (${weekRange})`
      : 'this week';
  const weekOrdersList = stats.weekOrders || [];

  // When the owner has already scanned a payout for the viewed week, show that
  // record's exact figures so the agent's screen matches the payout report to
  // the cent (see weekPayout in the analytics API). Otherwise fall back to the
  // live estimate for the current, not-yet-scanned week.
  const wp = stats.weekPayout;
  const weekSalesUsd = wp ? wp.usdSales : stats.currentWeekSalesUSD;
  const weekSalesCrc = wp ? wp.crcSales : stats.currentWeekSalesCRC;
  const weekCommUsd = wp ? wp.usdCommission : stats.currentWeekCommissionUSD;
  const weekCommCrc = wp ? wp.crcCommission : stats.currentWeekCommissionCRC;
  const estWeekPayUsd = wp
    ? wp.totalPayoutUsd
    : stats.currentWeekCommissionUSD + (salaryCurr === 'USD' ? Number(stats.weeklySalary || 0) : 0);
  const estWeekPayCrc = wp
    ? wp.totalPayoutCrc
    : stats.currentWeekCommissionCRC + (salaryCurr === 'CRC' ? Number(stats.weeklySalary || 0) : 0);
  const payLabelWord = wp ? 'Pay' : 'Est. pay';

  const weekPendingList = stats.weekPendingOrders || [];
  const moneyOrEmpty = (usd, crc) => (usd > 0 ? formatMoney(usd, 'USD') : crc > 0 ? formatMoney(crc, 'CRC') : formatMoney(0, salaryCurr));

  const renderOrderRow = (o) => {
    const { usd, crc } = getOrderSalesAmounts(o);
    const display = o.currency === 'CRC' || (!usd && crc) ? `₡${crc.toLocaleString()}` : `$${usd}`;
    return (
      <button key={o.id} type="button" className="dashboard-mini-row" onClick={() => onOpenOrder?.(o)}>
        <div>
          <div className="dashboard-mini-title">#{o.order_number || o.id.slice(0, 8)}</div>
          <div className="dashboard-mini-sub">{o.customer_name || 'Customer'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="dashboard-mini-val">{display}</div>
          <div className="dashboard-mini-sub">{o.status || 'Pending'}</div>
        </div>
      </button>
    );
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    setAvatarUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await adminFetch('/api/admin/users/avatar', {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Avatar upload failed');
      setAvatarUrl(data.avatarUrl);
    } catch (err) {
      setError(err.message || 'Could not upload profile photo');
    }
    setAvatarUploading(false);
  };

  return (
    <div className="dashboard-home agent-dashboard">
      <div className="dashboard-home-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <label
            title="Upload profile photo"
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: avatarUploading ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff',
              fontWeight: 900,
              position: 'relative',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : name.charAt(0).toUpperCase()}
            {avatarUploading && (
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.55)' }}>
                <Upload size={17} />
              </span>
            )}
            <span style={{ position: 'absolute', right: '-2px', bottom: '-2px', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#38bdf8', color: '#082f49', border: '2px solid #0f172a', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}>
              {avatarUploading ? <Upload size={13} /> : <Camera size={13} />}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={avatarUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) handleAvatarUpload(file);
              }}
              style={{ display: 'none' }}
            />
          </label>
          <div style={{ minWidth: 0 }}>
            <h2 className="dashboard-home-title">{title}</h2>
            <p className="dashboard-home-subtitle">
              Welcome back, {name} · {viewingPastWeek ? 'Viewing week of' : 'Week of'} {weekRange}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setWeekOffset((w) => w + 1)}
            title="Previous week"
          >
            <ChevronLeft size={16} /> Prev week
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setWeekOffset((w) => Math.max(w - 1, 0))}
            disabled={!viewingPastWeek}
            style={!viewingPastWeek ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            title="Next week"
          >
            Next week <ChevronRight size={16} />
          </button>
          {viewingPastWeek && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => setWeekOffset(0)}
            >
              This week
            </button>
          )}
          <button type="button" className="admin-btn admin-btn-secondary" onClick={fetchAnalytics}>
            Refresh
          </button>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value" style={{ fontSize: '1.1rem' }}>
              {stats.currentMonthSalesUSD > 0
                ? formatMoney(stats.currentMonthSalesUSD, 'USD')
                : formatMoney(stats.currentMonthSalesCRC, 'CRC')}
            </div>
            <div className="dashboard-kpi-label">My sales this month</div>
            <div className="dashboard-mini-sub">{stats.currentMonthOrdersCount} completed</div>
          </div>
        </div>
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value" style={{ fontSize: '1.1rem' }}>
              {stats.todaySalesUSD > 0 ? formatMoney(stats.todaySalesUSD, 'USD') : formatMoney(stats.todaySalesCRC, 'CRC')}
            </div>
            <div className="dashboard-kpi-label">My sales today</div>
            <div className="dashboard-mini-sub">{stats.todayOrdersCount} order{stats.todayOrdersCount !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value" style={{ fontSize: '1.1rem' }}>
              {weekSalesUsd > 0
                ? formatMoney(weekSalesUsd, 'USD')
                : formatMoney(weekSalesCrc, 'CRC')}
            </div>
            <div className="dashboard-kpi-label">My sales {weekWord}</div>
            <div className="dashboard-mini-sub">{stats.currentWeekOrdersCount} completed</div>
          </div>
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
            <Wallet size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value" style={{ fontSize: '1.1rem' }}>
              {estWeekPayUsd > 0 ? formatMoney(estWeekPayUsd, 'USD') : formatMoney(estWeekPayCrc, 'CRC')}
            </div>
            <div className="dashboard-kpi-label">{payLabelWord} {weekWord}</div>
            <div className="dashboard-mini-sub">
              {wp
                ? `From payout report · ${wp.status === 'Approved' ? 'Paid' : 'Pending'}`
                : isSubUser
                  ? `${stats.commissionRate}% of your orders`
                  : `${stats.commissionRate}% commission + salary`}
            </div>
          </div>
        </div>

        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <ClipboardList size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value">{stats.pendingOrdersCount}</div>
            <div className="dashboard-kpi-label">My pending orders</div>
          </div>
        </div>
      </div>

      <div className="dashboard-two-col">
        <section className="dashboard-section">
          <h3 className="dashboard-section-title">{isSubUser ? 'How you get paid' : 'Pay structure'}</h3>
          <div className="dashboard-mini-list" style={{ maxHeight: "400px", overflowY: "auto", paddingRight: "8px" }}>
            {/* A sub-user is commission-only, so a salary row of $0.00 would only
                raise a question that has no answer. */}
            {!isSubUser && (
              <div className="dashboard-mini-row" style={{ cursor: 'default' }}>
                <Briefcase size={16} style={{ color: '#38bdf8' }} />
                <div style={{ flex: 1 }}>
                  <div className="dashboard-mini-title">Base weekly salary</div>
                  <div className="dashboard-mini-sub">Guaranteed Mon–Sun</div>
                </div>
                <div className="dashboard-mini-val">{formatMoney(stats.weeklySalary, salaryCurr)}</div>
              </div>
            )}
            <div className="dashboard-mini-row" style={{ cursor: 'default' }}>
              <Target size={16} style={{ color: '#c084fc' }} />
              <div style={{ flex: 1 }}>
                <div className="dashboard-mini-title">Commission rate</div>
                {stats.commissionStructure && (
                  <div className="dashboard-mini-sub">{stats.commissionStructure}</div>
                )}
              </div>
              <div className="dashboard-mini-val">{stats.commissionRate}%</div>
            </div>
            <div className="dashboard-mini-row" style={{ cursor: 'default' }}>
              <DollarSign size={16} style={{ color: '#4ade80' }} />
              <div style={{ flex: 1 }}>
                <div className="dashboard-mini-title">Commission earned · {weekWord}</div>
                <div className="dashboard-mini-sub">On your assigned orders</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {weekCommUsd > 0 && (
                  <div className="dashboard-mini-val">{formatMoney(weekCommUsd, 'USD')}</div>
                )}
                {weekCommCrc > 0 && (
                  <div className="dashboard-mini-val">{formatMoney(weekCommCrc, 'CRC')}</div>
                )}
                {weekCommUsd === 0 && weekCommCrc === 0 && (
                  <div className="dashboard-mini-sub">$0</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <h3 className="dashboard-section-title">My orders · {weekRange}</h3>

          {/* Paid — these count toward pay */}
          <div className="dashboard-mini-row" style={{ cursor: 'default', color: '#4ade80', fontWeight: 700 }}>
            <span style={{ flex: 1 }}>✓ Paid · counts toward pay ({weekOrdersList.length})</span>
            <span>{moneyOrEmpty(weekSalesUsd, weekSalesCrc)}</span>
          </div>
          {weekOrdersList.length === 0 ? (
            <p className="dashboard-empty">No paid orders in this week yet.</p>
          ) : (
            <div className="dashboard-mini-list">{weekOrdersList.map(renderOrderRow)}</div>
          )}

          {/* Pending — not counted toward pay yet */}
          {weekPendingList.length > 0 && (
            <>
              <div className="dashboard-mini-row" style={{ cursor: 'default', color: '#fbbf24', fontWeight: 700, marginTop: '14px' }}>
                <span style={{ flex: 1 }}>⏳ Pending · not counted yet ({weekPendingList.length})</span>
                <span>{moneyOrEmpty(stats.weekPendingSalesUSD, stats.weekPendingSalesCRC)}</span>
              </div>
              <div className="dashboard-mini-list">{weekPendingList.map(renderOrderRow)}</div>
              <p className="dashboard-mini-sub" style={{ marginTop: '6px', fontStyle: 'italic' }}>
                These don’t count toward pay until they’re marked paid/complete.
              </p>
            </>
          )}
          {onNavigate && stats.pendingOrdersCount > 0 && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              style={{ marginTop: '10px', width: '100%' }}
              onClick={() => onNavigate('orders')}
            >
              View my pending orders
            </button>
          )}
        </section>
      </div>

      <section className="dashboard-section">
        <h3 className="dashboard-section-title">Payout history</h3>
        {stats.recentPayouts.length === 0 ? (
          <p className="dashboard-empty">No payout records yet.</p>
        ) : (
          <div className="dashboard-mini-list">
            {stats.recentPayouts.map((p) => {
              const period = `${new Date(p.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(p.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
              const total =
                p.total_payout_usd > 0
                  ? formatMoney(p.total_payout_usd, 'USD')
                  : p.total_payout_crc > 0
                    ? formatMoney(p.total_payout_crc, 'CRC')
                    : '$0.00';
              return (
                <div key={p.id} className="dashboard-mini-row" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1 }}>
                    <div className="dashboard-mini-title">{period}</div>
                    <div className="dashboard-mini-sub">
                      Sales {formatMoney(p.usd_sales, 'USD')}
                      {p.crc_sales > 0 ? ` · ${formatMoney(p.crc_sales, 'CRC')}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="dashboard-mini-val">{total}</div>
                    <div className="dashboard-mini-sub">{p.status === 'Approved' ? 'Paid' : 'Pending'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="dashboard-mini-sub" style={{ marginTop: '8px' }}>
        {isSubUser
          ? 'Only orders that came through your own link count toward your pay. Orders count once they are marked paid.'
          : 'Only orders assigned to you as sales agent count toward your pay. Store-wide totals are not shown here.'}
      </p>
    </div>
  );
}
