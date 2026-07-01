import React, { useState, useEffect } from 'react';
import { Send, Users, Smartphone, Mail, AlertTriangle, Sparkles, Loader, Calendar, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminApi';

export default function BroadcastsPanel({ products = [] }) {
  const [audience, setAudience] = useState('all_customers');
  const [customContacts, setCustomContacts] = useState('');
  const [channels, setChannels] = useState({ whatsapp: true, email: false });
  const [message, setMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledBroadcasts, setScheduledBroadcasts] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [result, setResult] = useState(null);
  const [targetProducts, setTargetProducts] = useState([]);

  // Banners State
  const [banners, setBanners] = useState([]);
  const [newBannerEn, setNewBannerEn] = useState('');
  const [newBannerEs, setNewBannerEs] = useState('');
  const [bannersLoading, setBannersLoading] = useState(true);

  const loadBanners = async () => {
    try {
      setBannersLoading(true);
      const res = await adminFetch('/api/admin/banners');
      const data = await res.json();
      if (data.banners) setBanners(data.banners);
    } catch (e) {
      console.error('Failed to load banners', e);
    } finally {
      setBannersLoading(false);
    }
  };

  const saveBanners = async (updatedBanners) => {
    try {
      const res = await adminFetch('/api/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banners: updatedBanners })
      });
      if (res.ok) setBanners(updatedBanners);
    } catch (e) {
      alert('Error saving banners: ' + e.message);
    }
  };

  const [editingBannerId, setEditingBannerId] = useState(null);

  const handleCreateOrUpdateBanner = () => {
    if (!newBannerEn || !newBannerEs) return alert('Please fill both EN and ES text');
    if (editingBannerId) {
      const updated = banners.map(b => b.id === editingBannerId ? { ...b, textEn: newBannerEn, textEs: newBannerEs } : b);
      saveBanners(updated);
      setEditingBannerId(null);
    } else {
      const newBanner = {
        id: Date.now().toString(),
        textEn: newBannerEn,
        textEs: newBannerEs,
        isActive: false
      };
      saveBanners([...banners, newBanner]);
    }
    setNewBannerEn('');
    setNewBannerEs('');
  };

  const startEditBanner = (b) => {
    setNewBannerEn(b.textEn);
    setNewBannerEs(b.textEs);
    setEditingBannerId(b.id);
  };
  
  const cancelEditBanner = () => {
    setNewBannerEn('');
    setNewBannerEs('');
    setEditingBannerId(null);
  };

  const handleDeleteBanner = (id) => {
    if (!window.confirm("Delete this banner?")) return;
    saveBanners(banners.filter(b => b.id !== id));
  };

  const handleToggleBanner = (id) => {
    // Allow multiple banners to be active at once
    const updated = banners.map(b => ({
      ...b,
      isActive: b.id === id ? !b.isActive : b.isActive
    }));
    saveBanners(updated);
  };

  const fetchScheduled = async () => {
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
    loadBanners();
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
          channels: { ...channels, emailSubject },
          message: `[TEST BROADCAST]\n${message}`,
          whatsappTemplateName: channels.whatsappTemplateName || undefined
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
          channels: { ...channels, emailSubject }, 
          message,
          whatsappTemplateName: channels.whatsappTemplateName || undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          enableBatching: channels.whatsapp // Automatically batch whatsapp to avoid limits
        })
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, text: data.text || `Broadcast initiated successfully. Queued ${data.queuedCount} messages.` });
        if (audience === 'custom') setCustomContacts('');
        setScheduledAt('');
        fetchScheduled();
      } else {
        setResult({ success: false, text: data.error || 'Failed to start broadcast.' });
      }
    } catch (err) {
      setResult({ success: false, text: err.message });
    }
    setIsSending(false);
  };

  return (
    <div className="admin-panel admin-broadcasts-panel admin-tab-panel">
      <div className="admin-section-header" style={{ marginBottom: '24px' }}>
        <div>
          <h2 className="admin-section-title" style={{ fontSize: '1.75rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Send size={28} color="#38bdf8" />
            Marketing Broadcasts
          </h2>
          <p className="admin-page-subtitle" style={{ margin: 0, fontSize: '0.95rem' }}>
            Send bulk messages for Flash Sales, promotions, or general updates to your contacts.
          </p>
        </div>
      </div>

      {/* Announcement Banners Section */}
      <div className="admin-broadcasts-section" style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} /> Announcement Banners Manager
        </h3>
        
        {/* Create Banner */}
        <div style={{ display: 'grid', gap: '12px', marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>English Banner Text (Use {'{{usd_200}}'} for dynamic currency)</label>
            <input type="text" value={newBannerEn} onChange={e => setNewBannerEn(e.target.value)} className="admin-input" placeholder="e.g. Free shipping over {{usd_200}}!" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Spanish Banner Text (Use {'{{usd_200}}'} for dynamic currency)</label>
            <input type="text" value={newBannerEs} onChange={e => setNewBannerEs(e.target.value)} className="admin-input" placeholder="e.g. ¡Envío gratis superior a {{usd_200}}!" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={handleCreateOrUpdateBanner} style={{ flex: 1, padding: '8px 16px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              {editingBannerId ? 'Save Changes' : '+ Create New Banner'}
            </button>
            {editingBannerId && (
              <button type="button" onClick={cancelEditBanner} style={{ padding: '8px 16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* List Banners */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
          {bannersLoading ? <p style={{ color: '#94a3b8' }}>Loading banners...</p> : banners.length === 0 ? <p style={{ color: '#94a3b8' }}>No banners saved.</p> : banners.map(banner => (
            <div key={banner.id} className="admin-broadcasts-banner-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: `1px solid ${banner.isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.05)'}` }}>
              <div>
                <div style={{ color: '#f8fafc', fontSize: '0.9rem', marginBottom: '4px' }}>🇺🇸 {banner.textEn}</div>
                <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>🇪🇸 {banner.textEs}</div>
                {banner.isActive && <div style={{ display: 'inline-block', marginTop: '8px', padding: '2px 8px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' }}>LIVE ON SITE</div>}
              </div>
              <div className="admin-broadcasts-banner-actions" style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => handleToggleBanner(banner.id)} style={{ padding: '8px', background: banner.isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)', color: banner.isActive ? '#10b981' : '#94a3b8', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  {banner.isActive ? 'Deactivate' : 'Set Active'}
                </button>
                <button type="button" onClick={() => startEditBanner(banner)} style={{ padding: '8px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  Edit
                </button>
                <button type="button" onClick={() => handleDeleteBanner(banner.id)} style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flash Sale Generator Section */}
      <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px dashed rgba(16, 185, 129, 0.3)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} /> Quick Flash Sale Generator
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Promo Code Name</label>
            <input type="text" id="flash-code" className="admin-input" placeholder="e.g. FATHERSDAY" style={{ width: '100%', textTransform: 'uppercase' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Discount %</label>
            <select id="flash-discount" className="admin-input" style={{ width: '100%' }}>
              <option value="0.10">10% Off</option>
              <option value="0.15">15% Off</option>
              <option value="0.20">20% Off</option>
              <option value="0.25">25% Off</option>
              <option value="0.30">30% Off</option>
              <option value="0.40">40% Off</option>
              <option value="0.50">50% Off</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>
              Target Products (Select multiple, or leave unselected for all products)
            </label>
            <div 
              className="admin-input" 
              style={{ width: '100%', maxHeight: '180px', overflowY: 'auto', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
            >
              {products.map(p => (
                <label key={p.id || p.product} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc', transition: 'background 0.2s' }}>
                  <input 
                    type="checkbox" 
                    style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                    checked={targetProducts.includes(p.product)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setTargetProducts([...targetProducts, p.product]);
                      } else {
                        setTargetProducts(targetProducts.filter(item => item !== p.product));
                      }
                    }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: targetProducts.includes(p.product) ? 'bold' : 'normal', color: targetProducts.includes(p.product) ? '#34d399' : '#e2e8f0' }}>
                    {p.product}
                  </span>
                </label>
              ))}
              {products.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px' }}>No products found...</div>}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Valid From (Optional)</label>
            <input type="datetime-local" id="flash-valid-from" className="admin-input" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Valid Until (Optional)</label>
            <input type="datetime-local" id="flash-valid-until" className="admin-input" style={{ width: '100%' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button
              onClick={async () => {
                const code = document.getElementById('flash-code').value;
                const discount_pct = parseFloat(document.getElementById('flash-discount').value);
                const target_product = targetProducts.join(', ');
                const valid_from = document.getElementById('flash-valid-from').value;
                const valid_until = document.getElementById('flash-valid-until').value;
                if (!code) return alert('Enter a promo code name');
                try {
                  const res = await adminFetch('/api/admin/promo/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      code, 
                      discount_pct, 
                      is_flash_sale: !!target_product, 
                      target_product,
                      valid_from: valid_from ? new Date(valid_from).toISOString() : null,
                      valid_until: valid_until ? new Date(valid_until).toISOString() : null
                    })
                  });
                  const data = await res.json();
                  if (res.ok) {
                    alert(`✅ Flash Sale promo code ${code} created successfully!`);
                    setMessage(prev => `${prev}\n\nUse code ${code} at checkout for ${discount_pct * 100}% off!`.trim());
                  } else {
                    alert(`❌ Failed to create promo code: ${data.error}`);
                  }
                } catch(err) {
                  alert(`❌ Error: ${err.message}`);
                }
              }}
              className="admin-btn"
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Generate & Insert Into Message
            </button>
          </div>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="admin-broadcasts-section admin-broadcasts-audience" style={{ background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', marginBottom: '24px', border: '1px solid rgba(56, 189, 248, 0.15)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        
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
            <option value="leads_7_days">Recent Leads (Last 7 Days)</option>
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
          <div className="admin-broadcasts-channels" style={{ display: 'flex', gap: '20px', background: '#0f172a', padding: '12px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
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
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>Leave empty to blast immediately. Note: Large lists (&gt;200) will be safely auto-batched over multiple days to protect your Meta API limits.</p>
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
        
        {channels.email && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: '#e2e8f0', fontSize: '0.95rem' }}>Email Subject</label>
            <input 
              type="text"
              className="admin-input"
              style={{ width: '100%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', padding: '12px 16px', borderRadius: '8px', fontSize: '0.95rem' }}
              placeholder="e.g. Flash Sale! Exclusive Offer Inside"
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
            />
          </div>
        )}

        {channels.whatsapp && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: '#e2e8f0', fontSize: '0.95rem' }}>Meta WhatsApp Template (Optional)</label>
            <input 
              type="text"
              className="admin-input"
              style={{ width: '100%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', padding: '12px 16px', borderRadius: '8px', fontSize: '0.95rem' }}
              placeholder="e.g. new_products_launch (if blank, sends as raw text)"
              value={channels.whatsappTemplateName || ''}
              onChange={e => setChannels({ ...channels, whatsappTemplateName: e.target.value })}
            />
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>Use an approved template name to bypass the 24-hour window restriction and reach all leads.</p>
          </div>
        )}
        
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
          {isSending ? (scheduledAt ? 'Scheduling...' : 'Broadcasting...') : (scheduledAt ? 'Schedule Broadcast' : 'Blast Broadcast Now')}
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
      {scheduledBroadcasts.length > 0 && (
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
    </div>
  );
}
