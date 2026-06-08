import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Plus, Trash2, Edit2, CheckCircle, XCircle, RefreshCw, Users, Tag, Check } from 'lucide-react';

export default function AffiliatesManager() {
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
      const res = await fetch('/api/admin/affiliates/payouts/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(url);
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px' }}>
        
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
            <form onSubmit={handleCreatePromo} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <h3 style={{ margin: '0', fontSize: '0.9rem', fontWeight: 'bold', color: '#e2e8f0' }}>Generate Promo Code</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
              {loading ? <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading...</p> : promoCodes.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No promo codes active.</p> : promoCodes.map(promo => (
                <div key={promo.id} style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: promo.is_active ? 1 : 0.5, transition: 'opacity 0.2s' }}>
                  <div>
                    <div style={{ fontWeight: '900', color: '#f8fafc', fontSize: '1.2rem', letterSpacing: '1px' }}>{promo.code}</div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>Linked to: <span style={{color: '#e2e8f0'}}>{promo.affiliates?.name || 'Unknown'}</span></div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '12px', display: 'inline-block', marginTop: '8px' }}>
                      {(promo.discount_pct * 100).toFixed(0)}% Customer Discount
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleTogglePromo(promo.id, promo.is_active)} style={{ background: promo.is_active ? 'rgba(52, 211, 153, 0.1)' : 'rgba(148, 163, 184, 0.1)', border: `1px solid ${promo.is_active ? 'rgba(52, 211, 153, 0.2)' : 'rgba(148, 163, 184, 0.2)'}`, borderRadius: '8px', cursor: 'pointer', padding: '8px', color: promo.is_active ? '#34d399' : '#94a3b8' }}>
                      {promo.is_active ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    </button>
                    <button onClick={() => handleDeletePromo(promo.id)} style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', cursor: 'pointer', padding: '8px' }}><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
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
