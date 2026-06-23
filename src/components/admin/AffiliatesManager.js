import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { Plus, Trash2, Edit2, CheckCircle, XCircle, RefreshCw, Users, Tag, Check } from 'lucide-react';

export default function AffiliatesManager({ products = [] }) {
  const [affiliates, setAffiliates] = useState([]);
  const [promoCodes, setPromoCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sub-tabs & Payout states
  const [activeSubTab, setActiveSubTab] = useState('partners');
  const [payouts, setPayouts] = useState([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [syncingCommissions, setSyncingCommissions] = useState(false);
  const [scanPeriod, setScanPeriod] = useState('previous');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [targetAffiliate, setTargetAffiliate] = useState('all');
  const [promoFilter, setPromoFilter] = useState('standard');

  // Forms State
  const [newAffiliate, setNewAffiliate] = useState({ name: '', email: '', whatsapp: '', commission_rate: 0.10 });
  const [newPromo, setNewPromo] = useState({ code: '', affiliate_id: '', discount_pct: 0.10, is_active: true });
  const [editingPromo, setEditingPromo] = useState(null);

  const handleUpdatePromo = async (e) => {
    e.preventDefault();
    if (!editingPromo || !editingPromo.id) return;
    
    try {
      const target_product = Array.isArray(editingPromo.targetProducts) 
        ? editingPromo.targetProducts.join(', ') 
        : editingPromo.target_product || null;

      const res = await adminFetch('/api/admin/promo/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPromo.id,
          discount_pct: editingPromo.discount_pct,
          is_flash_sale: !!target_product,
          target_product,
          valid_from: editingPromo.valid_from ? new Date(editingPromo.valid_from).toISOString() : null,
          valid_until: editingPromo.valid_until ? new Date(editingPromo.valid_until).toISOString() : null,
          affiliate_id: editingPromo.affiliate_id || null
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      
      setEditingPromo(null);
      loadData(); // reload to get fresh data
      alert('✅ Promo code updated successfully!');
    } catch (err) {
      alert('Error updating promo code: ' + err.message);
    }
  };

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

  const fetchPayouts = async () => {
    setLoadingPayouts(true);
    try {
      const { data } = await supabase.from('affiliate_payouts').select('*').order('created_at', { ascending: false });
      if (data) setPayouts(data);
    } catch (err) { console.error(err); }
    setLoadingPayouts(false);
  };

  const handlePayoutAction = async (payoutId, action) => {
    setActionLoadingId(payoutId);
    try {
      const res = await adminFetch('/api/admin/affiliates/payouts/approve', {
        method: 'POST',
        body: JSON.stringify({ payoutId, action })
      });
      const data = await res.json();
      if (data.success) { alert(`Payout ${action}!`); fetchPayouts(); }
      else alert(`Failed: ${data.error}`);
    } catch (err) { alert('Network error.'); }
    setActionLoadingId(null);
  };

  const handleSyncAffiliateCommissions = async () => {
    setSyncingCommissions(true);
    try {
      let url = `/api/admin/affiliates/payouts/report?period=${scanPeriod}`;
      if (scanPeriod === 'custom') {
        if (!customStartDate || !customEndDate) { alert('Select both dates.'); setSyncingCommissions(false); return; }
        url += `&start=${customStartDate}&end=${customEndDate}`;
      }
      if (targetAffiliate && targetAffiliate !== 'all') url += `&affiliateId=${targetAffiliate}`;
      const res = await adminFetch(url);
      const data = await res.json();
      if (data.success) { alert('Affiliate commissions synced!'); fetchPayouts(); }
      else alert(`Failed: ${data.error}`);
    } catch (err) { alert('Error syncing.'); }
    setSyncingCommissions(false);
  };

  useEffect(() => {
    loadData();
    if (activeSubTab === 'payouts') fetchPayouts();
  }, [activeSubTab]);

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
    <div style={{ padding: '0', maxWidth: '1400px', margin: '0 auto', color: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', margin: '0 0 4px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={24} style={{ color: '#38bdf8' }} /> Affiliates Program
          </h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>Manage your partners, commission rates, and promo codes.</p>
        </div>
        <button 
          onClick={loadData}
          style={{ padding: '8px 16px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} /> Refresh Data
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
        <button 
          onClick={() => setActiveSubTab('partners')}
          className="admin-btn"
          style={{ 
            background: activeSubTab === 'partners' ? '#38bdf8' : 'rgba(255,255,255,0.02)', 
            color: activeSubTab === 'partners' ? '#0e1626' : '#94a3b8',
            border: '1px solid rgba(255,255,255,0.05)',
            fontWeight: 'bold',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          👥 Partners & Codes
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

      {activeSubTab === 'partners' ? (
      <div className="admin-responsive-grid-auto">
        
        {/* AFFILIATES SECTION */}
        <div style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '8px', borderRadius: '8px' }}><Users size={18} /></div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Registered Affiliates</h2>
          </div>
          
          <div style={{ padding: '20px' }}>
            <form onSubmit={handleCreateAffiliate} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <h3 style={{ margin: '0', fontSize: '0.9rem', fontWeight: 'bold', color: '#e2e8f0' }}>Register New Affiliate</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input required placeholder="Name (e.g. Dr. Smith)" value={newAffiliate.name} onChange={e => setNewAffiliate({...newAffiliate, name: e.target.value})} style={inputStyle} />
                <input required type="email" placeholder="Email" value={newAffiliate.email} onChange={e => setNewAffiliate({...newAffiliate, email: e.target.value})} style={inputStyle} />
                <input placeholder="WhatsApp (Optional)" value={newAffiliate.whatsapp} onChange={e => setNewAffiliate({...newAffiliate, whatsapp: e.target.value})} style={inputStyle} />
                <select value={newAffiliate.commission_rate} onChange={e => setNewAffiliate({...newAffiliate, commission_rate: parseFloat(e.target.value)})} style={inputStyle}>
                  <option value={0.05}>5% Commission Payout</option>
                  <option value={0.10}>10% Commission Payout</option>
                  <option value={0.15}>15% Commission Payout</option>
                  <option value={0.20}>20% Commission Payout</option>
                </select>
              </div>
              <button type="submit" style={btnStyle('#2563eb')}><Plus size={16} /> Add Affiliate</button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
              {loading ? <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading...</p> : affiliates.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No affiliates found.</p> : affiliates.map(aff => (
                <div key={aff.id} style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '1rem' }}>{aff.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>{aff.email}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '2px 8px', borderRadius: '12px', display: 'inline-block', marginTop: '8px' }}>
                      {(aff.commission_rate * 100).toFixed(0)}% Payout Rate
                    </div>
                  </div>
                  <button onClick={() => handleDeleteAffiliate(aff.id)} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', cursor: 'pointer', padding: '8px', transition: 'all 0.2s' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PROMO CODES SECTION */}
        <div style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '8px', borderRadius: '8px' }}><Tag size={18} /></div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>Promo Codes</h2>
          </div>
          
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button 
                onClick={() => setPromoFilter('standard')}
                className="admin-btn"
                style={{ 
                  background: promoFilter === 'standard' ? '#38bdf8' : 'rgba(255,255,255,0.02)', 
                  color: promoFilter === 'standard' ? '#0e1626' : '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontWeight: 'bold', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem'
                }}
              >
                Standard Promos
              </button>
              <button 
                onClick={() => setPromoFilter('welcome')}
                className="admin-btn"
                style={{ 
                  background: promoFilter === 'welcome' ? '#38bdf8' : 'rgba(255,255,255,0.02)', 
                  color: promoFilter === 'welcome' ? '#0e1626' : '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.05)',
                  fontWeight: 'bold', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem'
                }}
              >
                Auto-Generated Leads
              </button>
            </div>

            {promoFilter === 'standard' && (
              <form onSubmit={handleCreatePromo} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                <h3 style={{ margin: '0', fontSize: '0.9rem', fontWeight: 'bold', color: '#e2e8f0' }}>Generate Promo Code</h3>
                <div className="admin-form-grid-2">
                  <input required placeholder="Code (e.g. SMITH10)" value={newPromo.code} onChange={e => setNewPromo({...newPromo, code: e.target.value.toUpperCase()})} style={{...inputStyle, textTransform: 'uppercase'}} />
                  <select required value={newPromo.affiliate_id} onChange={e => setNewPromo({...newPromo, affiliate_id: e.target.value})} style={{...inputStyle, color: newPromo.affiliate_id ? '#f8fafc' : '#94a3b8'}}>
                    <option value="" disabled>Select Affiliate...</option>
                    {affiliates.map(a => <option key={a.id} value={a.id} style={{color: '#0f172a'}}>{a.name}</option>)}
                  </select>
                  <select value={newPromo.discount_pct} onChange={e => setNewPromo({...newPromo, discount_pct: parseFloat(e.target.value)})} style={inputStyle}>
                    <option value={0.05}>5% Customer Discount</option>
                    <option value={0.10}>10% Customer Discount</option>
                    <option value={0.15}>15% Customer Discount</option>
                    <option value={0.20}>20% Customer Discount</option>
                  </select>
                  <button type="submit" style={btnStyle('#059669')}><Plus size={16} /> Create Code</button>
                </div>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
              {(() => {
                const filteredCodes = promoCodes.filter(p => promoFilter === 'welcome' ? p.code.startsWith('WELCOME-') : !p.code.startsWith('WELCOME-'));
                
                if (loading) return <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading...</p>;
                
                let statsUI = null;
                if (promoFilter === 'welcome') {
                  const used = filteredCodes.filter(p => p.usage_count >= 1).length;
                  const valid = filteredCodes.length - used;
                  statsUI = (
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', padding: '12px', background: 'rgba(56, 189, 248, 0.05)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                      <div style={{ color: '#34d399', fontSize: '0.85rem', fontWeight: 'bold' }}>✅ {valid} Usable Codes</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 'bold' }}>🛒 {used} Used (Expired)</div>
                    </div>
                  );
                }

                if (filteredCodes.length === 0) return <>{statsUI}<p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No {promoFilter} codes active.</p></>;

                return (
                  <>
                    {statsUI}
                    {filteredCodes.map(promo => {
                      const isUsed = promo.usage_count >= 1;
                      return (
                        <div key={promo.id} style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: promo.is_active ? 1 : 0.5, transition: 'opacity 0.2s' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <div style={{ fontWeight: '900', color: '#f8fafc', fontSize: '1.2rem', letterSpacing: '1px' }}>{promo.code}</div>
                      {promo.is_flash_sale ? (
                        <span style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' }}>⚡ FLASH SALE</span>
                      ) : promo.affiliate_id ? (
                        <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' }}>🤝 AFFILIATE</span>
                      ) : (
                        <span style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' }}>🏷️ STORE WIDE</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                      Linked to: <span style={{color: '#e2e8f0'}}>{promo.affiliate_id ? (promo.affiliates?.name || 'Unknown') : 'N/A (General Code)'}</span>
                    </div>
                    {(promo.valid_from || promo.valid_until) && (
                      <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '4px', fontWeight: 'bold' }}>
                        ⏱️ {promo.valid_from ? `Starts: ${new Date(promo.valid_from).toLocaleDateString()} ` : ''} 
                        {promo.valid_until ? `Expires: ${new Date(promo.valid_until).toLocaleString()}` : ''}
                      </div>
                    )}
                    {promo.target_product && (
                      <div style={{ fontSize: '0.8rem', color: '#a78bfa', marginTop: '4px' }}>
                        🎯 Applies to: <span style={{color: '#e2e8f0'}}>{promo.target_product}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                        {(promo.discount_pct * 100).toFixed(0)}% Customer Discount
                      </div>
                      {promoFilter === 'welcome' && (
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isUsed ? '#94a3b8' : '#34d399', background: isUsed ? 'rgba(148, 163, 184, 0.1)' : 'rgba(52, 211, 153, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                          {isUsed ? '🛒 Used' : '✅ Usable'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {promoFilter !== 'welcome' && (
                      <button onClick={() => handleTogglePromo(promo.id, promo.is_active)} style={{ background: promo.is_active ? 'rgba(52, 211, 153, 0.1)' : 'rgba(148, 163, 184, 0.1)', border: `1px solid ${promo.is_active ? 'rgba(52, 211, 153, 0.2)' : 'rgba(148, 163, 184, 0.2)'}`, borderRadius: '8px', cursor: 'pointer', padding: '8px', color: promo.is_active ? '#34d399' : '#94a3b8' }}>
                        {promo.is_active ? <CheckCircle size={18} /> : <XCircle size={18} />}
                      </button>
                    )}
                    {promoFilter !== 'welcome' && (
                      <button onClick={() => setEditingPromo({
                        ...promo, 
                        targetProducts: promo.target_product ? promo.target_product.split(',').map(s => s.trim()) : [],
                        valid_from: promo.valid_from ? new Date(promo.valid_from).toISOString().slice(0, 16) : '',
                        valid_until: promo.valid_until ? new Date(promo.valid_until).toISOString().slice(0, 16) : ''
                      })} style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', cursor: 'pointer', padding: '8px', transition: 'all 0.2s' }}>
                        <Edit2 size={18} />
                      </button>
                    )}
                    <button onClick={() => handleDeletePromo(promo.id)} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', cursor: 'pointer', padding: '8px' }}><Trash2 size={18} /></button>
                  </div>
                </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        </div>

      </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <select
              value={targetAffiliate}
              onChange={(e) => setTargetAffiliate(e.target.value)}
              disabled={syncingCommissions}
              style={{
                background: 'rgba(15, 23, 42, 0.8)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', outline: 'none',
                fontWeight: 'bold'
              }}
            >
              <option value="all">All Affiliates</option>
              {affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            <select
              value={scanPeriod}
              onChange={(e) => setScanPeriod(e.target.value)}
              disabled={syncingCommissions}
              style={{
                background: 'rgba(15, 23, 42, 0.8)', color: '#e2e8f0', border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', outline: 'none'
              }}
            >
              <option value="previous">Previous Week (Mon-Sun)</option>
              <option value="current">Current Week (Mon-Now)</option>
              <option value="all-time">All-Time (All Pending)</option>
              <option value="custom">Custom Date Range</option>
            </select>

            {scanPeriod === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} style={inputStyle} />
                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>to</span>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={inputStyle} />
              </div>
            )}

            <button 
              className="admin-btn admin-btn-primary" onClick={handleSyncAffiliateCommissions} disabled={syncingCommissions}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#a855f7', borderColor: '#a855f7', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', color: 'white', fontWeight: 'bold' }}
            >
              {syncingCommissions ? 'Calculating...' : '🔄 Run Commission Scan'}
            </button>
          </div>

          {loadingPayouts ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Loading payouts...</p>
          ) : payouts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
              No affiliate payouts found. Click <strong>Run Commission Scan</strong> to calculate!
            </div>
          ) : (
            <div className="table-responsive" style={{ background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <table className="spreadsheet-table responsive-table">
                <thead>
                  <tr>
                    <th style={{ padding: '16px', textAlign: 'left' }}>Affiliate</th>
                    <th style={{ padding: '16px', textAlign: 'left' }}>Period</th>
                    <th style={{ padding: '16px', textAlign: 'left' }}>Rate</th>
                    <th style={{ padding: '16px', textAlign: 'left' }}>Commission</th>
                    <th style={{ padding: '16px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '16px', fontWeight: 'bold' }}>
                        <div style={{ color: '#f8fafc' }}>{p.affiliate_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.affiliate_email}</div>
                      </td>
                      <td style={{ padding: '16px', color: '#cbd5e1', fontSize: '0.85rem' }}>
                        {new Date(p.start_date).toLocaleDateString()} - {new Date(p.end_date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '16px', fontWeight: 'bold', color: '#38bdf8' }}>{p.commission_rate}%</td>
                      <td style={{ padding: '16px', fontSize: '0.85rem' }}>
                        <div style={{ color: '#c084fc', fontWeight: 'bold' }}>USD: ${Number(p.usd_commission).toFixed(2)}</div>
                        <div style={{ color: '#c084fc', fontWeight: 'bold' }}>CRC: ₡{Math.round(p.crc_commission).toLocaleString()}</div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ 
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                          background: p.status === 'Pending' ? 'rgba(234, 179, 8, 0.15)' : p.status === 'Approved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: p.status === 'Pending' ? '#eab308' : p.status === 'Approved' ? '#22c55e' : '#ef4444'
                        }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        {p.status === 'Pending' && (
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => handlePayoutAction(p.id, 'Approved')} disabled={actionLoadingId !== null} style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {actionLoadingId === p.id ? '...' : <Check size={12} />} Approve & Send
                            </button>
                            <button onClick={() => handlePayoutAction(p.id, 'Rejected')} disabled={actionLoadingId !== null} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}>
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* EDIT PROMO MODAL */}
      {editingPromo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <form onSubmit={handleUpdatePromo} style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit2 size={20} color="#38bdf8" /> Edit Promo Code: {editingPromo.code}
            </h2>
            
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Discount Percentage</label>
                <select value={editingPromo.discount_pct} onChange={e => setEditingPromo({...editingPromo, discount_pct: parseFloat(e.target.value)})} className="admin-input" style={{ width: '100%' }}>
                  <option value={0.05}>5% Off</option>
                  <option value={0.10}>10% Off</option>
                  <option value={0.15}>15% Off</option>
                  <option value={0.20}>20% Off</option>
                  <option value={0.25}>25% Off</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Valid From (Optional)</label>
                <input type="datetime-local" className="admin-input" style={{ width: '100%' }} value={editingPromo.valid_from} onChange={e => setEditingPromo({...editingPromo, valid_from: e.target.value})} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Valid Until (Optional)</label>
                <input type="datetime-local" className="admin-input" style={{ width: '100%' }} value={editingPromo.valid_until} onChange={e => setEditingPromo({...editingPromo, valid_until: e.target.value})} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Target Products (Optional Flash Sale Constraint)</label>
                <div className="admin-input" style={{ width: '100%', maxHeight: '180px', overflowY: 'auto', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}>
                  {products.map(p => {
                    const isChecked = editingPromo.targetProducts?.includes(p.product);
                    return (
                      <label key={p.id || p.product} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' }}>
                        <input 
                          type="checkbox" 
                          style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                          checked={isChecked}
                          onChange={(e) => {
                            let updated = [...(editingPromo.targetProducts || [])];
                            if (e.target.checked) updated.push(p.product);
                            else updated = updated.filter(item => item !== p.product);
                            setEditingPromo({...editingPromo, targetProducts: updated});
                          }}
                        />
                        <span style={{ fontSize: '0.9rem', fontWeight: isChecked ? 'bold' : 'normal', color: isChecked ? '#38bdf8' : '#e2e8f0' }}>{p.product}</span>
                      </label>
                    );
                  })}
                  {products.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px' }}>No products found to select...</div>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button type="button" onClick={() => setEditingPromo(null)} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button type="submit" style={{ flex: 1, padding: '12px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: '12px 14px',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  fontSize: '0.85rem',
  outline: 'none',
  fontFamily: 'inherit',
  background: '#0f172a',
  color: '#f8fafc',
  width: '100%',
  boxSizing: 'border-box'
};

const btnStyle = (color) => ({
  background: color,
  color: '#fff',
  border: 'none',
  padding: '12px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '8px',
  fontWeight: 'bold',
  fontSize: '0.85rem',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'transform 0.1s'
});
