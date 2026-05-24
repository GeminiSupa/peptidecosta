import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Edit2, Shield, Check } from 'lucide-react';

export default function TeamManagement({ currentUserProfile, currentUserEmail }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formName, setFormName] = useState('');
  const [formPermissions, setFormPermissions] = useState([]);
  const [formIsSuperadmin, setFormIsSuperadmin] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const AVAILABLE_TABS = [
    { id: 'spreadsheet', label: 'Products' },
    { id: 'orders', label: 'Orders' },
    { id: 'customers', label: 'Customers' },
    { id: 'leads', label: 'Leads' },
    { id: 'carts', label: 'Abandoned Carts' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'cms', label: 'Content (CMS)' }
  ];

  useEffect(() => {
    fetchUsers();
  }, []);

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

  const handleOpenModal = (user = null) => {
    setFormError('');
    if (user) {
      setEditingUserId(user.user_id);
      setFormEmail(user.email);
      setFormPassword(''); // don't show existing password
      setFormName(user.name || '');
      setFormPermissions(user.permissions || []);
      setFormIsSuperadmin(user.is_superadmin || false);
    } else {
      setEditingUserId(null);
      setFormEmail('');
      setFormPassword('');
      setFormName('');
      setFormPermissions([]);
      setFormIsSuperadmin(false);
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
        const res = await fetch('/api/admin/users/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: editingUserId,
            password: formPassword || undefined,
            name: formName,
            permissions: formPermissions,
            is_superadmin: formIsSuperadmin
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user');
      } else {
        // Create user
        if (!formPassword) throw new Error('Password is required for new users');
        const res = await fetch('/api/admin/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formEmail,
            password: formPassword,
            name: formName,
            permissions: formPermissions,
            is_superadmin: formIsSuperadmin
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create user');
      }
      
      setIsModalOpen(false);
      fetchUsers();
    } catch (err) {
      setFormError(err.message);
    }
    setFormLoading(false);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Are you sure you want to completely delete this user? This cannot be undone.")) return;
    
    try {
      const res = await fetch(`/api/admin/users/delete?userId=${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const isSuperAdmin = currentUserProfile?.is_superadmin || currentUserEmail === 'joe@peptides.com' || currentUserEmail === 'info@peptidescostarica.net';

  if (!isSuperAdmin) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Access Denied. Superadmin only.</div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Team Management</h2>
          <p style={{ color: '#94a3b8' }}>Manage admin users and their access permissions.</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Add User
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading team members...</div>
      ) : (
        <div className="table-responsive" style={{ background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <table className="spreadsheet-table">
            <thead>
              <tr>
                <th style={{ padding: '16px' }}>Name</th>
                <th style={{ padding: '16px' }}>Email</th>
                <th style={{ padding: '16px' }}>Role</th>
                <th style={{ padding: '16px' }}>Access</th>
                <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ padding: '16px', fontWeight: 'bold' }}>{u.name || 'N/A'}</td>
                  <td style={{ padding: '16px' }}>{u.email}</td>
                  <td style={{ padding: '16px' }}>
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
                  <td style={{ padding: '16px', fontSize: '0.8rem', color: '#94a3b8', maxWidth: '200px' }}>
                    {u.is_superadmin ? 'Full Access' : (u.permissions && u.permissions.length > 0 ? u.permissions.join(', ') : 'No Access')}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <button className="admin-btn" onClick={() => handleOpenModal(u)} style={{ marginRight: '8px', padding: '6px 10px' }}>
                      <Edit2 size={14} />
                    </button>
                    {u.user_id !== currentUserProfile.user_id && (
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name</label>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)} required className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)' }} placeholder="John Doe" />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                    <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} required={!editingUserId} disabled={!!editingUserId} className="admin-input" style={{ width: '100%', background: editingUserId ? 'rgba(255,255,255,0.02)' : '#0e1626', border: '1px solid rgba(255,255,255,0.1)', color: editingUserId ? '#64748b' : '#f8fafc' }} placeholder="john@example.com" />
                  </div>
                </div>
                
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                  <input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} required={!editingUserId} className="admin-input" style={{ width: '100%', background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)' }} placeholder={editingUserId ? "Leave blank to keep current password" : "Enter a secure temporary password"} />
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
