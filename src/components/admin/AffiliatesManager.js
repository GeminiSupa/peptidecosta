import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Plus, Trash2, Edit2, CheckCircle, XCircle, RefreshCw, Users, Tag } from 'lucide-react';

export default function AffiliatesManager() {
  const [affiliates, setAffiliates] = useState([]);
  const [promoCodes, setPromoCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Forms State
  const [newAffiliate, setNewAffiliate] = useState({ name: '', email: '', whatsapp: '', commission_rate: 0.10 });
  const [newPromo, setNewPromo] = useState({ code: '', affiliate_id: '', discount_pct: 0.10, is_active: true });

  const loadData = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setLoading(true);
    try {
      const [affRes, promoRes] = await Promise.all([
        supabase.from('affiliates').select('*').order('created_at', { ascending: false }),
        supabase.from('promo_codes').select('*, affiliates(name)').order('created_at', { ascending: false })
      ]);
      
      if (affRes.data) setAffiliates(affRes.data);
      if (promoRes.data) setPromoCodes(promoRes.data);
    } catch (err) {
      console.error('Failed to load affiliate data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAffiliate = async (e) => {
    e.preventDefault();
    if (!newAffiliate.name || !newAffiliate.email) return;
    
    try {
      const { data, error } = await supabase
        .from('affiliates')
        .insert([newAffiliate])
        .select();
        
      if (error) throw error;
      
      setAffiliates([data[0], ...affiliates]);
      setNewAffiliate({ name: '', email: '', whatsapp: '', commission_rate: 0.10 });
    } catch (err) {
      alert('Error creating affiliate: ' + err.message);
    }
  };

  const handleDeleteAffiliate = async (id) => {
    if (!confirm('Are you sure you want to delete this affiliate? All their promo codes will also be deleted.')) return;
    try {
      const { error } = await supabase.from('affiliates').delete().eq('id', id);
      if (error) throw error;
      setAffiliates(affiliates.filter(a => a.id !== id));
      setPromoCodes(promoCodes.filter(p => p.affiliate_id !== id));
    } catch (err) {
      alert('Error deleting affiliate: ' + err.message);
    }
  };

  const handleCreatePromo = async (e) => {
    e.preventDefault();
    if (!newPromo.code || !newPromo.affiliate_id) return;
    
    try {
      const cleanCode = newPromo.code.trim().toUpperCase();
      const { data, error } = await supabase
        .from('promo_codes')
        .insert([{ ...newPromo, code: cleanCode }])
        .select('*, affiliates(name)');
        
      if (error) throw error;
      
      setPromoCodes([data[0], ...promoCodes]);
      setNewPromo({ code: '', affiliate_id: '', discount_pct: 0.10, is_active: true });
    } catch (err) {
      alert('Error creating promo code (Make sure the code is unique): ' + err.message);
    }
  };

  const handleTogglePromo = async (id, currentStatus) => {
    try {
      const { error } = await supabase
        .from('promo_codes')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      if (error) throw error;
      
      setPromoCodes(promoCodes.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
    } catch (err) {
      alert('Error updating promo code: ' + err.message);
    }
  };

  const handleDeletePromo = async (id) => {
    if (!confirm('Are you sure you want to delete this promo code?')) return;
    try {
      const { error } = await supabase.from('promo_codes').delete().eq('id', id);
      if (error) throw error;
      setPromoCodes(promoCodes.filter(p => p.id !== id));
    } catch (err) {
      alert('Error deleting promo code: ' + err.message);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px', color: '#0f172a' }}>Affiliates Program</h1>
          <p style={{ margin: 0, color: '#64748b' }}>Manage your partners, commission rates, and promo codes.</p>
        </div>
        <button 
          onClick={loadData}
          style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}
        >
          <RefreshCw size={16} /> Refresh Data
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* AFFILIATES SECTION */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#3b82f6', color: '#fff', padding: '8px', borderRadius: '8px' }}><Users size={20} /></div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Registered Affiliates</h2>
          </div>
          
          <div style={{ padding: '20px' }}>
            <form onSubmit={handleCreateAffiliate} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 'bold' }}>Register New Affiliate</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input required placeholder="Name (e.g. Dr. Smith)" value={newAffiliate.name} onChange={e => setNewAffiliate({...newAffiliate, name: e.target.value})} style={inputStyle} />
                <input required type="email" placeholder="Email" value={newAffiliate.email} onChange={e => setNewAffiliate({...newAffiliate, email: e.target.value})} style={inputStyle} />
                <input placeholder="WhatsApp (Optional)" value={newAffiliate.whatsapp} onChange={e => setNewAffiliate({...newAffiliate, whatsapp: e.target.value})} style={inputStyle} />
                <select value={newAffiliate.commission_rate} onChange={e => setNewAffiliate({...newAffiliate, commission_rate: parseFloat(e.target.value)})} style={inputStyle}>
                  <option value={0.05}>5% Commission</option>
                  <option value={0.10}>10% Commission</option>
                  <option value={0.15}>15% Commission</option>
                  <option value={0.20}>20% Commission</option>
                </select>
              </div>
              <button type="submit" style={btnStyle('#3b82f6')}><Plus size={16} /> Add Affiliate</button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loading ? <p>Loading...</p> : affiliates.length === 0 ? <p style={{ color: '#94a3b8' }}>No affiliates found.</p> : affiliates.map(aff => (
                <div key={aff.id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{aff.name}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>{aff.email}</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981', marginTop: '4px' }}>{(aff.commission_rate * 100).toFixed(0)}% Payout Rate</div>
                  </div>
                  <button onClick={() => handleDeleteAffiliate(aff.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PROMO CODES SECTION */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#10b981', color: '#fff', padding: '8px', borderRadius: '8px' }}><Tag size={20} /></div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Promo Codes</h2>
          </div>
          
          <div style={{ padding: '20px' }}>
            <form onSubmit={handleCreatePromo} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 'bold' }}>Generate Promo Code</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input required placeholder="Code (e.g. SMITH10)" value={newPromo.code} onChange={e => setNewPromo({...newPromo, code: e.target.value.toUpperCase()})} style={{...inputStyle, textTransform: 'uppercase'}} />
                <select required value={newPromo.affiliate_id} onChange={e => setNewPromo({...newPromo, affiliate_id: e.target.value})} style={inputStyle}>
                  <option value="" disabled>Select Affiliate...</option>
                  {affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={newPromo.discount_pct} onChange={e => setNewPromo({...newPromo, discount_pct: parseFloat(e.target.value)})} style={inputStyle}>
                  <option value={0.05}>5% Customer Discount</option>
                  <option value={0.10}>10% Customer Discount</option>
                  <option value={0.15}>15% Customer Discount</option>
                  <option value={0.20}>20% Customer Discount</option>
                </select>
                <button type="submit" style={btnStyle('#10b981')}><Plus size={16} /> Create Code</button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loading ? <p>Loading...</p> : promoCodes.length === 0 ? <p style={{ color: '#94a3b8' }}>No promo codes active.</p> : promoCodes.map(promo => (
                <div key={promo.id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: promo.is_active ? 1 : 0.6 }}>
                  <div>
                    <div style={{ fontWeight: '900', color: '#0f172a', fontSize: '16px', letterSpacing: '1px' }}>{promo.code}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>Assigned to: {promo.affiliates?.name || 'Unknown'}</div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#3b82f6', marginTop: '4px' }}>{(promo.discount_pct * 100).toFixed(0)}% Customer Discount</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleTogglePromo(promo.id, promo.is_active)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: promo.is_active ? '#10b981' : '#94a3b8' }}>
                      {promo.is_active ? <CheckCircle size={20} /> : <XCircle size={20} />}
                    </button>
                    <button onClick={() => handleDeletePromo(promo.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={20} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const inputStyle = {
  padding: '10px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit'
};

const btnStyle = (color) => ({
  background: color,
  color: '#fff',
  border: 'none',
  padding: '10px',
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '8px',
  fontWeight: 'bold'
});
