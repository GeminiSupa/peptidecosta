"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RotateCcw, AlertTriangle, Clock, CheckCircle2, Search,
  Calendar, Package, MessageCircle, User, Edit3, Save, RefreshCw,
  Sparkles, Filter, ArrowDownUp, PlusCircle
} from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';
import { formatCrDate } from '@/lib/crTime.mjs';
import {
  calculateCustomerReorderStats,
  buildReorderFollowupScript,
} from '@/lib/reorderTracking.mjs';

export default function ReorderTrackingPanel({
  orders = [],
  onOpenCustomerProfile,
  onWhatsAppClick,
  onCreateOrder,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statsData, setStatsData] = useState([]);
  const [customOverrides, setCustomOverrides] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [editDaysInput, setEditDaysInput] = useState('');
  const [savingKey, setSavingKey] = useState(null);

  // Filters & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'overdue', 'due_soon', 'on_track', 'vip_commercial'
  const [sortField, setSortField] = useState('overdue'); // 'overdue', 'date', 'interval', 'qty'
  const [sortDir, setSortDir] = useState('desc');

  const fetchReorderData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/reorder-tracking');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load reorder tracking data');
      setStatsData(data.customers || []);
    } catch (err) {
      console.error('Reorder tracking API error:', err);
      // Fallback to local computation from props if API fails
      const fallback = calculateCustomerReorderStats(orders, customOverrides);
      setStatsData(fallback);
      setError('Live API sync unavailable. Computed from loaded order ledger.');
    } finally {
      setLoading(false);
    }
  }, [orders, customOverrides]);

  useEffect(() => {
    fetchReorderData();
  }, [fetchReorderData]);

  // Handle saving inline custom supply duration override
  const handleSaveSupplyOverride = async (customerKey, daysValue) => {
    setSavingKey(customerKey);
    try {
      const res = await adminFetch('/api/admin/reorder-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerKey,
          supplyDays: daysValue ? Number(daysValue) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save supply duration');

      // Update local state
      setCustomOverrides((prev) => ({
        ...prev,
        [customerKey]: daysValue ? Number(daysValue) : null,
      }));
      setEditingKey(null);
      fetchReorderData();
    } catch (err) {
      alert('Error updating supply duration: ' + err.message);
    } finally {
      setSavingKey(null);
    }
  };

  // KPI Metrics Summary
  const kpis = useMemo(() => {
    const total = statsData.length;
    const overdue = statsData.filter((s) => s.alertStatus === 'overdue').length;
    const dueSoon = statsData.filter((s) => s.alertStatus === 'due_soon').length;
    const onTrack = statsData.filter((s) => s.alertStatus === 'on_track').length;
    const repeatCust = statsData.filter((s) => s.orderCount >= 2);
    const avgInterval = repeatCust.length
      ? Math.round(repeatCust.reduce((acc, curr) => acc + (curr.avgIntervalDays || 0), 0) / repeatCust.length)
      : 0;

    return { total, overdue, dueSoon, onTrack, avgInterval };
  }, [statsData]);

  // Filtered & Sorted Customer List
  const filteredList = useMemo(() => {
    let list = [...statsData];

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((item) =>
        item.customerName.toLowerCase().includes(q) ||
        item.customerEmail.toLowerCase().includes(q) ||
        item.customerPhone.includes(q) ||
        item.lastProductPurchased.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter === 'overdue') {
      list = list.filter((item) => item.alertStatus === 'overdue');
    } else if (statusFilter === 'due_soon') {
      list = list.filter((item) => item.alertStatus === 'due_soon');
    } else if (statusFilter === 'on_track') {
      list = list.filter((item) => item.alertStatus === 'on_track');
    } else if (statusFilter === 'vip_commercial') {
      list = list.filter((item) => item.segment.label.includes('Doctor') || item.segment.label.includes('Pharmacy'));
    }

    // Sort
    list.sort((a, b) => {
      let comp = 0;
      if (sortField === 'overdue') {
        const scoreA = a.alertStatus === 'overdue' ? 1000 + a.daysOverdue : (a.alertStatus === 'due_soon' ? 500 - a.daysUntilDue : 0);
        const scoreB = b.alertStatus === 'overdue' ? 1000 + b.daysOverdue : (b.alertStatus === 'due_soon' ? 500 - b.daysUntilDue : 0);
        comp = scoreA - scoreB;
      } else if (sortField === 'date') {
        comp = new Date(a.lastOrderDate).getTime() - new Date(b.lastOrderDate).getTime();
      } else if (sortField === 'interval') {
        comp = (a.avgIntervalDays || 0) - (b.avgIntervalDays || 0);
      } else if (sortField === 'qty') {
        comp = (a.latestTotalQty || 0) - (b.latestTotalQty || 0);
      }
      return sortDir === 'asc' ? comp : -comp;
    });

    return list;
  }, [statsData, searchTerm, statusFilter, sortField, sortDir]);

  // Open prefilled WhatsApp script
  const handleOpenWhatsApp = (customer) => {
    const phone = customer.whatsappWaId || customer.customerPhone;
    if (!phone) {
      alert('No WhatsApp phone number registered for this customer.');
      return;
    }

    const scriptText = buildReorderFollowupScript({
      customerName: customer.customerName,
      lastProductPurchased: customer.lastProductPurchased,
      alertStatus: customer.alertStatus,
      daysOverdue: customer.daysOverdue,
      daysUntilDue: customer.daysUntilDue,
      estimatedSupplyDays: customer.estimatedSupplyDays,
    });

    if (onWhatsAppClick) {
      onWhatsAppClick({
        name: customer.customerName,
        phone,
        prefilledText: scriptText,
        cartItems: customer.latestItems,
      });
    } else {
      const encoded = encodeURIComponent(scriptText);
      window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${encoded}`, '_blank');
    }
  };

  return (
    <div className="admin-tab-panel reorder-tracking-panel">

      {/* HEADER SECTION */}
      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: '15px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '10px', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)' }}>
            <RotateCcw size={22} />
          </div>
          <div>
            <h2 className="admin-section-title" style={{ margin: 0 }}>Reorder Tracking & Overdue Alerts</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              Strategic purchasing cycles for doctors, pharmacies, and repeat retail buyers
            </p>
          </div>
        </div>

        <div className="admin-toolbar-actions">
          <button
            onClick={fetchReorderData}
            className="admin-btn"
            style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'sync-spinner' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* KPI METRICS CARDS */}
      <div className="admin-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '14px', padding: '18px', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#ef4444', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overdue Alerts</span>
            <AlertTriangle size={18} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f8fafc' }}>{kpis.overdue}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Customers past predicted reorder date</div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '14px', padding: '18px', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#f59e0b', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Due This Week</span>
            <Clock size={18} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f8fafc' }}>{kpis.dueSoon}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Predicted reorder in next 7 days</div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '14px', padding: '18px', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#10b981', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>On Track</span>
            <CheckCircle2 size={18} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f8fafc' }}>{kpis.onTrack}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Supply duration healthy (&gt;7 days)</div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '14px', padding: '18px', boxShadow: '0 4px 15px rgba(56, 189, 248, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#38bdf8', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Reorder Cycle</span>
            <RotateCcw size={18} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f8fafc' }}>{kpis.avgInterval ? `${kpis.avgInterval}d` : 'N/A'}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Historical repeat customer interval</div>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search doctor, pharmacy, customer, product..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '10px 10px 10px 36px', borderRadius: '8px', fontSize: '0.9rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', background: 'rgba(15, 23, 42, 0.4)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', flexWrap: 'wrap' }}>
          <button
            onClick={() => setStatusFilter('all')}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', border: 'none', cursor: 'pointer', background: statusFilter === 'all' ? '#38bdf8' : 'transparent', color: statusFilter === 'all' ? '#0f172a' : '#cbd5e1' }}
          >
            All ({statsData.length})
          </button>
          <button
            onClick={() => setStatusFilter('overdue')}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', border: 'none', cursor: 'pointer', background: statusFilter === 'overdue' ? '#ef4444' : 'transparent', color: statusFilter === 'overdue' ? '#fff' : '#ef4444' }}
          >
            Overdue ({kpis.overdue})
          </button>
          <button
            onClick={() => setStatusFilter('due_soon')}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', border: 'none', cursor: 'pointer', background: statusFilter === 'due_soon' ? '#f59e0b' : 'transparent', color: statusFilter === 'due_soon' ? '#0f172a' : '#f59e0b' }}
          >
            Due Soon ({kpis.dueSoon})
          </button>
          <button
            onClick={() => setStatusFilter('on_track')}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', border: 'none', cursor: 'pointer', background: statusFilter === 'on_track' ? '#10b981' : 'transparent', color: statusFilter === 'on_track' ? '#0f172a' : '#10b981' }}
          >
            On Track ({kpis.onTrack})
          </button>
          <button
            onClick={() => setStatusFilter('vip_commercial')}
            style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', border: 'none', cursor: 'pointer', background: statusFilter === 'vip_commercial' ? '#8b5cf6' : 'transparent', color: statusFilter === 'vip_commercial' ? '#fff' : '#c084fc' }}
          >
            Doctors &amp; Pharmacies
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', padding: '0 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', marginLeft: 'auto' }}>
          <ArrowDownUp size={14} color="#94a3b8" />
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="overdue" style={{ background: '#0f172a' }}>Sort by Urgency</option>
            <option value="date" style={{ background: '#0f172a' }}>Sort by Last Order Date</option>
            <option value="interval" style={{ background: '#0f172a' }}>Sort by Cycle Interval</option>
            <option value="qty" style={{ background: '#0f172a' }}>Sort by Order Qty</option>
          </select>
          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="desc" style={{ background: '#0f172a' }}>Desc</option>
            <option value="asc" style={{ background: '#0f172a' }}>Asc</option>
          </select>
        </div>
      </div>

      {/* CUSTOMER REORDER TRACKING TABLE */}
      {!filteredList.length ? (
        <div className="admin-empty-state" style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <div style={{ opacity: 0.5, marginBottom: '12px' }}><RotateCcw size={48} color="#94a3b8" /></div>
          <h3 style={{ color: '#f8fafc', margin: '0 0 4px 0' }}>No Reorder Profiles Match</h3>
          <p style={{ color: '#94a3b8', margin: 0 }}>Try clearing filters or search terms.</p>
        </div>
      ) : (
        <div className="table-responsive admin-desktop-table" style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <table className="spreadsheet-table responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(30, 41, 59, 0.8)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <tr>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Customer / Segment</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Product Purchased</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Supply Duration</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Cycle &amp; Last Order</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Predicted Reorder</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Alert Status</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'right' }}>Follow-Up Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((cust) => {
                const isEditing = editingKey === cust.customerKey;

                return (
                  <tr
                    key={cust.customerKey}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: cust.alertStatus === 'overdue' ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                    }}
                  >
                    {/* CUSTOMER & SEGMENT */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#f8fafc' }}>
                        {cust.customerName}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                        {cust.customerEmail || cust.customerPhone || 'No contact'}
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: cust.segment.badgeTone === 'purple' ? 'rgba(168, 85, 247, 0.15)' :
                                      cust.segment.badgeTone === 'blue' ? 'rgba(59, 130, 246, 0.15)' :
                                      cust.segment.badgeTone === 'amber' ? 'rgba(245, 158, 11, 0.15)' :
                                      'rgba(16, 185, 129, 0.15)',
                          color: cust.segment.badgeTone === 'purple' ? '#c084fc' :
                                 cust.segment.badgeTone === 'blue' ? '#60a5fa' :
                                 cust.segment.badgeTone === 'amber' ? '#fbbf24' :
                                 '#34d399',
                          border: `1px solid ${cust.segment.badgeTone === 'purple' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                        }}>
                          {cust.segment.label}
                        </span>
                      </div>
                    </td>

                    {/* PRODUCT PURCHASED */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '0.88rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Package size={14} style={{ color: '#38bdf8' }} />
                        <span style={{ fontWeight: '600' }}>{cust.lastProductPurchased}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                        {cust.orderCount} order{cust.orderCount > 1 ? 's' : ''} total
                      </div>
                    </td>

                    {/* ESTIMATED SUPPLY DURATION */}
                    <td style={{ padding: '12px 16px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={editDaysInput}
                            onChange={(e) => setEditDaysInput(e.target.value)}
                            style={{ width: '60px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #38bdf8', color: '#fff', borderRadius: '6px', padding: '4px 6px', fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>days</span>
                          <button
                            onClick={() => handleSaveSupplyOverride(cust.customerKey, editDaysInput)}
                            disabled={savingKey === cust.customerKey}
                            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                          >
                            <Save size={12} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc' }}>
                            {cust.estimatedSupplyDays} days
                          </span>
                          {cust.customOverride && (
                            <span style={{ fontSize: '0.68rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 5px', borderRadius: '4px' }}>custom</span>
                          )}
                          <button
                            onClick={() => {
                              setEditingKey(cust.customerKey);
                              setEditDaysInput(String(cust.estimatedSupplyDays));
                            }}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                            title="Override supply duration in days"
                          >
                            <Edit3 size={13} />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* CYCLE INTERVAL & LAST ORDER DATE */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: '600' }}>
                        {cust.intervalPattern}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Calendar size={11} /> {formatCrDate(cust.lastOrderDate)}
                      </div>
                    </td>

                    {/* PREDICTED REORDER DATE */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#cbd5e1' }}>
                        {formatCrDate(cust.predictedReorderDate)}
                      </div>
                    </td>

                    {/* ALERT STATUS BADGE */}
                    <td style={{ padding: '12px 16px' }}>
                      {cust.alertStatus === 'overdue' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700' }}>
                          <AlertTriangle size={12} /> OVERDUE ({cust.daysOverdue}d)
                        </div>
                      )}
                      {cust.alertStatus === 'due_soon' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700' }}>
                          <Clock size={12} /> DUE SOON ({cust.daysUntilDue}d)
                        </div>
                      )}
                      {cust.alertStatus === 'on_track' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '700' }}>
                          <CheckCircle2 size={12} /> ON TRACK ({cust.daysUntilDue}d)
                        </div>
                      )}
                    </td>

                    {/* STRATEGIC FOLLOW-UP ACTIONS */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleOpenWhatsApp(cust)}
                          style={{ padding: '6px 12px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                          title="Open WhatsApp with personalized reorder follow-up script"
                        >
                          <MessageCircle size={13} /> Reorder Follow-up
                        </button>
                        <button
                          onClick={() => onOpenCustomerProfile && onOpenCustomerProfile({ customer_email: cust.customerEmail, customer_phone: cust.customerPhone, customer_name: cust.customerName })}
                          style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                          title="View Customer Profile & Timeline"
                        >
                          <User size={14} />
                        </button>
                        {onCreateOrder && (
                          <button
                            onClick={() => onCreateOrder({ customer_email: cust.customerEmail, customer_phone: cust.customerPhone, customer_name: cust.customerName })}
                            style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            title="Create Manual Order for Reorder"
                          >
                            <PlusCircle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
