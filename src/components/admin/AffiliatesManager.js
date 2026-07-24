import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import QRCode from 'qrcode';
import { Plus, Trash2, Edit2, CheckCircle, XCircle, RefreshCw, Users, Tag, Check, QrCode, Copy, Download, X } from 'lucide-react';
import { getBadgeStyleOptions, resolvePromoBadgeText } from '@/lib/promoBadge.mjs';
import { crWallToIso, isoToCrWall, formatCrWall, formatCrInstant } from '@/lib/crTime.mjs';
import ReferralAnalytics from '@/components/admin/ReferralAnalytics';

const CATALOG_BASE_URL = process.env.NEXT_PUBLIC_AFFILIATE_CATALOG_URL || 'https://catalog.peptidescostarica.net/catalog?lang=es';

const EMPTY_PROMO = {
  code: '', affiliate_id: '', discount_pct: 0.10, is_active: true, valid_until: '',
  once_per_customer: false, hidden: false,
  show_sale_badge: false, badge_style: 'code', badge_text: '', badge_text_es: '',
  min_units: '', valid_until_time: '23:59', targetProducts: [],
};

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'promo';

const COMMISSION_RATE_OPTIONS = [
  { value: 0.05, label: '5% Commission Payout' },
  { value: 0.10, label: '10% Commission Payout' },
  { value: 0.15, label: '15% Commission Payout' },
  { value: 0.20, label: '20% Commission Payout' },
  { value: 0.25, label: '25% Commission Payout' },
  { value: 0.30, label: '30% Commission Payout' },
  { value: 0.35, label: '35% Commission Payout' },
  { value: 0.40, label: '40% Commission Payout' },
  { value: 0.50, label: '50% Commission Payout' },
];

const getCommissionSelectValue = (rate) => {
  const numericRate = Number(rate || 0);
  return COMMISSION_RATE_OPTIONS.some(option => option.value === numericRate) ? String(numericRate) : 'custom';
};

const parseCommissionPercent = (value) => {
  const pct = Number(value);
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct)) / 100;
};

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
  const [qrModal, setQrModal] = useState(null);
  const [qrLoadingId, setQrLoadingId] = useState(null);

  // Forms State
  const [newAffiliate, setNewAffiliate] = useState({ name: '', email: '', whatsapp: '', commission_rate: 0.10 });
  const [newPromo, setNewPromo] = useState(EMPTY_PROMO);
  const [editingAffiliate, setEditingAffiliate] = useState(null);
  const [editingPromo, setEditingPromo] = useState(null);

  const buildPromoCatalogUrl = (promo) => {
    const url = new URL(CATALOG_BASE_URL);
    const affiliateName = promo.affiliates?.name || promo.affiliate_name || '';
    const campaignName = affiliateName || promo.code;

    if (!url.searchParams.get('lang')) url.searchParams.set('lang', 'es');
    url.searchParams.set('promo_code', promo.code);
    url.searchParams.set('utm_source', 'affiliate');
    url.searchParams.set('utm_medium', 'qr');
    url.searchParams.set('utm_campaign', slugify(campaignName));
    url.searchParams.set('referral', campaignName);
    url.searchParams.set('gate', 'skip');

    return url.toString();
  };

  const handleOpenQr = async (promo) => {
    setQrLoadingId(promo.id);
    try {
      const link = buildPromoCatalogUrl(promo);
      const dataUrl = await QRCode.toDataURL(link, {
        width: 720,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });

      setQrModal({
        promo,
        link,
        dataUrl,
        title: promo.affiliate_id ? `${promo.affiliates?.name || 'Affiliate'} - ${promo.code}` : promo.code
      });
    } catch (err) {
      alert('Error creating QR code: ' + err.message);
    } finally {
      setQrLoadingId(null);
    }
  };

  const handleCopyQrLink = async () => {
    if (!qrModal?.link) return;
    try {
      await navigator.clipboard.writeText(qrModal.link);
      alert('Affiliate link copied.');
    } catch {
      window.prompt('Copy this affiliate link:', qrModal.link);
    }
  };

  const handleDownloadQr = () => {
    if (!qrModal?.dataUrl) return;
    const link = document.createElement('a');
    link.href = qrModal.dataUrl;
    link.download = `${slugify(qrModal.title)}-qr.png`;
    link.click();
  };

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
          valid_from: crWallToIso(editingPromo.valid_from),
          valid_until: crWallToIso(editingPromo.valid_until),
          show_sale_badge: !editingPromo.hidden && !!editingPromo.show_sale_badge,
          badge_style: editingPromo.badge_style || 'code',
          badge_text: editingPromo.badge_text || null,
          badge_text_es: editingPromo.badge_text_es || null,
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

  const handleUpdateAffiliate = async (e) => {
    e.preventDefault();
    if (!editingAffiliate?.id || !editingAffiliate.name || !editingAffiliate.email) return;

    try {
      const payload = {
        name: editingAffiliate.name.trim(),
        email: editingAffiliate.email.trim(),
        whatsapp: editingAffiliate.whatsapp?.trim() || null,
        commission_rate: Number(editingAffiliate.commission_rate || 0)
      };

      const { data, error } = await supabase
        .from('affiliates')
        .update(payload)
        .eq('id', editingAffiliate.id)
        .select()
        .single();

      if (error) throw error;

      setAffiliates(affiliates.map(a => a.id === editingAffiliate.id ? data : a));
      setEditingAffiliate(null);
      loadData();
    } catch (err) {
      alert('Error updating affiliate: ' + err.message);
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

  // Costa Rica is UTC−6 year-round: turn a YYYY-MM-DD into that day's last
  // moment in CR time, so "valid until Sunday" means Sunday night in CR
  // regardless of which timezone the admin creating the code sits in.

  const handleCreatePromo = async (e) => {
    e.preventDefault();
    // Only the code is mandatory. Affiliate is optional: general marketing codes
    // (FLASH10 etc.) intentionally have no affiliate and pay no commission.
    if (!newPromo.code) return;

    try {
      // Writes go through the server (admin session + service role) so the
      // browser key needs no write access to promo_codes at all.
      const res = await adminFetch('/api/admin/promo/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          code: newPromo.code.trim().toUpperCase(),
          discount_pct: newPromo.discount_pct,
          affiliate_id: newPromo.affiliate_id || null,
          valid_until: newPromo.valid_until ? crWallToIso(`${newPromo.valid_until}T${newPromo.valid_until_time || '23:59'}`) : null,
          once_per_customer: !!newPromo.once_per_customer,
          hidden: !!newPromo.hidden,
          min_units: newPromo.min_units,
          show_sale_badge: !!newPromo.show_sale_badge,
          badge_style: newPromo.badge_style || 'code',
          badge_text: newPromo.badge_text,
          badge_text_es: newPromo.badge_text_es,
          target_product: (newPromo.targetProducts || []).join(', ') || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Create failed (${res.status})`);

      setPromoCodes([data.promo, ...promoCodes]);
      setNewPromo(EMPTY_PROMO);
    } catch (err) {
      alert('Error creating promo code (Make sure the code is unique): ' + err.message);
    }
  };

  const handleTogglePromo = async (id, currentStatus) => {
    try {
      const res = await adminFetch('/api/admin/promo/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', id, is_active: !currentStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Toggle failed (${res.status})`);

      setPromoCodes(promoCodes.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
    } catch (err) {
      alert('Error updating promo code: ' + err.message);
    }
  };

  const handleDeletePromo = async (id) => {
    if (!confirm('Are you sure you want to delete this promo code?')) return;
    try {
      const res = await adminFetch('/api/admin/promo/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Delete failed (${res.status})`);

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
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>Manage affiliate partners and keep promo-code ownership clear.</p>
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
          Affiliates
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
          Commission Payouts
        </button>
      </div>

      {activeSubTab === 'partners' ? (
      <>
      <ReferralAnalytics />
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
                <select
                  value={getCommissionSelectValue(newAffiliate.commission_rate)}
                  onChange={e => setNewAffiliate({
                    ...newAffiliate,
                    commission_rate: e.target.value === 'custom' ? newAffiliate.commission_rate : parseFloat(e.target.value)
                  })}
                  style={inputStyle}
                >
                  {COMMISSION_RATE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                  {getCommissionSelectValue(newAffiliate.commission_rate) === 'custom' && (
                    <option value="custom">Custom Commission Payout</option>
                  )}
                </select>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="Manual payout %"
                  value={Number(newAffiliate.commission_rate * 100).toString()}
                  onChange={e => setNewAffiliate({ ...newAffiliate, commission_rate: parseCommissionPercent(e.target.value) })}
                  style={inputStyle}
                />
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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setEditingAffiliate({ ...aff })}
                      title="Edit affiliate"
                      style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', cursor: 'pointer', padding: '8px', transition: 'all 0.2s' }}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDeleteAffiliate(aff.id)} title="Delete affiliate" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', cursor: 'pointer', padding: '8px', transition: 'all 0.2s' }}><Trash2 size={16} /></button>
                  </div>
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
            <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 700 }}>Reusable discounts owned here</span>
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
                  <select value={newPromo.affiliate_id} onChange={e => setNewPromo({...newPromo, affiliate_id: e.target.value})} style={{...inputStyle, color: newPromo.affiliate_id ? '#f8fafc' : '#94a3b8'}}>
                    <option value="" style={{color: '#0f172a'}}>General Code (no affiliate)</option>
                    {affiliates.map(a => <option key={a.id} value={a.id} style={{color: '#0f172a'}}>{a.name}</option>)}
                  </select>
                  <select value={newPromo.discount_pct} onChange={e => setNewPromo({...newPromo, discount_pct: parseFloat(e.target.value)})} style={inputStyle}>
                    <option value={0.05}>5% Customer Discount</option>
                    <option value={0.10}>10% Customer Discount</option>
                    <option value={0.15}>15% Customer Discount</option>
                    <option value={0.20}>20% Customer Discount</option>
                    <option value={0.25}>25% Customer Discount</option>
                    <option value={0.30}>30% Customer Discount</option>
                    <option value={0.40}>40% Customer Discount</option>
                    <option value={0.50}>50% Customer Discount</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Min units (optional)"
                    title="Optional: the cart must contain at least this many units in total, across any products, before the code works. Leave empty for no minimum."
                    value={newPromo.min_units}
                    onChange={e => setNewPromo({...newPromo, min_units: e.target.value})}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    title="Optional: last day the code works, Costa Rica time. Leave empty for no expiry."
                    value={newPromo.valid_until}
                    onChange={e => setNewPromo({...newPromo, valid_until: e.target.value})}
                    style={{...inputStyle, color: newPromo.valid_until ? '#f8fafc' : '#94a3b8'}}
                  />
                  <input
                    type="time"
                    title="Time of day the code expires, Costa Rica time. Defaults to 23:59 (midnight)."
                    value={newPromo.valid_until_time || '23:59'}
                    onChange={e => setNewPromo({...newPromo, valid_until_time: e.target.value})}
                    disabled={!newPromo.valid_until}
                    style={{...inputStyle, color: newPromo.valid_until ? '#f8fafc' : '#64748b', maxWidth: '150px'}}
                  />
                  <button type="submit" style={btnStyle('#059669')}><Plus size={16} /> Create Code</button>
                </div>
                {newPromo.valid_until && (
                  <div style={{ fontSize: '0.78rem', color: '#38bdf8' }}>
                    Expires: {formatCrWall(`${newPromo.valid_until}T${newPromo.valid_until_time || '23:59'}`)}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>
                    Applicable Products — leave all unticked to apply to every product
                  </label>
                  <div className="admin-input" style={{ width: '100%', maxHeight: '150px', overflowY: 'auto', padding: '8px 12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}>
                    {products.map(p => {
                      const isChecked = newPromo.targetProducts?.includes(p.product);
                      return (
                        <label key={p.id || p.product} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' }}>
                          <input
                            type="checkbox"
                            style={{ width: '16px', height: '16px', accentColor: '#38bdf8', cursor: 'pointer' }}
                            checked={!!isChecked}
                            onChange={(e) => {
                              let updated = [...(newPromo.targetProducts || [])];
                              if (e.target.checked) updated.push(p.product);
                              else updated = updated.filter(item => item !== p.product);
                              setNewPromo({ ...newPromo, targetProducts: updated });
                            }}
                          />
                          <span style={{ fontSize: '0.85rem', fontWeight: isChecked ? 'bold' : 'normal', color: isChecked ? '#38bdf8' : '#e2e8f0' }}>{p.product}</span>
                        </label>
                      );
                    })}
                    {products.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '8px' }}>No products found to select...</div>}
                  </div>
                  {(newPromo.targetProducts || []).length > 0 && (
                    <div style={{ marginTop: '4px', fontSize: '0.78rem', color: '#38bdf8' }}>
                      Applies to: {newPromo.targetProducts.join(', ')}
                    </div>
                  )}
                </div>
                {Number(newPromo.min_units) > 0 && (
                  <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px', fontSize: '0.82rem', color: '#a7f3d0' }}>
                    Bulk deal: this replaces the automatic volume discount rather than adding to it, so the
                    customer gets exactly <strong>{Math.round((Number(newPromo.discount_pct) || 0) * 100)}%</strong> off
                    once their cart reaches {Math.floor(Number(newPromo.min_units))} units.
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#e2e8f0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!newPromo.once_per_customer}
                    onChange={e => setNewPromo({ ...newPromo, once_per_customer: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span>One-time use <strong>per customer</strong> — each customer can redeem this code only once</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#e2e8f0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!newPromo.hidden}
                    onChange={e => setNewPromo({ ...newPromo, hidden: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span><strong>Hidden</strong> — never shown to customers (kept out of confirmation emails); usable only by people who know the code</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: newPromo.hidden ? '#64748b' : '#e2e8f0', cursor: newPromo.hidden ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox"
                    disabled={!!newPromo.hidden}
                    checked={!newPromo.hidden && !!newPromo.show_sale_badge}
                    onChange={e => setNewPromo({ ...newPromo, show_sale_badge: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: newPromo.hidden ? 'not-allowed' : 'pointer' }}
                  />
                  <span>
                    <strong>Show sale ribbon</strong> — put a ribbon on this code&apos;s products in the catalog
                    {newPromo.hidden && <em style={{ color: '#fbbf24' }}> — unavailable on hidden codes, which stay off the public catalog</em>}
                  </span>
                </label>

                {!newPromo.hidden && newPromo.show_sale_badge && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Ribbon wording</span>
                    <select
                      value={newPromo.badge_style || 'code'}
                      onChange={e => setNewPromo({ ...newPromo, badge_style: e.target.value })}
                      style={inputStyle}
                    >
                      {getBadgeStyleOptions(newPromo.discount_pct, newPromo.code).map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {newPromo.badge_style === 'custom' && (
                      <>
                        <input
                          placeholder="English — e.g. Ask us for bulk pricing"
                          maxLength={40}
                          value={newPromo.badge_text || ''}
                          onChange={e => setNewPromo({ ...newPromo, badge_text: e.target.value })}
                          style={inputStyle}
                        />
                        <input
                          placeholder="Español — p. ej. Pregúntanos por precios de mayoreo"
                          maxLength={40}
                          value={newPromo.badge_text_es || ''}
                          onChange={e => setNewPromo({ ...newPromo, badge_text_es: e.target.value })}
                          style={inputStyle}
                        />
                      </>
                    )}
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      EN: <strong style={{ color: '#f58220' }}>
                        {resolvePromoBadgeText({ ...newPromo, is_active: true, show_sale_badge: true }, 'en') || '(nothing — enter some text)'}
                      </strong>
                      {' · '}ES: <strong style={{ color: '#f58220' }}>
                        {resolvePromoBadgeText({ ...newPromo, is_active: true, show_sale_badge: true }, 'es') || '(nada — escribe un texto)'}
                      </strong>
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      The shelf price does not change until the code is entered, so wording that names the code avoids confusion.
                      Leave <strong>Target product</strong> empty to ribbon every product.
                    </span>
                  </div>
                )}
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
                      const isExpired = promo.valid_until && new Date(promo.valid_until) < new Date();
                      const isCurrentlyActive = promo.is_active && !isExpired;
                      return (
                        <div key={promo.id} style={{ padding: '16px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isCurrentlyActive ? 1 : 0.5, transition: 'opacity 0.2s' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <div style={{ fontWeight: '900', color: '#f8fafc', fontSize: '1.2rem', letterSpacing: '1px', textDecoration: isExpired ? 'line-through' : 'none' }}>{promo.code}</div>
                      {isExpired ? (
                        <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' }}>EXPIRED</span>
                      ) : promo.is_flash_sale ? (
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
                        ⏱️ {promo.valid_from ? `Starts: ${formatCrInstant(promo.valid_from)} ` : ''} 
                        {promo.valid_until ? `Expires: ${formatCrInstant(promo.valid_until)}` : ''}
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
                      <button
                        onClick={() => handleOpenQr(promo)}
                        disabled={qrLoadingId === promo.id}
                        title="Create QR affiliate link"
                        style={{ color: '#22d3ee', background: 'rgba(34, 211, 238, 0.1)', border: '1px solid rgba(34, 211, 238, 0.2)', borderRadius: '8px', cursor: qrLoadingId === promo.id ? 'wait' : 'pointer', padding: '8px', transition: 'all 0.2s', opacity: qrLoadingId === promo.id ? 0.65 : 1 }}
                      >
                        <QrCode size={18} />
                      </button>
                    )}
                    {promoFilter !== 'welcome' && (
                      <button onClick={() => handleTogglePromo(promo.id, promo.is_active)} style={{ background: promo.is_active ? 'rgba(52, 211, 153, 0.1)' : 'rgba(148, 163, 184, 0.1)', border: `1px solid ${promo.is_active ? 'rgba(52, 211, 153, 0.2)' : 'rgba(148, 163, 184, 0.2)'}`, borderRadius: '8px', cursor: 'pointer', padding: '8px', color: promo.is_active ? '#34d399' : '#94a3b8' }}>
                        {promo.is_active ? <CheckCircle size={18} /> : <XCircle size={18} />}
                      </button>
                    )}
                    {promoFilter !== 'welcome' && (
                      <button onClick={() => setEditingPromo({
                        ...promo, 
                        targetProducts: promo.target_product ? promo.target_product.split(',').map(s => s.trim()) : [],
                        valid_from: isoToCrWall(promo.valid_from),
                        valid_until: isoToCrWall(promo.valid_until)
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
      </>
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
      {/* QR CODE MODAL */}
      {qrModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '460px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '18px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <QrCode size={20} color="#22d3ee" /> QR Code
                </h2>
                <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '4px' }}>{qrModal.title}</div>
              </div>
              <button onClick={() => setQrModal(null)} title="Close" style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', cursor: 'pointer', padding: '8px' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <img src={qrModal.dataUrl} alt={`QR code for ${qrModal.title}`} style={{ width: '100%', maxWidth: '320px', height: 'auto', display: 'block' }} />
            </div>

            <div style={{ color: '#cbd5e1', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', fontSize: '0.78rem', lineHeight: 1.4, wordBreak: 'break-all', marginBottom: '16px' }}>
              {qrModal.link}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button type="button" onClick={handleCopyQrLink} style={{ ...btnStyle('#2563eb'), padding: '10px 12px' }}>
                <Copy size={16} /> Copy Link
              </button>
              <button type="button" onClick={handleDownloadQr} style={{ ...btnStyle('#059669'), padding: '10px 12px' }}>
                <Download size={16} /> Download QR
              </button>
            </div>
          </div>
        </div>
      )}
      {/* EDIT AFFILIATE MODAL */}
      {editingAffiliate && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <form onSubmit={handleUpdateAffiliate} style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit2 size={20} color="#38bdf8" /> Edit Affiliate
            </h2>

            <div style={{ display: 'grid', gap: '12px' }}>
              <input required placeholder="Name" value={editingAffiliate.name || ''} onChange={e => setEditingAffiliate({ ...editingAffiliate, name: e.target.value })} style={inputStyle} />
              <input required type="email" placeholder="Email" value={editingAffiliate.email || ''} onChange={e => setEditingAffiliate({ ...editingAffiliate, email: e.target.value })} style={inputStyle} />
              <input placeholder="WhatsApp (Optional)" value={editingAffiliate.whatsapp || ''} onChange={e => setEditingAffiliate({ ...editingAffiliate, whatsapp: e.target.value })} style={inputStyle} />
              <select
                value={getCommissionSelectValue(editingAffiliate.commission_rate)}
                onChange={e => setEditingAffiliate({
                  ...editingAffiliate,
                  commission_rate: e.target.value === 'custom' ? editingAffiliate.commission_rate : parseFloat(e.target.value)
                })}
                style={inputStyle}
              >
                {COMMISSION_RATE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
                {getCommissionSelectValue(editingAffiliate.commission_rate) === 'custom' && (
                  <option value="custom">Custom Commission Payout</option>
                )}
              </select>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="Manual payout %"
                value={Number((editingAffiliate.commission_rate || 0) * 100).toString()}
                onChange={e => setEditingAffiliate({ ...editingAffiliate, commission_rate: parseCommissionPercent(e.target.value) })}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button type="button" onClick={() => setEditingAffiliate(null)} style={{ flex: 1, padding: '12px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button type="submit" style={{ flex: 1, padding: '12px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Save Affiliate</button>
            </div>
          </form>
        </div>
      )}
      {/* EDIT PROMO MODAL */}
      {editingPromo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <form onSubmit={handleUpdatePromo} style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', maxHeight: '88vh', overflowY: 'auto' }}>
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
                  <option value={0.30}>30% Off</option>
                  <option value={0.40}>40% Off</option>
                  <option value={0.50}>50% Off</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Valid From (Costa Rica time)</label>
                <input type="datetime-local" className="admin-input" style={{ width: '100%' }} value={editingPromo.valid_from} onChange={e => setEditingPromo({...editingPromo, valid_from: e.target.value})} />
                {editingPromo.valid_from && <div style={{ marginTop: '4px', fontSize: '0.78rem', color: '#38bdf8' }}>= {formatCrWall(editingPromo.valid_from)}</div>}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Valid Until (Costa Rica time)</label>
                <input type="datetime-local" className="admin-input" style={{ width: '100%' }} value={editingPromo.valid_until} onChange={e => setEditingPromo({...editingPromo, valid_until: e.target.value})} />
                {editingPromo.valid_until && <div style={{ marginTop: '4px', fontSize: '0.78rem', color: '#38bdf8' }}>= {formatCrWall(editingPromo.valid_until)}</div>}
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: editingPromo.hidden ? '#64748b' : '#e2e8f0', cursor: editingPromo.hidden ? 'not-allowed' : 'pointer', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    disabled={!!editingPromo.hidden}
                    checked={!editingPromo.hidden && !!editingPromo.show_sale_badge}
                    onChange={e => setEditingPromo({ ...editingPromo, show_sale_badge: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: editingPromo.hidden ? 'not-allowed' : 'pointer' }}
                  />
                  <span><strong>Show sale ribbon</strong> — put a ribbon on this code&apos;s products in the catalog</span>
                </label>
                {!editingPromo.hidden && editingPromo.show_sale_badge && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', marginBottom: '12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px' }}>
                    <select
                      value={editingPromo.badge_style || 'code'}
                      onChange={e => setEditingPromo({ ...editingPromo, badge_style: e.target.value })}
                      className="admin-input" style={{ width: '100%' }}
                    >
                      {getBadgeStyleOptions(editingPromo.discount_pct, editingPromo.code).map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    {editingPromo.badge_style === 'custom' && (
                      <>
                        <input
                          placeholder="English — e.g. Ask us for bulk pricing"
                          maxLength={40}
                          value={editingPromo.badge_text || ''}
                          onChange={e => setEditingPromo({ ...editingPromo, badge_text: e.target.value })}
                          className="admin-input" style={{ width: '100%' }}
                        />
                        <input
                          placeholder="Español — p. ej. Pregúntanos por precios de mayoreo"
                          maxLength={40}
                          value={editingPromo.badge_text_es || ''}
                          onChange={e => setEditingPromo({ ...editingPromo, badge_text_es: e.target.value })}
                          className="admin-input" style={{ width: '100%' }}
                        />
                      </>
                    )}
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      EN: <strong style={{ color: '#f58220' }}>
                        {resolvePromoBadgeText({ ...editingPromo, is_active: true, show_sale_badge: true }, 'en') || '(nothing — enter some text)'}
                      </strong>
                      {' · '}ES: <strong style={{ color: '#f58220' }}>
                        {resolvePromoBadgeText({ ...editingPromo, is_active: true, show_sale_badge: true }, 'es') || '(nada — escribe un texto)'}
                      </strong>
                    </span>
                  </div>
                )}
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
