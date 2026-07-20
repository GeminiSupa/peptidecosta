import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { Plus, Trash2, Edit2, Shield, Check, ChevronDown, ChevronUp } from 'lucide-react';
import AgentDashboard from './AgentDashboard';
import { formatPayoutPeriod, getOrderCount, recalcPayoutAmounts } from '@/lib/commissionPayouts';
import { getOrderSalesAmounts, isCommissionEligibleOrder, orderBelongsToAgent } from '@/lib/agentOrders';
import { ASSIGNABLE_ADMIN_MODULES } from '@/lib/adminModules';

export default function TeamManagement({ currentUserProfile, currentUserEmail, onTeamChanged }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Sub-tabs & Payout states
  const [activeSubTab, setActiveSubTab] = useState('members'); // 'members' or 'payouts'
  const [payouts, setPayouts] = useState([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [syncingCommissions, setSyncingCommissions] = useState(false);
  const [scanPeriod, setScanPeriod] = useState('previous'); // 'previous', 'current', 'all-time', or 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [targetAgent, setTargetAgent] = useState('all'); // 'all' or an agent email
  const [payoutFilterAgent, setPayoutFilterAgent] = useState('all');
  const [payoutFilterStatus, setPayoutFilterStatus] = useState('pending');
  const [expandedPayoutId, setExpandedPayoutId] = useState(null);
  const [pendingByPayout, setPendingByPayout] = useState({}); // payoutId -> pending (not-yet-paid) orders for that week
  const [pendingLoadingId, setPendingLoadingId] = useState(null);
  const [editingPayout, setEditingPayout] = useState(null);
  const [payoutForm, setPayoutForm] = useState(null);
  const [payoutSaveLoading, setPayoutSaveLoading] = useState(false);

  // Form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formName, setFormName] = useState('');
  const [formPermissions, setFormPermissions] = useState([]);
  const [formIsSuperadmin, setFormIsSuperadmin] = useState(false);
  const [formCommissionRate, setFormCommissionRate] = useState(0);
  const [formWeeklySalary, setFormWeeklySalary] = useState(0);
  const [formSalaryCurrency, setFormSalaryCurrency] = useState('USD');
  const [formCommissionStructure, setFormCommissionStructure] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('admin_profiles').select('*').order('created_at', { ascending: false });
      if (data) setUsers(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const fetchPayouts = async () => {
    setLoadingPayouts(true);
    try {
      const { data, error } = await supabase
        .from('commission_payouts')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setPayouts(data);
    } catch (err) {
      console.error(err);
    }
    setLoadingPayouts(false);
  };

  const handlePayoutAction = async (payoutId, action) => {
    setActionLoadingId(payoutId);
    try {
      const response = await adminFetch('/api/admin/commissions/approve', {
        method: 'POST',
        body: JSON.stringify({ payoutId, action })
      });
      const data = await response.json();
      if (data.success) {
        alert(`Payout successfully ${action === 'Approved' ? 'Approved & Email Dispatched' : 'Rejected'}!`);
        fetchPayouts();
      } else {
        alert(`Failed to process payout: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error trying to process payout.');
    }
    setActionLoadingId(null);
  };

  // Pending (not-yet-paid) orders for a payout's week are not stored on the
  // payout record, so fetch them on demand when the card is expanded. These are
  // shown for visibility only and never added to the payout total.
  const loadPendingForPayout = async (p) => {
    if (!p?.id || pendingByPayout[p.id]) return;
    setPendingLoadingId(p.id);
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, status, sales_agent, total_usd, total_crc, currency, created_at')
        .gte('created_at', p.start_date)
        .lte('created_at', p.end_date)
        .not('status', 'eq', 'Cancelled')
        .order('created_at', { ascending: false });
      const profile = { name: p.agent_name, email: p.agent_email };
      const pend = (data || []).filter(
        (o) => orderBelongsToAgent(o, profile) && !isCommissionEligibleOrder(o)
      );
      setPendingByPayout((prev) => ({ ...prev, [p.id]: pend }));
    } catch (err) {
      console.error('Failed to load pending orders for payout:', err);
      setPendingByPayout((prev) => ({ ...prev, [p.id]: [] }));
    }
    setPendingLoadingId(null);
  };

  const handleSyncCommissions = async () => {
    setSyncingCommissions(true);
    try {
      let url = `/api/admin/commissions/weekly-report?period=${scanPeriod}`;
      if (scanPeriod === 'custom') {
        if (!customStartDate || !customEndDate) {
          alert('Please select both a start date and an end date.');
          setSyncingCommissions(false);
          return;
        }
        url += `&start=${customStartDate}&end=${customEndDate}`;
      }
      if (targetAgent && targetAgent !== 'all') {
        url += `&agentEmail=${encodeURIComponent(targetAgent)}`;
      }

      const response = await adminFetch(url);
      const data = await response.json();
      if (data.success) {
        const periodMsg = scanPeriod === 'previous' 
          ? 'previous completed week (Mon-Sun)' 
          : scanPeriod === 'all-time' ? 'all-time historical orders' 
          : scanPeriod === 'custom' ? `custom range (${customStartDate} to ${customEndDate})`
          : 'current week-to-date (Mon-Now)';
        const agentMsg = targetAgent !== 'all' ? ` for ${users.find(u => u.email === targetAgent)?.name || targetAgent}` : '';
        alert(`Commission scan complete for ${periodMsg}${agentMsg}.\n\nExisting pending payout for the same agent + period was updated (not duplicated).`);
        setActiveSubTab('payouts');
        setPayoutFilterStatus('pending');
        if (targetAgent !== 'all') setPayoutFilterAgent(targetAgent);
        fetchPayouts();
      } else {
        alert(`Failed to sync commissions: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error syncing weekly commissions.');
    }
    setSyncingCommissions(false);
  };

  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => {
      if (payoutFilterAgent !== 'all' && p.agent_email !== payoutFilterAgent) return false;
      if (payoutFilterStatus === 'pending' && p.status !== 'Pending') return false;
      if (payoutFilterStatus === 'approved' && p.status !== 'Approved') return false;
      if (payoutFilterStatus === 'rejected' && p.status !== 'Rejected') return false;
      return true;
    });
  }, [payouts, payoutFilterAgent, payoutFilterStatus]);

  const pendingDuplicateAgents = useMemo(() => {
    const pending = payouts.filter((p) => p.status === 'Pending');
    const byAgent = {};
    for (const p of pending) {
      const key = p.agent_email;
      if (!byAgent[key]) byAgent[key] = [];
      byAgent[key].push(p);
    }
    return Object.entries(byAgent).filter(([, rows]) => rows.length > 1);
  }, [payouts]);

  const openPayoutEditor = (payout) => {
    setEditingPayout(payout);
    setPayoutForm({
      usd_sales: Number(payout.usd_sales || 0),
      crc_sales: Number(payout.crc_sales || 0),
      commission_rate: Number(payout.commission_rate || 0),
      weekly_salary_paid: Number(payout.weekly_salary_paid || 0),
      salary_currency: payout.salary_currency || 'USD',
      admin_notes: payout.admin_notes || '',
    });
  };

  const handleSavePayoutEdit = async (e) => {
    e.preventDefault();
    if (!editingPayout || !payoutForm) return;
    setPayoutSaveLoading(true);
    try {
      const response = await adminFetch('/api/admin/commissions/payouts', {
        method: 'PATCH',
        body: JSON.stringify({
          payoutId: editingPayout.id,
          ...payoutForm,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setEditingPayout(null);
        setPayoutForm(null);
        fetchPayouts();
      } else {
        alert(`Failed to save: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error saving payout.');
    }
    setPayoutSaveLoading(false);
  };

  const handleRemovePayout = async (payoutId, isHardDelete = false) => {
    const msg = isHardDelete 
      ? 'Permanently delete this rejected payout from the database? This cannot be undone.' 
      : 'Remove this pending payout? Use this for duplicates or mistaken scans.';
    if (!window.confirm(msg)) return;
    
    try {
      const response = await adminFetch(`/api/admin/commissions/payouts?payoutId=${payoutId}${isHardDelete ? '&hardDelete=true' : ''}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) fetchPayouts();
      else alert(`Failed to delete: ${data.error}`);
    } catch (err) {
      console.error(err);
      alert('Network error deleting payout.');
    }
  };

  useEffect(() => {
    fetchUsers(); // Always load users (needed for agent dropdown on payouts tab)
    if (activeSubTab === 'payouts') {
      fetchPayouts();
    }
  }, [activeSubTab]);

  const handleOpenModal = (user = null) => {
    setFormError('');
    if (user) {
      setEditingUserId(user.user_id);
      setFormEmail(user.email);
      setFormPassword(''); // don't show existing password
      setFormName(user.name || '');
      setFormPermissions(user.permissions || []);
      setFormIsSuperadmin(user.is_superadmin || false);
      setFormCommissionRate(user.commission_rate || 0);
      setFormWeeklySalary(user.weekly_salary || 0);
      setFormSalaryCurrency(user.salary_currency || 'USD');
      setFormCommissionStructure(user.commission_structure || '');
    } else {
      setEditingUserId(null);
      setFormEmail('');
      setFormPassword('');
      setFormName('');
      setFormPermissions([]);
      setFormIsSuperadmin(false);
      setFormCommissionRate(0);
      setFormWeeklySalary(0);
      setFormSalaryCurrency('USD');
      setFormCommissionStructure('');
    }
    setIsModalOpen(true);
  };

  const handleTogglePermission = (tabId) => {
    setFormPermissions(prev => 
      prev.includes(tabId) ? prev.filter(id => id !== tabId) : [...prev, tabId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');

    try {
      if (editingUserId) {
        // Update user
        const res = await adminFetch('/api/admin/users/update', {
          method: 'PUT',
          body: JSON.stringify({
            userId: editingUserId,
            password: formPassword || undefined,
            name: formName,
            permissions: formPermissions,
            is_superadmin: formIsSuperadmin,
            commission_rate: formCommissionRate,
            weekly_salary: formWeeklySalary,
            salary_currency: formSalaryCurrency,
            commission_structure: formCommissionStructure
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user');
      } else {
        // Create user
        if (!formPassword) throw new Error('Password is required for new users');
        const res = await adminFetch('/api/admin/users/create', {
          method: 'POST',
          body: JSON.stringify({
            email: formEmail,
            password: formPassword,
            name: formName,
            permissions: formPermissions,
            is_superadmin: formIsSuperadmin,
            commission_rate: formCommissionRate,
            weekly_salary: formWeeklySalary,
            salary_currency: formSalaryCurrency,
            commission_structure: formCommissionStructure
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create user');
      }
      
      setIsModalOpen(false);
      fetchUsers();
      onTeamChanged?.();
    } catch (err) {
      setFormError(err.message);
    }
    setFormLoading(false);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Are you sure you want to completely delete this user? This cannot be undone.")) return;
    
    try {
      const res = await adminFetch(`/api/admin/users/delete?userId=${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      fetchUsers();
      onTeamChanged?.();
    } catch (err) {
      alert(err.message);
    }
  };

  const isSuperAdmin = currentUserProfile?.is_superadmin || currentUserEmail === 'joe@peptides.com' || currentUserEmail === 'info@peptidescostarica.net';

  if (!isSuperAdmin) {
    return <AgentDashboard currentUserProfile={currentUserProfile} currentUserEmail={currentUserEmail} />;
  }

  const formatMoneyUI = (val, curr) => {
    const num = Number(val || 0);
    if (curr === 'USD') return `$${num.toFixed(2)}`;
    return `₡${Math.round(num).toLocaleString('en-US')}`;
  };

  return (
    <div className="admin-team-panel">
      <div className="admin-team-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 className="admin-section-title" style={{ fontSize: '1.5rem' }}>Team Management</h2>
          <p className="admin-page-subtitle">Manage admin users, commission rates, and payouts.</p>
        </div>
        {activeSubTab === 'members' ? (
          <button className="admin-btn admin-btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Add User
          </button>
        ) : (
          <div className="admin-team-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <select
              value={targetAgent}
              onChange={(e) => setTargetAgent(e.target.value)}
              disabled={syncingCommissions}
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                outline: 'none',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                fontWeight: 'bold'
              }}
            >
              <option value="all">All Agents</option>
              {users.map(u => (
                <option key={u.user_id} value={u.email}>{u.name || u.email}</option>
              ))}
            </select>

            <select
              value={scanPeriod}
              onChange={(e) => setScanPeriod(e.target.value)}
              disabled={syncingCommissions}
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                outline: 'none',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
              }}
            >
              <option value="previous">Previous Week (Mon-Sun)</option>
              <option value="current">Current Week (Mon-Now)</option>
              <option value="all-time">All-Time (All Pending)</option>
              <option value="custom">Custom Date Range</option>
            </select>
            
            {scanPeriod === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.8)', color: '#e2e8f0', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '6px 10px', fontSize: '0.8rem' }}
                />
                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>to</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.8)', color: '#e2e8f0', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '6px 10px', fontSize: '0.8rem' }}
                />
              </div>
            )}

            <button 
              className="admin-btn admin-btn-primary" 
              onClick={handleSyncCommissions} 
              disabled={syncingCommissions}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#a855f7', borderColor: '#a855f7' }}
            >
              {syncingCommissions ? 'Calculating...' : '🔄 Run Commission Scan'}
            </button>
            <p style={{ width: '100%', margin: '4px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Re-scanning the same agent + period updates one pending row (no duplicate). Different periods stay separate.
            </p>
          </div>
        )}
      </div>

      {/* Sub-tab Toggle buttons */}
      <div className="admin-team-subtabs" style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px' }}>
        <button 
          onClick={() => setActiveSubTab('members')}
          style={{ 
            background: activeSubTab === 'members' ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' : 'rgba(255,255,255,0.03)', 
            color: activeSubTab === 'members' ? '#ffffff' : '#94a3b8',
            border: activeSubTab === 'members' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255,255,255,0.05)',
            boxShadow: activeSubTab === 'members' ? '0 4px 12px rgba(56, 189, 248, 0.25)' : 'none',
            fontWeight: '600',
            padding: '10px 20px',
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          👥 Manage Members & Rates
        </button>
        <button 
          onClick={() => setActiveSubTab('payouts')}
          style={{ 
            background: activeSubTab === 'payouts' ? 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' : 'rgba(255,255,255,0.03)', 
            color: activeSubTab === 'payouts' ? '#ffffff' : '#94a3b8',
            border: activeSubTab === 'payouts' ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(255,255,255,0.05)',
            boxShadow: activeSubTab === 'payouts' ? '0 4px 12px rgba(168, 85, 247, 0.25)' : 'none',
            fontWeight: '600',
            padding: '10px 20px',
            borderRadius: '10px',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          💰 Commission Payouts
        </button>
      </div>

      {activeSubTab === 'members' ? (
        loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading team members...</div>
        ) : (
          <div className="table-responsive" style={{ background: 'linear-gradient(145deg, rgba(14, 22, 38, 0.8) 0%, rgba(10, 15, 28, 0.9) 100%)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', overflow: 'hidden' }}>
            <table className="spreadsheet-table responsive-table">
              <thead style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <tr>
                  <th style={{ padding: '18px 16px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Name</th>
                  <th style={{ padding: '18px 16px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Email</th>
                  <th style={{ padding: '18px 16px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Role</th>
                  <th style={{ padding: '18px 16px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Base Salary</th>
                  <th style={{ padding: '18px 16px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Commission</th>
                  <th style={{ padding: '18px 16px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Access</th>
                  <th style={{ padding: '18px 16px', textAlign: 'right', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.01)' } }}>
                    <td data-label="Name" style={{ padding: '16px', fontWeight: 'bold', color: '#f8fafc' }}>{u.name || 'N/A'}</td>
                    <td data-label="Email" style={{ padding: '16px', wordBreak: 'break-all', color: '#cbd5e1' }}>{u.email}</td>
                    <td data-label="Role" style={{ padding: '16px' }}>
                      {u.is_superadmin ? (
                        <span className="status-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                          <Shield size={12} /> Superadmin
                        </span>
                      ) : (
                        <span className="status-badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', width: 'fit-content' }}>
                          Staff
                        </span>
                      )}
                    </td>
                    <td data-label="Base Salary" style={{ padding: '16px', fontWeight: 'bold' }}>
                      {formatMoneyUI(u.weekly_salary, u.salary_currency)} / wk
                    </td>
                    <td data-label="Commission" style={{ padding: '16px', fontWeight: 'bold', color: '#38bdf8' }}>
                      {u.commission_rate !== undefined ? `${u.commission_rate}%` : '0%'}
                      {u.commission_structure && <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>{u.commission_structure}</div>}
                    </td>
                    <td data-label="Access" style={{ padding: '16px', fontSize: '0.8rem', color: '#94a3b8', maxWidth: '200px' }}>
                      {u.is_superadmin ? 'Full Access' : (u.permissions && u.permissions.length > 0 ? u.permissions.join(', ') : 'No Access')}
                    </td>
                    <td data-label="Actions" style={{ padding: '16px', textAlign: 'right' }}>
                      <div className="admin-card-actions">
                        <button className="admin-btn" onClick={() => handleOpenModal(u)} style={{ padding: '6px 10px' }}>
                          <Edit2 size={14} /> Edit
                        </button>
                        {u.user_id !== currentUserProfile?.user_id && (
                          <button className="admin-btn" onClick={() => handleDelete(u.user_id)} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '6px 10px' }}>
                            <Trash2 size={14} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          {pendingDuplicateAgents.length > 0 && (
            <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.85rem', color: '#fde68a' }}>
              <strong>Duplicate pending payouts detected.</strong>{' '}
              {pendingDuplicateAgents.map(([email, rows]) => {
                const name = rows[0]?.agent_name || email;
                return `${name} (${rows.length} pending)`;
              }).join(' · ')}
              . Keep the correct one and <strong>Remove</strong> the rest, or re-run the scan (same agent + period updates in place).
            </div>
          )}

          <div className="admin-toolbar-filters" style={{ marginBottom: '16px' }}>
            <select
              value={payoutFilterAgent}
              onChange={(e) => setPayoutFilterAgent(e.target.value)}
              className="admin-input"
              style={{ minWidth: '140px', background: '#0e1626', color: '#38bdf8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="all">All agents</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.email}>{u.name || u.email}</option>
              ))}
            </select>
            <select
              value={payoutFilterStatus}
              onChange={(e) => setPayoutFilterStatus(e.target.value)}
              className="admin-input"
              style={{ minWidth: '140px', background: '#0e1626', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="pending">Pending only</option>
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <span style={{ fontSize: '0.8rem', color: '#64748b', alignSelf: 'center' }}>
              {filteredPayouts.length} payout{filteredPayouts.length === 1 ? '' : 's'}
            </span>
          </div>

          {loadingPayouts ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading payouts history...</div>
          ) : filteredPayouts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
              No payouts match this filter. Run <strong>Commission Scan</strong> with agent + period selected.
            </div>
          ) : (
            <div className="commission-payouts-list">
              {filteredPayouts.map((p) => {
                const savedOrders = Array.isArray(p.orders_data) ? p.orders_data : [];
                const includedOrders = [...(p.status === 'Pending'
                  ? savedOrders.filter(isCommissionEligibleOrder)
                  : savedOrders
                )].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                const orderCount = includedOrders.length;
                const currentAmounts = includedOrders.reduce((totals, order) => {
                  const amounts = getOrderSalesAmounts(order);
                  totals.usd += amounts.usd;
                  totals.crc += amounts.crc;
                  return totals;
                }, { usd: 0, crc: 0 });
                const displayedPayout = p.status === 'Pending'
                  ? recalcPayoutAmounts({
                      usdSales: currentAmounts.usd,
                      crcSales: currentAmounts.crc,
                      commissionRate: p.commission_rate,
                      weeklySalary: p.weekly_salary_paid,
                      salaryCurrency: p.salary_currency,
                    })
                  : {
                      usd_commission: Number(p.usd_commission || 0),
                      crc_commission: Number(p.crc_commission || 0),
                      total_payout_usd: Number(p.total_payout_usd || 0),
                      total_payout_crc: Number(p.total_payout_crc || 0),
                    };
                const displayedUsdSales = p.status === 'Pending' ? currentAmounts.usd : p.usd_sales;
                const displayedCrcSales = p.status === 'Pending' ? currentAmounts.crc : p.crc_sales;
                const periodText = p.period_label || formatPayoutPeriod(p.start_date, p.end_date);
                const isExpanded = expandedPayoutId === p.id;

                return (
                  <div key={p.id} className="commission-payout-card">
                    <div className="commission-payout-card__header">
                      <div>
                        <div className="commission-payout-card__agent">{p.agent_name || 'N/A'}</div>
                        <div className="commission-payout-card__email">{p.agent_email}</div>
                      </div>
                      <span className={`commission-payout-card__status commission-payout-card__status--${(p.status || 'pending').toLowerCase()}`}>
                        {p.status === 'Pending' ? 'Pending' : p.status}
                      </span>
                    </div>

                    <div className="commission-payout-card__period">
                      <span>{periodText}</span>
                      <span>{orderCount} order{orderCount === 1 ? '' : 's'}</span>
                    </div>

                    <div className="commission-payout-card__grid">
                      <div className="commission-payout-card__metric">
                        <span className="label">Gross USD</span>
                        <span className="value">{formatMoneyUI(displayedUsdSales, 'USD')}</span>
                      </div>
                      <div className="commission-payout-card__metric">
                        <span className="label">Gross CRC</span>
                        <span className="value">{formatMoneyUI(displayedCrcSales, 'CRC')}</span>
                      </div>
                      <div className="commission-payout-card__metric">
                        <span className="label">Rate</span>
                        <span className="value">{p.commission_rate}%</span>
                      </div>
                      <div className="commission-payout-card__metric">
                        <span className="label">Commission</span>
                        <span className="value accent">
                          {formatMoneyUI(displayedPayout.usd_commission, 'USD')}
                          {displayedPayout.crc_commission > 0 ? ` OR ${formatMoneyUI(displayedPayout.crc_commission, 'CRC')}` : ''}
                        </span>
                      </div>
                      {(p.weekly_salary_paid > 0 || displayedPayout.total_payout_usd > 0 || displayedPayout.total_payout_crc > 0) && (
                        <div className="commission-payout-card__metric commission-payout-card__metric--wide">
                          <span className="label">Total payout (salary + commission)</span>
                          <span className="value">
                            {displayedPayout.total_payout_usd > 0 ? formatMoneyUI(displayedPayout.total_payout_usd, 'USD') : ''}
                            {displayedPayout.total_payout_usd > 0 && displayedPayout.total_payout_crc > 0 ? ' OR ' : ''}
                            {displayedPayout.total_payout_crc > 0 ? formatMoneyUI(displayedPayout.total_payout_crc, 'CRC') : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {p.admin_notes && (
                      <div className="commission-payout-card__notes">Note: {p.admin_notes}</div>
                    )}

                    {orderCount > 0 && (
                      <button
                        type="button"
                        className="commission-payout-card__toggle"
                        onClick={() => {
                          const next = isExpanded ? null : p.id;
                          setExpandedPayoutId(next);
                          if (next) loadPendingForPayout(p);
                        }}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? 'Hide orders' : `View ${orderCount} included order${orderCount === 1 ? '' : 's'}`}
                      </button>
                    )}

                    {isExpanded && (() => {
                      const pendOrders = pendingByPayout[p.id] || [];
                      const pendTotals = pendOrders.reduce((t, o) => {
                        const a = getOrderSalesAmounts(o);
                        t.usd += a.usd; t.crc += a.crc;
                        return t;
                      }, { usd: 0, crc: 0 });
                      const orderRow = (order) => (
                        <div key={order.id} className="commission-payout-card__order-row">
                          <span>#{order.order_number || order.id?.slice(0, 8)}</span>
                          <span>{order.customer_name || 'N/A'}</span>
                          <span>
                            {order.currency === 'USD'
                              ? formatMoneyUI(order.total_usd, 'USD')
                              : formatMoneyUI(order.total_crc, 'CRC')}
                          </span>
                        </div>
                      );
                      return (
                        <div className="commission-payout-card__orders">
                          <div className="commission-payout-card__order-row" style={{ fontWeight: 700, color: '#4ade80' }}>
                            <span>✓ Paid · counts toward pay ({includedOrders.length})</span>
                            <span />
                            <span>{formatMoneyUI(displayedUsdSales, 'USD')}</span>
                          </div>
                          {includedOrders.map(orderRow)}

                          {pendingLoadingId === p.id && !pendingByPayout[p.id] && (
                            <div className="commission-payout-card__order-row" style={{ opacity: 0.6 }}>
                              <span>Loading pending…</span><span /><span />
                            </div>
                          )}
                          {pendOrders.length > 0 && (
                            <>
                              <div className="commission-payout-card__order-row" style={{ fontWeight: 700, color: '#fbbf24', marginTop: '8px' }}>
                                <span>⏳ Pending · not counted yet ({pendOrders.length})</span>
                                <span />
                                <span>{pendTotals.usd > 0 ? formatMoneyUI(pendTotals.usd, 'USD') : formatMoneyUI(pendTotals.crc, 'CRC')}</span>
                              </div>
                              {pendOrders.map(orderRow)}
                              <div style={{ fontSize: '0.7rem', fontStyle: 'italic', opacity: 0.65, marginTop: '4px' }}>
                                Not part of this payout — counts once marked paid/complete.
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    <div className="commission-payout-card__actions">
                      {p.status === 'Pending' ? (
                        <>
                          <button className="admin-btn" onClick={() => openPayoutEditor(p)} style={{ padding: '6px 12px', fontSize: '0.75rem' }}>
                            <Edit2 size={12} /> Edit
                          </button>
                          <button className="admin-btn" onClick={() => handleRemovePayout(p.id)} style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#94a3b8' }}>
                            Remove
                          </button>
                          <button
                            className="admin-btn"
                            disabled={actionLoadingId !== null}
                            onClick={() => handlePayoutAction(p.id, 'Approved')}
                            style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 'bold', marginLeft: 'auto' }}
                          >
                            {actionLoadingId === p.id ? '...' : <Check size={12} />} Approve
                          </button>
                        </>
                      ) : p.status === 'Approved' ? (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Approved {p.approved_at ? new Date(p.approved_at).toLocaleDateString() : ''}
                        </span>
                      ) : (
                        <>
                          <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>Rejected / removed</span>
                          <button 
                            className="admin-btn" 
                            onClick={() => handleRemovePayout(p.id, true)} 
                            style={{ padding: '4px 8px', fontSize: '0.7rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', marginLeft: 'auto' }}
                          >
                            <Trash2 size={12} style={{ display: 'inline', marginRight: '4px' }} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Edit payout modal */}
      {editingPayout && payoutForm && (
        <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <div className="modal-content" style={{ maxWidth: '520px', background: 'linear-gradient(145deg, #111827 0%, #0f172a 100%)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                Edit Payout — {editingPayout.agent_name}
              </h2>
              <button className="close-btn" onClick={() => { setEditingPayout(null); setPayoutForm(null); }}>×</button>
            </div>
            <form onSubmit={handleSavePayoutEdit}>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 16px' }}>
                {editingPayout.period_label || formatPayoutPeriod(editingPayout.start_date, editingPayout.end_date)}
                {' · '}{getOrderCount(editingPayout)} orders from scan
              </p>
              <div className="admin-form-grid-2" style={{ marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold' }}>Gross USD</label>
                  <input type="number" min="0" step="0.01" value={payoutForm.usd_sales} onChange={(e) => setPayoutForm({ ...payoutForm, usd_sales: parseFloat(e.target.value) || 0 })} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold' }}>Gross CRC</label>
                  <input type="number" min="0" step="1" value={payoutForm.crc_sales} onChange={(e) => setPayoutForm({ ...payoutForm, crc_sales: parseFloat(e.target.value) || 0 })} className="admin-input" style={{ width: '100%' }} />
                </div>
              </div>
              <div className="admin-form-grid-2" style={{ marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold' }}>Commission rate (%)</label>
                  <input type="number" min="0" max="100" step="0.1" value={payoutForm.commission_rate} onChange={(e) => setPayoutForm({ ...payoutForm, commission_rate: parseFloat(e.target.value) || 0 })} className="admin-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold' }}>Weekly salary</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select value={payoutForm.salary_currency} onChange={(e) => setPayoutForm({ ...payoutForm, salary_currency: e.target.value })} className="admin-input" style={{ width: '72px' }}>
                      <option value="USD">USD</option>
                      <option value="CRC">CRC</option>
                    </select>
                    <input type="number" min="0" step="0.01" value={payoutForm.weekly_salary_paid} onChange={(e) => setPayoutForm({ ...payoutForm, weekly_salary_paid: parseFloat(e.target.value) || 0 })} className="admin-input" style={{ flex: 1 }} />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold' }}>Admin notes (optional)</label>
                <textarea value={payoutForm.admin_notes} onChange={(e) => setPayoutForm({ ...payoutForm, admin_notes: e.target.value })} className="admin-input" rows={2} style={{ width: '100%', resize: 'vertical' }} placeholder="e.g. Adjusted for split order with Korinne" />
              </div>
              {(() => {
                const preview = recalcPayoutAmounts({
                  usdSales: payoutForm.usd_sales,
                  crcSales: payoutForm.crc_sales,
                  commissionRate: payoutForm.commission_rate,
                  weeklySalary: payoutForm.weekly_salary_paid,
                  salaryCurrency: payoutForm.salary_currency,
                });
                return (
                  <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '0.85rem' }}>
                    <div style={{ color: '#c084fc', fontWeight: 'bold' }}>
                      Commission: {formatMoneyUI(preview.usd_commission, 'USD')}
                      {preview.crc_commission > 0 ? ` OR ${formatMoneyUI(preview.crc_commission, 'CRC')}` : ''}
                    </div>
                    <div style={{ color: '#e2e8f0', marginTop: '4px' }}>
                      Total payout: {formatMoneyUI(preview.total_payout_usd, 'USD')}
                      {preview.total_payout_crc > 0 ? ` OR ${formatMoneyUI(preview.total_payout_crc, 'CRC')}` : ''}
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="admin-btn" onClick={() => { setEditingPayout(null); setPayoutForm(null); }}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={payoutSaveLoading}>
                  {payoutSaveLoading ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <div className="modal-content" style={{ maxWidth: '550px', background: 'linear-gradient(145deg, #111827 0%, #0f172a 100%)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                {editingUserId ? 'Edit Team Member' : 'Add New Team Member'}
              </h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            
            <div className="modal-body">
              {formError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <Shield size={16} /> {formError}
                </div>
              )}
              
              <form onSubmit={handleSubmit}>
                <div className="admin-form-grid-2" style={{ marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name</label>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)} required className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }} placeholder="John Doe" />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                    <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} required={!editingUserId} disabled={!!editingUserId} className="admin-input" style={{ width: '100%', background: editingUserId ? 'rgba(255,255,255,0.02)' : '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: editingUserId ? '#94a3b8' : '#f8fafc' }} placeholder="john@example.com" />
                  </div>
                </div>
                
                <div className="admin-form-grid-2" style={{ marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                    <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} required={!editingUserId} className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }} placeholder={editingUserId ? "Leave blank to keep current" : "Enter temporary password"} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commission Rate (%)</label>
                    <input type="number" min="0" max="100" step="0.1" value={formCommissionRate} onChange={e => setFormCommissionRate(parseFloat(e.target.value) || 0)} required className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }} placeholder="e.g. 10.0" />
                  </div>
                </div>

                <div className="admin-form-grid-2" style={{ marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Base Weekly Salary</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select value={formSalaryCurrency} onChange={e => setFormSalaryCurrency(e.target.value)} className="admin-input" style={{ width: '90px', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }}>
                        <option value="USD">USD</option>
                        <option value="CRC">CRC</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={formWeeklySalary} onChange={e => setFormWeeklySalary(parseFloat(e.target.value) || 0)} className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }} placeholder="e.g. 500.00" />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commission Structure Notes</label>
                    <input type="text" value={formCommissionStructure} onChange={e => setFormCommissionStructure(e.target.value)} className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc' }} placeholder="e.g. 10% on Gross Sales" />
                  </div>
                </div>
                
                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: formIsSuperadmin ? '0' : '20px' }}>
                    <div>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={16} style={{ color: '#c084fc' }} /> Superadmin Access</h3>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0 0' }}>Grants full unrestricted access to all dashboard features.</p>
                    </div>
                    <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                      <input type="checkbox" checked={formIsSuperadmin} onChange={e => setFormIsSuperadmin(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: formIsSuperadmin ? '#c084fc' : 'rgba(255,255,255,0.1)', borderRadius: '24px', transition: '0.3s' }}>
                        <span style={{ position: 'absolute', height: '18px', width: '18px', left: formIsSuperadmin ? '22px' : '3px', bottom: '3px', backgroundColor: 'white', borderRadius: '50%', transition: '0.3s' }} />
                      </span>
                    </label>
                  </div>
                  
                  {!formIsSuperadmin && (
                    <div style={{ paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#e2e8f0', margin: 0 }}>Select Permitted Modules:</h3>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setFormPermissions(ASSIGNABLE_ADMIN_MODULES.map(m => m.id))}
                            style={{ fontSize: '0.72rem', padding: '4px 10px', background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormPermissions([])}
                            style={{ fontSize: '0.72rem', padding: '4px 10px', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
                        {['Core Operations', 'Sales & Marketing', 'Analytics & Content', 'System & AI'].map(group => {
                          const groupModules = ASSIGNABLE_ADMIN_MODULES.filter(m => m.group === group);
                          if (!groupModules.length) return null;
                          return (
                            <div key={group} style={{ marginBottom: '14px' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>{group}</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                                {groupModules.map(tab => {
                                  const isActive = formPermissions.includes(tab.id);
                                  return (
                                    <div
                                      key={tab.id}
                                      onClick={() => handleTogglePermission(tab.id)}
                                      style={{
                                        padding: '9px 10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                                        fontSize: '0.78rem', fontWeight: '600', transition: 'all 0.2s', userSelect: 'none',
                                        background: isActive ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.05)',
                                        color: isActive ? '#f8fafc' : '#cbd5e1',
                                        border: isActive ? '1px solid rgba(125, 211, 252, 0.55)' : '1px solid rgba(255,255,255,0.12)'
                                      }}
                                    >
                                      {isActive && <Check size={11} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />}
                                      {tab.label}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#475569' }}>
                        {formPermissions.length} of {ASSIGNABLE_ADMIN_MODULES.length} modules selected
                      </div>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button type="button" className="admin-btn" onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>Cancel</button>
                  <button type="submit" className="admin-btn admin-btn-primary" disabled={formLoading} style={{ minWidth: '120px', padding: '10px 24px', fontWeight: 'bold' }}>
                    {formLoading ? 'Saving...' : 'Save Member'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
