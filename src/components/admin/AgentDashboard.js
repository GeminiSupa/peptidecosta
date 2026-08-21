'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Briefcase, TrendingUp, DollarSign, Target, ClipboardList,
  ChevronRight, ChevronLeft, Wallet, Camera, Upload, Loader2,
  RefreshCw, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { getOrderSalesAmounts } from '@/lib/agentOrders';
import {
  AGENT_ANALYTICS_MAX_WEEK_OFFSET,
  formatAgentDate,
  preferredAgentMoney,
} from '@/lib/agentDashboard.mjs';

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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState(currentUserProfile?.avatar_url || '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarNotice, setAvatarNotice] = useState('');
  const statsRef = useRef(stats);
  const analyticsRequestRef = useRef(0);
  const analyticsAbortRef = useRef(null);
  const avatarInputRef = useRef(null);

  useEffect(() => { statsRef.current = stats; }, [stats]);

  useEffect(() => {
    setAvatarUrl(currentUserProfile?.avatar_url || '');
  }, [currentUserProfile?.avatar_url]);

  const fetchAnalytics = useCallback(async () => {
    analyticsAbortRef.current?.abort();
    const controller = new AbortController();
    analyticsAbortRef.current = controller;
    const requestId = analyticsRequestRef.current + 1;
    analyticsRequestRef.current = requestId;
    if (statsRef.current) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await adminFetch(`/api/agent/analytics?weekOffset=${weekOffset}`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to load your dashboard');
      if (requestId !== analyticsRequestRef.current) return;
      setStats({
        ...data.stats,
        weekOrders: Array.isArray(data.stats?.weekOrders) ? data.stats.weekOrders : [],
        weekPendingOrders: Array.isArray(data.stats?.weekPendingOrders) ? data.stats.weekPendingOrders : [],
        recentPayouts: Array.isArray(data.stats?.recentPayouts) ? data.stats.recentPayouts : [],
      });
    } catch (err) {
      if (err.name === 'AbortError' || requestId !== analyticsRequestRef.current) return;
      console.error(err);
      setError(err.message || 'Could not load your earnings data');
    } finally {
      if (requestId === analyticsRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
        if (analyticsAbortRef.current === controller) analyticsAbortRef.current = null;
      }
    }
  }, [weekOffset]);

  useEffect(() => {
    fetchAnalytics();
    return () => analyticsAbortRef.current?.abort();
  }, [fetchAnalytics]);

  if (loading) {
    return <div className="agent-dashboard-state" role="status"><Loader2 size={22} className="mkt-spin" /> Loading your dashboard…</div>;
  }
  if (error && !stats) {
    return (
      <div className="agent-dashboard-state error" role="alert">
        <AlertTriangle size={22} />
        <span>{error}</span>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={fetchAnalytics}>Try again</button>
      </div>
    );
  }
  if (!stats) return null;

  const name = currentUserProfile?.name || currentUserEmail?.split('@')[0] || 'Agent';
  const isSubUser = variant === 'sub_user';
  const isToday = variant === 'today';
  const salaryCurr = stats.salaryCurrency || 'USD';
  const viewingPastWeek = weekOffset > 0;
  const weekRange = stats.weekStartDate
    ? `${formatAgentDate(stats.weekStartDate)} – ${formatAgentDate(stats.weekEndDate)}`
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
  const weekOverrideUsd = wp ? 0 : Number(stats.currentWeekOverrideUSD || 0);
  const weekOverrideCrc = wp ? 0 : Number(stats.currentWeekOverrideCRC || 0);
  const estWeekPayUsd = wp
    ? wp.totalPayoutUsd
    : Number(stats.currentWeekCommissionUSD || 0) + weekOverrideUsd + (salaryCurr === 'USD' ? Number(stats.weeklySalary || 0) : 0);
  const estWeekPayCrc = wp
    ? wp.totalPayoutCrc
    : Number(stats.currentWeekCommissionCRC || 0) + weekOverrideCrc + (salaryCurr === 'CRC' ? Number(stats.weeklySalary || 0) : 0);
  const payLabelWord = wp ? 'Pay' : 'Est. pay';

  const weekPendingList = stats.weekPendingOrders || [];
  const preferredMoney = (usd, crc, currency = salaryCurr) => {
    const preferred = preferredAgentMoney(usd, crc, currency);
    return formatMoney(preferred.value, preferred.currency);
  };
  const moneyOrEmpty = (usd, crc) => preferredMoney(usd, crc);

  const renderOrderRow = (o) => {
    const { usd, crc } = getOrderSalesAmounts(o);
    const display = o.currency === 'CRC' || (!usd && crc) ? formatMoney(crc, 'CRC') : formatMoney(usd, 'USD');
    return (
      <button key={o.id} type="button" className="dashboard-mini-row agent-dashboard-order-row" onClick={() => onOpenOrder?.(o)}>
        <div className="agent-dashboard-row-main">
          <div className="dashboard-mini-title">#{o.order_number || String(o.id || '').slice(0, 8)}</div>
          <div className="dashboard-mini-sub">{o.customer_name || 'Customer'}</div>
          {o.commission_source_label && (
            <div className="dashboard-mini-sub" style={{ color: o.agent_commission_source === 'agent_referral' ? '#5eead4' : undefined }}>
              {o.commission_source_label} · {Number(o.commission_rate_applied || 0)}% commission
            </div>
          )}
        </div>
        <div className="agent-dashboard-row-value">
          <div className="dashboard-mini-val">{display}</div>
          <div className="dashboard-mini-sub">{o.status || 'Pending'}</div>
        </div>
      </button>
    );
  };

  const handleAvatarUpload = async (file) => {
    if (!file) return;
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.type)) {
      setAvatarError('Choose a JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setAvatarError('Profile image must be 4MB or smaller.');
      return;
    }
    setAvatarUploading(true);
    setAvatarError('');
    setAvatarNotice('');
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
      setAvatarNotice('Profile photo updated.');
    } catch (err) {
      setAvatarError(err.message || 'Could not upload profile photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className={`dashboard-home agent-dashboard${isToday ? ' today-dashboard' : ''}`}>
      <div className="dashboard-home-header">
        <div className="agent-dashboard-heading">
          <button
            type="button"
            aria-label="Change profile photo"
            title="Upload profile photo"
            disabled={avatarUploading}
            onClick={() => avatarInputRef.current?.click()}
            style={{
              width: '58px',
              height: '58px',
              padding: 0,
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
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={avatarUploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) handleAvatarUpload(file);
            }}
            hidden
          />
          <div style={{ minWidth: 0 }}>
            <h2 className="dashboard-home-title">{title}</h2>
            <p className="dashboard-home-subtitle">
              Welcome back, {name} · {viewingPastWeek ? 'Viewing week of' : 'Week of'} {weekRange}
            </p>
          </div>
        </div>
        <div className="agent-dashboard-controls" aria-label="Select reporting week">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setWeekOffset((w) => Math.min(w + 1, AGENT_ANALYTICS_MAX_WEEK_OFFSET))}
            disabled={refreshing || weekOffset >= AGENT_ANALYTICS_MAX_WEEK_OFFSET}
            title="Previous week"
          >
            <ChevronLeft size={16} /> Prev week
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setWeekOffset((w) => Math.max(w - 1, 0))}
            disabled={refreshing || !viewingPastWeek}
            title="Next week"
          >
            Next week <ChevronRight size={16} />
          </button>
          {viewingPastWeek && (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => setWeekOffset(0)}
              disabled={refreshing}
            >
              This week
            </button>
          )}
          <button type="button" className="admin-btn admin-btn-secondary" onClick={fetchAnalytics} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'mkt-spin' : undefined} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {avatarError && (
        <div className="agent-dashboard-alert error" role="alert">
          <AlertTriangle size={17} /> <span>{avatarError}</span>
        </div>
      )}
      {avatarNotice && (
        <div className="agent-dashboard-alert success" role="status">
          <CheckCircle2 size={17} /> <span>{avatarNotice}</span>
        </div>
      )}
      {error && (
        <div className="agent-dashboard-alert error" role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={fetchAnalytics}>Try again</button>
        </div>
      )}
      {stats.weekPayoutError && (
        <div className="agent-dashboard-alert warning" role="alert">
          <AlertTriangle size={17} />
          <span>{stats.weekPayoutError} The amount below is a live estimate.</span>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={fetchAnalytics}>Retry</button>
        </div>
      )}
      {refreshing && (
        <div className="agent-dashboard-refreshing" role="status">
          <Loader2 size={15} className="mkt-spin" /> Updating dashboard…
        </div>
      )}

      <div className="dashboard-kpi-grid">
        <div className="dashboard-kpi-card">
          <div className="dashboard-kpi-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="dashboard-kpi-value" style={{ fontSize: '1.1rem' }}>
              {preferredMoney(stats.currentMonthSalesUSD, stats.currentMonthSalesCRC)}
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
              {preferredMoney(stats.todaySalesUSD, stats.todaySalesCRC)}
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
              {preferredMoney(weekSalesUsd, weekSalesCrc)}
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
              {preferredMoney(estWeekPayUsd, estWeekPayCrc)}
            </div>
            <div className="dashboard-kpi-label">{payLabelWord} {weekWord}</div>
            <div className="dashboard-mini-sub">
              {wp
                ? `From payout report · ${wp.status === 'Approved' ? 'Paid' : 'Pending'}`
                : isSubUser
                  ? `${stats.commissionRate}% of your orders`
                  : `${stats.currentWeekCommissionRateLabel || `${stats.commissionRate}%`} commission${stats.currentWeekOverrideCount > 0 ? ' + team override' : ''} + salary`}
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
            {!isSubUser && (
              <div className="dashboard-mini-row" style={{ cursor: 'default' }}>
                <TrendingUp size={16} style={{ color: '#2dd4bf' }} />
                <div style={{ flex: 1 }}>
                  <div className="dashboard-mini-title">Marketing referral rate</div>
                  <div className="dashboard-mini-sub">One combined payout, not added to standard commission</div>
                </div>
                <div className="dashboard-mini-val">20%</div>
              </div>
            )}
            <div className="dashboard-mini-row" style={{ cursor: 'default' }}>
              <DollarSign size={16} style={{ color: '#4ade80' }} />
              <div style={{ flex: 1 }}>
                <div className="dashboard-mini-title">Commission earned · {weekWord}</div>
                <div className="dashboard-mini-sub">On your assigned orders</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="dashboard-mini-val">{preferredMoney(weekCommUsd, weekCommCrc)}</div>
              </div>
            </div>
            {!isSubUser && !wp && stats.currentWeekOverrideCount > 0 && (
              <div className="dashboard-mini-row" style={{ cursor: 'default' }}>
                <Target size={16} style={{ color: '#fbbf24' }} />
                <div style={{ flex: 1 }}>
                  <div className="dashboard-mini-title">Team override earned · {weekWord}</div>
                  <div className="dashboard-mini-sub">
                    {stats.currentWeekOverrideRate}% on {stats.currentWeekOverrideCount} sub-user order{stats.currentWeekOverrideCount === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="dashboard-mini-val">{preferredMoney(weekOverrideUsd, weekOverrideCrc)}</div>
              </div>
            )}
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
        {stats.payoutHistoryError && (
          <div className="agent-dashboard-alert warning" role="alert">
            <AlertTriangle size={17} />
            <span>{stats.payoutHistoryError}</span>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={fetchAnalytics}>Retry</button>
          </div>
        )}
        {!stats.payoutHistoryError && stats.recentPayouts.length === 0 ? (
          <p className="dashboard-empty">No payout records yet.</p>
        ) : !stats.payoutHistoryError ? (
          <div className="dashboard-mini-list">
            {stats.recentPayouts.map((p) => {
              const period = `${formatAgentDate(p.start_date)} – ${formatAgentDate(p.end_date)}`;
              const total = preferredMoney(p.total_payout_usd, p.total_payout_crc, p.salary_currency || salaryCurr);
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
        ) : null}
      </section>

      <p className="dashboard-mini-sub" style={{ marginTop: '8px' }}>
        {isSubUser
          ? 'Only orders that came through your own link count toward your pay. Orders count once they are marked paid.'
          : 'Only orders assigned to you as sales agent count toward your pay. Store-wide totals are not shown here.'}
      </p>
    </div>
  );
}
