import React, { useState } from 'react';
import { Send, Users, Smartphone, Mail, AlertTriangle } from 'lucide-react';

export default function BroadcastsPanel() {
  const [audience, setAudience] = useState('all_customers');
  const [channels, setChannels] = useState({ whatsapp: true, email: false });
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState(null);

  const handleSendTest = async () => {
    if (!message) return alert("Please enter a message first.");
    const testNumber = prompt("Enter your test phone number (e.g., 50688888888) or email:");
    if (!testNumber) return;
    
    setIsSending(true);
    setResult(null);
    try {
      // Send a test payload to the broadcast API using a special audience
      const res = await fetch('/api/admin/broadcast', {
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
    if (!confirm(`Are you sure you want to broadcast this to ${audience}?`)) return;
    
    setIsSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience, channels, message })
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, text: `Broadcast initiated successfully. Queued ${data.queuedCount} messages.` });
        setMessage('');
      } else {
        setResult({ success: false, text: data.error || 'Failed to start broadcast.' });
      }
    } catch (err) {
      setResult({ success: false, text: err.message });
    }
    setIsSending(false);
  };

  return (
    <div className="admin-panel" style={{ padding: '24px', maxWidth: '800px' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Send size={24} color="#3b82f6" />
        Marketing Broadcasts
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
        Send bulk messages for Flash Sales, promotions, or general updates to your contacts.
      </p>

      {/* Configuration Section */}
      <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border)' }}>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Select Audience</label>
          <select 
            className="admin-input" 
            value={audience} 
            onChange={e => setAudience(e.target.value)}
            style={{ width: '100%', maxWidth: '400px' }}
          >
            <option value="all_customers">All Past Customers</option>
            <option value="abandoned_carts">Abandoned Carts (Not purchased yet)</option>
            <option value="all_leads">Everyone (Customers + Leads)</option>
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Select Channels</label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={channels.whatsapp} 
                onChange={e => setChannels({ ...channels, whatsapp: e.target.checked })}
              />
              <Smartphone size={16} color="#10b981" /> WhatsApp
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={channels.email} 
                onChange={e => setChannels({ ...channels, email: e.target.checked })}
              />
              <Mail size={16} color="#3b82f6" /> Email
            </label>
          </div>
        </div>

      </div>

      {/* Message Composer */}
      <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border)' }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', marginBottom: '8px' }}>
          <span>Message Composer</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
            Supports basic formatting (e.g. *bold* for WhatsApp)
          </span>
        </label>
        <textarea
          className="admin-input"
          style={{ width: '100%', minHeight: '150px', resize: 'vertical' }}
          placeholder="Hi there! We are running a 20% Flash Sale on Tirzepatide using code FLASH20..."
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        
        {/* Warning about meta limits */}
        {channels.whatsapp && (
          <div style={{ display: 'flex', gap: '8px', padding: '12px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', borderRadius: '8px', marginTop: '16px', fontSize: '0.85rem' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Meta / WhatsApp Limits:</strong> Remember that business accounts have tier limits (typically 250 or 1,000 marketing messages per day for new tiers). Going over may cause blocks.
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button 
          className="admin-btn" 
          onClick={handleSendTest}
          disabled={isSending || !message}
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
        >
          {isSending ? 'Sending...' : 'Send Test To Admin'}
        </button>
        <button 
          className="admin-btn" 
          onClick={handleBroadcast}
          disabled={isSending || !message || (!channels.whatsapp && !channels.email)}
          style={{ background: '#3b82f6', color: '#fff' }}
        >
          {isSending ? 'Broadcasting...' : 'Blast Broadcast Now'}
        </button>
      </div>

      {result && (
        <div style={{ 
          marginTop: '20px', 
          padding: '12px 16px', 
          borderRadius: '8px', 
          background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: result.success ? '#10b981' : '#ef4444',
          border: `1px solid ${result.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
        }}>
          {result.text}
        </div>
      )}
    </div>
  );
}
