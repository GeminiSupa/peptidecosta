"use client";

import React, { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { Users, Search, Plus, Download, UserPlus, Loader2, Edit2, Check, X, Upload } from 'lucide-react';

export default function SubscriberManager() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSub, setNewSub] = useState({ email: '', first_name: '', last_name: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchSubscribers();
  }, []);

  const fetchSubscribers = async () => {
    try {
      setLoading(true);
      const res = await adminFetch('/api/admin/subscribers');
      if (res.subscribers) {
        setSubscribers(res.subscribers);
      }
    } catch (err) {
      console.error('Failed to fetch subscribers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubscriber = async (e) => {
    e.preventDefault();
    if (!newSub.email) return;
    
    setIsSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/subscribers', {
        method: 'POST',
        body: JSON.stringify({ ...newSub, source: 'admin_manual' })
      });
      
      if (res.error) throw new Error(res.error);
      
      alert('Subscriber added successfully!');
      setShowAddModal(false);
      setNewSub({ email: '', first_name: '', last_name: '' });
      fetchSubscribers();
    } catch (err) {
      alert('Failed to add subscriber: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (sub) => {
    setEditingId(sub.id);
    setEditForm({ 
      ...sub,
      tags_raw: sub.tags ? sub.tags.join(', ') : ''
    });
  };

  const saveEdit = async () => {
    try {
      const tagsArray = editForm.tags_raw 
        ? editForm.tags_raw.split(',').map(t => t.trim()).filter(t => t) 
        : [];

      const res = await adminFetch('/api/admin/subscribers', {
        method: 'PUT',
        body: JSON.stringify({
          id: editingId,
          email: editForm.email,
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          status: editForm.status,
          tags: tagsArray
        })
      });
      if (res.error) throw new Error(res.error);
      
      setEditingId(null);
      fetchSubscribers();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
  };

  const handleBulkImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      const rows = text.split('\n').filter(r => r.trim() !== '');
      
      // Basic CSV parsing assuming format: email,first_name,last_name
      // Skip header if first row has 'email'
      const startIdx = rows[0].toLowerCase().includes('email') ? 1 : 0;
      
      const parsedSubscribers = [];
      for (let i = startIdx; i < rows.length; i++) {
        const columns = rows[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (columns[0]) {
          parsedSubscribers.push({
            email: columns[0],
            first_name: columns[1] || '',
            last_name: columns[2] || '',
          });
        }
      }

      if (parsedSubscribers.length === 0) {
        alert('No valid rows found in CSV. Make sure the first column is email addresses.');
        return;
      }

      if (!confirm(`Found ${parsedSubscribers.length} subscribers. Import them now?`)) {
        e.target.value = '';
        return;
      }

      setLoading(true);
      try {
        const res = await adminFetch('/api/admin/subscribers', {
          method: 'POST',
          body: JSON.stringify({ bulk: true, subscribers: parsedSubscribers })
        });
        
        if (res.error) throw new Error(res.error);
        alert(`Successfully imported ${res.count} subscribers!`);
        fetchSubscribers();
      } catch (err) {
        alert('Bulk import failed: ' + err.message);
        setLoading(false);
      }
      e.target.value = ''; // Reset input
    };
    reader.readAsText(file);
  };

  const filteredSubs = subscribers.filter(s => 
    s.email.toLowerCase().includes(search.toLowerCase()) || 
    (s.first_name && s.first_name.toLowerCase().includes(search.toLowerCase())) ||
    (s.last_name && s.last_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* Top Actions */}
      <div className="mkt-flex mkt-justify-between mkt-items-center mkt-mb-6" style={{flexWrap: 'wrap', gap: '16px'}}>
        <div className="mkt-flex mkt-items-center mkt-gap-4" style={{ flex: 1, minWidth: '250px' }}>
          <div style={{position: 'relative', width: '100%', maxWidth: '300px'}}>
            <Search size={16} style={{position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)'}} />
            <input 
              type="text" 
              placeholder="Search subscribers..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mkt-input"
              style={{paddingLeft: '36px'}}
            />
          </div>
        </div>
        
        <div className="mkt-flex mkt-gap-2">
          <input 
            type="file" 
            accept=".csv" 
            id="csv-upload" 
            style={{display: 'none'}} 
            onChange={handleBulkImport} 
          />
          <label htmlFor="csv-upload" className="mkt-btn" style={{cursor: 'pointer'}}>
            <Upload size={16} />
            Import CSV
          </label>
          <button className="mkt-btn">
            <Download size={16} />
            Export CSV
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="mkt-btn mkt-btn-primary"
          >
            <Plus size={16} />
            Add Subscriber
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="mkt-table-wrapper">
        <table className="mkt-table">
          <thead>
            <tr>
              <th>Subscriber</th>
              <th>Tags</th>
              <th>Status</th>
              <th>Added</th>
              <th style={{textAlign: 'right'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="mkt-text-center mkt-text-muted"><Loader2 className="animate-spin" size={20} style={{display: 'inline-block', marginRight: '8px'}}/> Loading...</td></tr>
            ) : filteredSubs.length === 0 ? (
              <tr><td colSpan="5" className="mkt-text-center mkt-text-muted">No subscribers found.</td></tr>
            ) : (
              filteredSubs.map((sub) => (
                <tr key={sub.id}>
                  {editingId === sub.id ? (
                    <>
                      <td>
                        <input type="email" className="mkt-input" style={{padding: '6px 10px', marginBottom: '4px'}} value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
                        <div className="mkt-flex mkt-gap-2">
                          <input type="text" placeholder="First Name" className="mkt-input" style={{padding: '6px 10px', fontSize: '12px'}} value={editForm.first_name || ''} onChange={e => setEditForm({...editForm, first_name: e.target.value})} />
                          <input type="text" placeholder="Last Name" className="mkt-input" style={{padding: '6px 10px', fontSize: '12px'}} value={editForm.last_name || ''} onChange={e => setEditForm({...editForm, last_name: e.target.value})} />
                        </div>
                      </td>
                      <td>
                        <input type="text" placeholder="Tags (comma separated)" className="mkt-input" style={{padding: '6px 10px', fontSize: '12px'}} value={editForm.tags_raw || ''} onChange={e => setEditForm({...editForm, tags_raw: e.target.value})} />
                      </td>
                      <td>
                        <select className="mkt-input" style={{padding: '6px 10px', width: 'auto'}} value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                          <option value="subscribed">Subscribed</option>
                          <option value="unsubscribed">Unsubscribed</option>
                        </select>
                      </td>
                      <td className="mkt-text-xs mkt-text-muted">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </td>
                      <td style={{textAlign: 'right'}}>
                        <div className="mkt-flex mkt-justify-end mkt-gap-2">
                          <button onClick={() => setEditingId(null)} style={{background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '6px', borderRadius: '6px', cursor: 'pointer'}}><X size={14} /></button>
                          <button onClick={saveEdit} style={{background: 'rgba(16,185,129,0.2)', border: 'none', color: '#34d399', padding: '6px', borderRadius: '6px', cursor: 'pointer'}}><Check size={14} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className="mkt-font-medium">{sub.email}</div>
                        <div className="mkt-text-xs mkt-text-muted">{sub.first_name} {sub.last_name}</div>
                      </td>
                      <td>
                        {sub.tags && sub.tags.length > 0 ? (
                          <div className="mkt-flex mkt-gap-1" style={{flexWrap: 'wrap'}}>
                            {sub.tags.map(t => <span key={t} style={{background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px'}}>{t}</span>)}
                          </div>
                        ) : (
                          <span className="mkt-text-xs mkt-text-muted">No tags</span>
                        )}
                      </td>
                      <td>
                        <span className={`mkt-badge ${sub.status === 'subscribed' ? 'mkt-badge-success' : sub.status === 'unsubscribed' ? 'mkt-badge-warning' : 'mkt-badge-neutral'}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="mkt-text-xs mkt-text-muted">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </td>
                      <td style={{textAlign: 'right'}}>
                        <button onClick={() => startEdit(sub)} style={{background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px'}} title="Edit Subscriber">
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div style={{position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
          <div style={{background: '#1a1f2c', padding: '32px', borderRadius: '16px', width: '100%', maxWidth: '400px', border: '1px solid rgba(255,255,255,0.1)'}}>
            <h3 className="mkt-title mkt-mb-6">
              <UserPlus size={20} /> Add Subscriber
            </h3>
            
            <form onSubmit={handleAddSubscriber}>
              <div className="mkt-input-group">
                <label className="mkt-label">Email Address *</label>
                <input 
                  type="email" 
                  required
                  value={newSub.email}
                  onChange={e => setNewSub({...newSub, email: e.target.value})}
                  className="mkt-input"
                />
              </div>
              <div className="mkt-flex mkt-gap-4 mkt-mb-6">
                <div className="mkt-flex-1">
                  <label className="mkt-label">First Name</label>
                  <input 
                    type="text" 
                    value={newSub.first_name}
                    onChange={e => setNewSub({...newSub, first_name: e.target.value})}
                    className="mkt-input"
                  />
                </div>
                <div className="mkt-flex-1">
                  <label className="mkt-label">Last Name</label>
                  <input 
                    type="text" 
                    value={newSub.last_name}
                    onChange={e => setNewSub({...newSub, last_name: e.target.value})}
                    className="mkt-input"
                  />
                </div>
              </div>
              
              <div className="mkt-flex mkt-justify-end mkt-gap-2 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="mkt-btn"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="mkt-btn mkt-btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
