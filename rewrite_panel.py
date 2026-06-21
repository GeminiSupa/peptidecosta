import re

with open('src/components/admin/BroadcastsPanel.js', 'r') as f:
    content = f.read()

# 1. Imports
content = content.replace("import React, { useState } from 'react';", "import React, { useState, useEffect } from 'react';")
content = content.replace("import { Send, Users, Smartphone, Mail, AlertTriangle, Sparkles, Loader } from 'lucide-react';", "import { Send, Users, Smartphone, Mail, AlertTriangle, Sparkles, Loader, Calendar, Trash2 } from 'lucide-react';")

# 2. States
state_orig = """  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);"""
state_new = """  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledBroadcasts, setScheduledBroadcasts] = useState([]);
  const [isSending, setIsSending] = useState(false);"""
content = content.replace(state_orig, state_new)

# 3. Use Effect
effect_orig = """  const handleDraftAI = async () => {"""
effect_new = """  const fetchScheduled = async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      const { data } = await supabase.from('scheduled_broadcasts').select('*').eq('status', 'pending').order('scheduled_at', { ascending: true });
      if (data) setScheduledBroadcasts(data);
    } catch (e) {
      console.error('Failed to fetch scheduled broadcasts', e);
    }
  };

  useEffect(() => {
    fetchScheduled();
  }, []);

  const handleDeleteScheduled = async (id) => {
    if (!window.confirm("Delete this scheduled broadcast?")) return;
    try {
      const res = await adminFetch(`/api/admin/broadcast?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchScheduled();
    } catch(err) {
      alert("Error deleting: " + err.message);
    }
  };

  const handleDraftAI = async () => {"""
content = content.replace(effect_orig, effect_new)

# 4. handleBroadcast Payload
broadcast_orig = """        body: JSON.stringify({ 
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
      } else {"""
broadcast_new = """        body: JSON.stringify({ 
          audience, 
          customContacts: audience === 'custom' ? customContacts : undefined,
          channels, 
          message,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null
        })
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, text: data.text || `Broadcast initiated successfully. Queued ${data.queuedCount} messages.` });
        if (audience === 'custom') setCustomContacts('');
        setScheduledAt('');
        fetchScheduled();
      } else {"""
content = content.replace(broadcast_orig, broadcast_new)

# 5. UI elements (Delivery Channels box to add Scheduled Picker)
ui_orig = """            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#f8fafc' }}>
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

      </div>"""
ui_new = """            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#f8fafc' }}>
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

        <div>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px', color: '#e2e8f0', fontSize: '0.95rem' }}>Schedule Time (Optional)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#0f172a', padding: '8px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
            <Calendar size={18} color="#94a3b8" />
            <input 
              type="datetime-local" 
              className="admin-input"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              style={{ flexGrow: 1, background: 'transparent', border: 'none', color: '#f8fafc', padding: 0 }}
            />
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>Leave empty to blast immediately.</p>
        </div>

      </div>"""
content = content.replace(ui_orig, ui_new)

# 6. Blast Button
btn_orig = """{isSending ? 'Broadcasting...' : 'Blast Broadcast Now'}"""
btn_new = """{isSending ? (scheduledAt ? 'Scheduling...' : 'Broadcasting...') : (scheduledAt ? 'Schedule Broadcast' : 'Blast Broadcast Now')}"""
content = content.replace(btn_orig, btn_new)

# 7. Scheduled List Footer
footer_orig = """      {result && (
        <div style={{ 
          marginTop: '24px', """
footer_new = """      {result && (
        <div style={{ 
          marginTop: '24px', """
# We want to append the scheduled list before the final closing div
final_div = "    </div>\n  );\n}"
scheduled_list = """      {scheduledBroadcasts.length > 0 && (
        <div style={{ marginTop: '32px', padding: '24px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', border: '1px solid rgba(56, 189, 248, 0.15)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="#38bdf8" /> Scheduled Broadcasts
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {scheduledBroadcasts.map(sb => (
              <div key={sb.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', padding: '12px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '0.9rem' }}>
                      {new Date(sb.scheduled_at).toLocaleString()}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                      To: {sb.audience.replace('_', ' ')} {sb.channels?.whatsapp ? '(WA)' : ''} {sb.channels?.email ? '(Email)' : ''}
                    </span>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sb.message}
                  </div>
                </div>
                <button 
                  onClick={() => handleDeleteScheduled(sb.id)}
                  style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '8px' }}
                  title="Delete Scheduled Broadcast"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
"""
content = content.replace(final_div, scheduled_list + final_div)

with open('src/components/admin/BroadcastsPanel.js', 'w') as f:
    f.write(content)
