import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { Plus, Trash2, Edit2, Shield, Check } from 'lucide-react';
import AgentDashboard from './AgentDashboard';

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

  const AVAILABLE_TABS = [
    { id: 'home', label: 'Today (Home)' },
    { id: 'spreadsheet', label: 'Products' },
    { id: 'orders', label: 'Orders' },
    { id: 'customers', label: 'Customers' },
    { id: 'inquiries', label: 'Inquiries' },
    { id: 'leads', label: 'Leads' },
    { id: 'carts', label: 'Abandoned Carts' },
    { id: 'share', label: 'Share Links' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'facebook', label: 'Facebook Alerts' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'cms', label: 'Content (CMS)' },
    { id: 'whatsapp_ai', label: 'WhatsApp AI' },
  ];

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
        alert(`Successfully synced commissions for ${periodMsg} and generated pending payouts!`);
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
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Team Management</h2>
          <p style={{ color: '#94a3b8' }}>Manage admin users, commission rates, and payouts.</p>
        </div>
        {activeSubTab === 'members' ? (
          <button className="admin-btn admin-btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Add User
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
          </div>
        )}
      </div>

      {/* Sub-tab Toggle buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
        <button 
          onClick={() => setActiveSubTab('members')}
          className="admin-btn"
          style={{ 
            background: activeSubTab === 'members' ? '#38bdf8' : 'rgba(255,255,255,0.02)', 
            color: activeSubTab === 'members' ? '#0e1626' : '#94a3b8',
            border: '1px solid rgba(255,255,255,0.05)',
            fontWeight: 'bold',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          👥 Manage Members & Rates
        </button>
        <button 
          onClick={() => setActiveSubTab('payouts')}
          className="admin-btn"
          style={{ 
            background: activeSubTab === 'payouts' ? '#38bdf8' : 'rgba(255,255,255,0.02)', 
            color: activeSubTab === 'payouts' ? '#0e1626' : '#94a3b8',
            border: '1px solid rgba(255,255,255,0.05)',
            fontWeight: 'bold',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          💰 Commission Payouts
        </button>
      </div>

      {activeSubTab === 'members' ? (
        loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading team members...</div>
        ) : (
          <div className="table-responsive" style={{ background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <table className="spreadsheet-table responsive-table">
              <thead>
                <tr>
                  <th style={{ padding: '16px' }}>Name</th>
                  <th style={{ padding: '16px' }}>Email</th>
                  <th style={{ padding: '16px' }}>Role</th>
                  <th style={{ padding: '16px' }}>Base Salary</th>
                  <th style={{ padding: '16px' }}>Commission</th>
                  <th style={{ padding: '16px' }}>Access</th>
                  <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td data-label="Name" style={{ padding: '16px', fontWeight: 'bold' }}>{u.name || 'N/A'}</td>
                    <td data-label="Email" style={{ padding: '16px' }}>{u.email}</td>
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
                      <button className="admin-btn" onClick={() => handleOpenModal(u)} style={{ marginRight: '8px', padding: '6px 10px' }}>
                        <Edit2 size={14} />
                      </button>
                      {u.user_id !== currentUserProfile?.user_id && (
                        <button className="admin-btn" onClick={() => handleDelete(u.user_id)} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '6px 10px' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        loadingPayouts ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading payouts history...</div>
        ) : payouts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
            No commission payouts found. Click <strong>Run Commission Scan</strong> to check for weekly sales!
          </div>
        ) : (
          <div className="table-responsive" style={{ background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <table className="spreadsheet-table responsive-table">
              <thead>
                <tr>
                  <th style={{ padding: '16px' }}>Agent</th>
                  <th style={{ padding: '16px' }}>Period</th>
                  <th style={{ padding: '16px' }}>Gross Sales</th>
                  <th style={{ padding: '16px' }}>Rate</th>
                  <th style={{ padding: '16px' }}>Commission</th>
                  <th style={{ padding: '16px' }}>Status</th>
                  <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => {
                  const formattedPeriod = `${new Date(p.start_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} - ${new Date(p.end_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}`;
                  return (
                    <tr key={p.id}>
                      <td data-label="Agent" style={{ padding: '16px', fontWeight: 'bold' }}>
                        <div style={{ color: '#f8fafc' }}>{p.agent_name || 'N/A'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.agent_email}</div>
                      </td>
                      <td data-label="Period" style={{ padding: '16px', color: '#cbd5e1', fontSize: '0.85rem' }}>{formattedPeriod}</td>
                      <td data-label="Gross Sales" style={{ padding: '16px', fontSize: '0.85rem' }}>
                        <div style={{ color: '#cbd5e1' }}>USD: <span style={{ fontWeight: 'bold', color: '#f8fafc' }}>{formatMoneyUI(p.usd_sales, 'USD')}</span></div>
                        <div style={{ color: '#cbd5e1' }}>CRC: <span style={{ fontWeight: 'bold', color: '#f8fafc' }}>{formatMoneyUI(p.crc_sales, 'CRC')}</span></div>
                      </td>
                      <td data-label="Rate" style={{ padding: '16px', fontWeight: 'bold', color: '#38bdf8' }}>{p.commission_rate}%</td>
                      <td data-label="Commission" style={{ padding: '16px', fontSize: '0.85rem' }}>
                        <div style={{ color: '#c084fc', fontWeight: 'bold' }}>USD: {formatMoneyUI(p.usd_commission, 'USD')}</div>
                        <div style={{ color: '#c084fc', fontWeight: 'bold' }}>CRC: {formatMoneyUI(p.crc_commission, 'CRC')}</div>
                      </td>
                      <td data-label="Status" style={{ padding: '16px' }}>
                        {p.status === 'Pending' ? (
                          <span className="status-badge" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            Pending Approval
                          </span>
                        ) : p.status === 'Approved' ? (
                          <span className="status-badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            Approved
                          </span>
                        ) : (
                          <span className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            Rejected
                          </span>
                        )}
                      </td>
                      <td data-label="Actions" style={{ padding: '16px', textAlign: 'right' }}>
                        {p.status === 'Pending' ? (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button 
                              className="admin-btn"
                              disabled={actionLoadingId !== null}
                              onClick={() => handlePayoutAction(p.id, 'Approved')}
                              style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              {actionLoadingId === p.id ? '...' : <Check size={12} />} Approve & Send
                            </button>
                            <button 
                              className="admin-btn"
                              disabled={actionLoadingId !== null}
                              onClick={() => handlePayoutAction(p.id, 'Rejected')}
                              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 'bold' }}
                            >
                              Reject
                            </button>
                          </div>
                        ) : p.status === 'Approved' ? (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Approved on {new Date(p.approved_at).toLocaleDateString()}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                            Rejected
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
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
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)} required className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#38bdf8' }} placeholder="John Doe" />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                    <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} required={!editingUserId} disabled={!!editingUserId} className="admin-input" style={{ width: '100%', background: editingUserId ? 'rgba(255,255,255,0.02)' : '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: editingUserId ? '#64748b' : '#38bdf8' }} placeholder="john@example.com" />
                  </div>
                </div>
                
                <div className="admin-form-grid-2" style={{ marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                    <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} required={!editingUserId} className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#38bdf8' }} placeholder={editingUserId ? "Leave blank to keep current" : "Enter temporary password"} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commission Rate (%)</label>
                    <input type="number" min="0" max="100" step="0.1" value={formCommissionRate} onChange={e => setFormCommissionRate(parseFloat(e.target.value) || 0)} required className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#38bdf8' }} placeholder="e.g. 10.0" />
                  </div>
                </div>

                <div className="admin-form-grid-2" style={{ marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Base Weekly Salary</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select value={formSalaryCurrency} onChange={e => setFormSalaryCurrency(e.target.value)} className="admin-input" style={{ width: '90px', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#38bdf8' }}>
                        <option value="USD">USD</option>
                        <option value="CRC">CRC</option>
                      </select>
                      <input type="number" min="0" step="0.01" value={formWeeklySalary} onChange={e => setFormWeeklySalary(parseFloat(e.target.value) || 0)} className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#38bdf8' }} placeholder="e.g. 500.00" />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commission Structure Notes</label>
                    <input type="text" value={formCommissionStructure} onChange={e => setFormCommissionStructure(e.target.value)} className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: '#38bdf8' }} placeholder="e.g. 10% on Gross Sales" />
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
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#e2e8f0', margin: '0 0 12px 0' }}>Select Permitted Modules:</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                        {AVAILABLE_TABS.map(tab => {
                          const isActive = formPermissions.includes(tab.id);
                          return (
                            <div 
                              key={tab.id} 
                              onClick={() => handleTogglePermission(tab.id)}
                              style={{ 
                                padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                                fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s', userSelect: 'none',
                                background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                                color: isActive ? '#38bdf8' : '#64748b',
                                border: isActive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255,255,255,0.05)'
                              }}
                            >
                              {tab.label}
                            </div>
                          );
                        })}
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
