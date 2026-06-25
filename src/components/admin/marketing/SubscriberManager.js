"use client";

import React, { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { Users, Search, Plus, Download, UserPlus, Loader2 } from 'lucide-react';

export default function SubscriberManager() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSub, setNewSub] = useState({ email: '', first_name: '', last_name: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
              <th>Source</th>
              <th>Status</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="mkt-text-center mkt-text-muted"><Loader2 className="animate-spin" size={20} style={{display: 'inline-block', marginRight: '8px'}}/> Loading...</td></tr>
            ) : filteredSubs.length === 0 ? (
              <tr><td colSpan="4" className="mkt-text-center mkt-text-muted">No subscribers found.</td></tr>
            ) : (
              filteredSubs.map((sub) => (
                <tr key={sub.id}>
                  <td>
                    <div className="mkt-font-medium">{sub.email}</div>
                    <div className="mkt-text-xs mkt-text-muted">{sub.first_name} {sub.last_name}</div>
                  </td>
                  <td>
                    <span className="mkt-text-xs mkt-text-muted" style={{textTransform: 'capitalize'}}>{(sub.source || 'Website').replace('_', ' ')}</span>
                  </td>
                  <td>
                    <span className={`mkt-badge ${sub.status === 'subscribed' ? 'mkt-badge-success' : sub.status === 'unsubscribed' ? 'mkt-badge-warning' : 'mkt-badge-neutral'}`}>
                      {sub.status}
                    </span>
                  </td>
                  <td className="mkt-text-xs mkt-text-muted">
                    {new Date(sub.created_at).toLocaleDateString()}
                  </td>
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
