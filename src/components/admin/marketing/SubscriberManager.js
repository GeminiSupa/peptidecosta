"use client";

import React, { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { Users, Search, Plus, Trash2, Mail, Loader2, Download } from 'lucide-react';

export default function SubscriberManager() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // New subscriber form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
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
    if (!newEmail) return;
    
    setIsSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/subscribers', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          first_name: newFirstName,
          last_name: newLastName,
          source: 'manual'
        })
      });
      
      if (res.error) {
        alert(res.error);
      } else if (res.subscriber) {
        setSubscribers([res.subscriber, ...subscribers]);
        setShowAddForm(false);
        setNewEmail('');
        setNewFirstName('');
        setNewLastName('');
      }
    } catch (err) {
      console.error('Failed to add subscriber:', err);
      alert('Error adding subscriber');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = subscribers.filter(s => 
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.first_name && s.first_name.toLowerCase().includes(search.toLowerCase())) ||
    (s.last_name && s.last_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <input
            type="text"
            placeholder="Search subscribers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>
        
        <div className="flex gap-2">
          <button 
            className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white font-medium flex items-center gap-2 transition-colors"
            onClick={() => alert("CSV Export coming soon")}
          >
            <Download size={16} />
            Export
          </button>
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
          >
            <Plus size={18} />
            Add Subscriber
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddSubscriber} className="bg-black/20 border border-emerald-500/30 rounded-xl p-5 grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4">
          <div>
            <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider font-semibold">Email *</label>
            <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white" placeholder="john@example.com" />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider font-semibold">First Name</label>
            <input type="text" value={newFirstName} onChange={e => setNewFirstName(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white" placeholder="John" />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1 uppercase tracking-wider font-semibold">Last Name</label>
            <input type="text" value={newLastName} onChange={e => setNewLastName(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white" placeholder="Doe" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={isSubmitting} className="w-full h-[42px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold flex items-center justify-center disabled:opacity-50">
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Save Subscriber'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 flex justify-center text-emerald-400">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="bg-black/20 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="p-4 font-semibold text-white/60 text-sm">Subscriber</th>
                <th className="p-4 font-semibold text-white/60 text-sm hidden md:table-cell">Source</th>
                <th className="p-4 font-semibold text-white/60 text-sm hidden sm:table-cell">Status</th>
                <th className="p-4 font-semibold text-white/60 text-sm text-right">Added</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-white/40">
                    No subscribers found.
                  </td>
                </tr>
              ) : (
                filtered.map((sub, i) => (
                  <tr key={sub.id || i} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">
                          {sub.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white font-medium">{sub.email}</div>
                          {(sub.first_name || sub.last_name) && (
                            <div className="text-white/50 text-sm">{sub.first_name} {sub.last_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell text-white/60 text-sm capitalize">
                      {sub.source?.replace('_', ' ')}
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                        sub.status === 'subscribed' ? 'bg-emerald-500/20 text-emerald-400' :
                        sub.status === 'bounced' ? 'bg-red-500/20 text-red-400' :
                        'bg-white/10 text-white/60'
                      }`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="p-4 text-right text-white/50 text-sm">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
