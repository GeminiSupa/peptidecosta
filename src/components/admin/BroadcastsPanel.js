import React, { useState } from 'react';
import { Send, Users, Smartphone, Mail, AlertTriangle, Sparkles, Loader } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

export default function BroadcastsPanel() {
  const [audience, setAudience] = useState('all_customers');
  const [customContacts, setCustomContacts] = useState('');
  const [channels, setChannels] = useState({ whatsapp: true, email: false });
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [result, setResult] = useState(null);

  const handleDraftAI = async () => {
    const prompt = window.prompt("What is this broadcast about? (e.g. '20% flash sale on Tirzepatide using code FLASH20')");
    if (!prompt) return;

    setIsDrafting(true);
    try {
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'draft_broadcast',
          context: { prompt }
        })
      });
      const data = await res.json();
      if (data.success && data.text) {
        setMessage(data.text);
      } else {
        alert(data.error || 'Failed to generate draft.');
      }
    } catch (err) {
      alert('Error generating draft: ' + err.message);
    }
    setIsDrafting(false);
  };

  const handleSendTest = async () => {
    if (!message) return alert("Please enter a message first.");
    const testNumber = window.prompt("Enter your test phone number (e.g., 50688888888) or email:");
    if (!testNumber) return;
    
    setIsSending(true);
    setResult(null);
    try {
      const res = await adminFetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          audience: 'test',
          testContact: testNumber,
          channels,
          message: `[TEST BROADCAST]\n${message}`
        })
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, text: 'Test broadcast sent successfully!' });
      } else {
        setResult({ success: false, text: data.error || 'Failed to send test.' });
      }
    } catch (err) {
      setResult({ success: false, text: err.message });
    }
    setIsSending(false);
  };

  const handleBroadcast = async () => {
    if (!message) return alert("Please enter a message first.");
    if (audience === 'custom' && !customContacts.trim()) return alert("Please enter custom contacts.");
    if (!window.confirm(`Are you sure you want to broadcast this to ${audience === 'custom' ? 'your custom list' : audience}?`)) return;
    
    setIsSending(true);
    setResult(null);
    try {
      const res = await adminFetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          audience, 
          customContacts: audience === 'custom' ? customContacts : undefined,
          channels, 
          message 
        })
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, text: `Broadcast initiated successfully. Queued ${data.queuedCount} messages.` });
        if (audience === 'custom') setCustomContacts('');
      } else {
        setResult({ success: false, text: data.error || 'Failed to start broadcast.' });
      }
    } catch (err) {
      setResult({ success: false, text: err.message });
    }
    setIsSending(false);
  };

  return (
    <div className="admin-panel" style={{ padding: '24px', maxWidth: '850px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px', color: '#f8fafc' }}>
            <Send size={28} color="#38bdf8" />
            Marketing Broadcasts
          </h2>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.95rem' }}>
            Send bulk messages for Flash Sales, promotions, or general updates to your contacts.
          </p>
        </div>
      </div>

      {/* Configuration Section */}
      <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid rgba(56, 189, 248, 0.15)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        
        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px', color: '#e2e8f0', fontSize: '0.95rem' }}>Target Audience</label>
          <select 
            className="admin-input" 
            value={audience} 
            onChange={e => setAudience(e.target.value)}
            style={{ width: '100%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }}
          >
            <option value="all_customers">All Past Customers</option>
            <option value="abandoned_carts">Abandoned Carts (Not purchased yet)</option>
            <option value="all_leads">Everyone (Customers + Leads)</option>
            <option value="custom">Custom List (Manual Entry)</option>
          </select>

          {audience === 'custom' && (
            <div style={{ marginTop: '12px' }}>
              <textarea 
                className="admin-input"
                placeholder="Paste phone numbers (50688888888) or emails here, separated by commas or newlines..."
                value={customContacts}
                onChange={e => setCustomContacts(e.target.value)}
                style={{ width: '100%', minHeight: '80px', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', resize: 'vertical', fontSize: '0.85rem' }}
              />
            </div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px', color: '#e2e8f0', fontSize: '0.95rem' }}>Delivery Channels</label>
          <div style={{ display: 'flex', gap: '20px', background: '#0f172a', padding: '12px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#f8fafc' }}>
              <input 
                type="checkbox" 
                checked={channels.whatsapp} 
                onChange={e => setChannels({ ...channels, whatsapp: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
              />
              <Smartphone size={18} color="#10b981" /> WhatsApp
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#f8fafc' }}>
              <input 
                type="checkbox" 
                checked={channels.email} 
                onChange={e => setChannels({ ...channels, email: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: '#38bdf8' }}
              />
              <Mail size={18} color="#38bdf8" /> Email
            </label>
          </div>
        </div>

      </div>

      {/* Message Composer */}
      <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <label style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '1.05rem' }}>Message Composer</label>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Supports {"{{name}}"} and *bold*</span>
            <button 
              onClick={handleDraftAI}
              disabled={isDrafting}
              className="admin-btn"
              style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', border: 'none' }}
            >
              {isDrafting ? <Loader size={14} className="spin" /> : <Sparkles size={14} />} 
              {isDrafting ? 'Drafting...' : 'AI Draft'}
            </button>
          </div>
        </div>
        
        <textarea
          className="admin-input"
          style={{ width: '100%', minHeight: '200px', resize: 'vertical', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', padding: '16px', fontSize: '0.95rem', lineHeight: '1.5' }}
          placeholder="Hi {{name}}! We are running a 20% Flash Sale on Tirzepatide using code FLASH20..."
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        
        {/* Warning about meta limits */}
        {channels.whatsapp && (
          <div style={{ display: 'flex', gap: '12px', padding: '16px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#fbbf24', borderRadius: '12px', marginTop: '16px', fontSize: '0.9rem' }}>
            <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ display: 'block', marginBottom: '4px', color: '#fcd34d' }}>Meta / WhatsApp Capacity Limits</strong>
              Remember that WhatsApp Business API has tier limits (usually 250 or 1,000 marketing messages per day for new tiers). Keep your audiences segmented to avoid rate limits.
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button 
          className="admin-btn" 
          onClick={handleSendTest}
          disabled={isSending || !message}
          style={{ background: 'rgba(51, 65, 85, 0.8)', color: '#f8fafc', border: '1px solid #475569', padding: '12px 24px', fontSize: '0.95rem', borderRadius: '8px' }}
        >
          {isSending ? 'Sending...' : 'Send Test To Admin'}
        </button>
        <button 
          className="admin-btn" 
          onClick={handleBroadcast}
          disabled={isSending || !message || (!channels.whatsapp && !channels.email)}
          style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '12px 32px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '8px', boxShadow: '0 4px 14px rgba(14, 165, 233, 0.3)' }}
        >
          {isSending ? 'Broadcasting...' : 'Blast Broadcast Now'}
        </button>
      </div>

      {result && (
        <div style={{ 
          marginTop: '24px', 
          padding: '16px', 
          borderRadius: '12px', 
          background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: result.success ? '#34d399' : '#f87171',
          border: `1px solid ${result.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          {result.success ? '✅' : '❌'} {result.text}
        </div>
      )}
    </div>
  );
}
