"use client";

import React, { useState, useMemo } from 'react';
import { 
  ShoppingCart, Trash2, Upload, Brain, Sparkles, AlertCircle, 
  Clock, Mail, MessageCircle, ArrowRight, Package, CreditCard, Eye, Search, ArrowDownUp, User
} from 'lucide-react';

export default function CartsManager({
  abandonedCarts,
  handleClearAllCarts,
  loadAdminData,
  setExportModalType,
  generatingCartsAi,
  cartsAiText,
  setCartsAiText,
  handleGenerateCartsAi,
  bulkProcessing,
  handleBulkEmail,
  handleBulkWhatsApp,
  handleBulkDelete,
  handleSelectCart,
  handleSelectMultipleCarts,
  selectedCarts,
  handleSendRecoveryEmail,
  handleDeleteCart,
  setSelectedCartDetails,
  onOpenCustomerProfile,
  onWhatsAppClick
}) {


  // Sorting & Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('date'); // 'date', 'value', 'items'
  const [sortDir, setSortDir] = useState('desc'); // 'asc', 'desc'
  
  const [lastSelectedCartIndex, setLastSelectedCartIndex] = useState(null);
  const [contactFilter, setContactFilter] = useState('all'); // 'all', 'has_phone', 'has_email'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'contacted', 'not_contacted'

  const filteredAndSortedCarts = useMemo(() => {
    let result = [...(abandonedCarts || [])];
    
    // Filter by search
    if (searchTerm) {
      const lowerQ = searchTerm.toLowerCase();
      result = result.filter(c => 
        String(c.user_email || c.customer_email || '').toLowerCase().includes(lowerQ) ||
        String(c.user_phone || c.customer_phone || '').includes(searchTerm)
      );
    }

    // Filter by contact info
    if (contactFilter === 'has_phone') {
      result = result.filter(c => !!(c.user_phone || c.customer_phone));
    } else if (contactFilter === 'has_email') {
      result = result.filter(c => !!(c.user_email || c.customer_email));
    }
    
    // Filter by status (contacted)
    if (statusFilter === 'contacted') {
      result = result.filter(c => c.recovery_whatsapp_sent || c.recovery_email_sent || c.status === 'recovered' || c.status === 'converted');
    } else if (statusFilter === 'not_contacted') {
      result = result.filter(c => !c.recovery_whatsapp_sent && !c.recovery_email_sent && c.status !== 'recovered' && c.status !== 'converted');
    }
    
    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === 'value') {
        const totalA = calculateCartTotal(a.cart_data);
        const totalB = calculateCartTotal(b.cart_data);
        comparison = totalA - totalB;
      } else if (sortField === 'items') {
        const itemsA = getCartItems(a.cart_data).length;
        const itemsB = getCartItems(b.cart_data).length;
        comparison = itemsA - itemsB;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [abandonedCarts, searchTerm, sortField, sortDir, contactFilter, statusFilter]);

  // Contact / recovery status shown in its own column
  const getRecoveryStatus = (cart) => {
    if (cart.status === 'recovered' || cart.status === 'converted') {
      return { label: 'Recovered', color: '#10b981', icon: <Sparkles size={11} /> };
    }
    if (cart.recovery_whatsapp_sent) {
      return { label: 'Contacted (WhatsApp)', color: '#22c55e', icon: <MessageCircle size={11} /> };
    }
    if (cart.recovery_email_sent) {
      return { label: 'Contacted (Email)', color: '#3b82f6', icon: <Mail size={11} /> };
    }
    return { label: 'Not Contacted', color: '#94a3b8', icon: <AlertCircle size={11} /> };
  };

  const handleLocalSelectCart = (id, checked, shiftKey, index) => {
    if (shiftKey && lastSelectedCartIndex !== null && handleSelectMultipleCarts) {
      const start = Math.min(lastSelectedCartIndex, index);
      const end = Math.max(lastSelectedCartIndex, index);
      const idsInRange = filteredAndSortedCarts.slice(start, end + 1).map(c => c.session_id || c.id);
      handleSelectMultipleCarts(idsInRange, checked);
    } else {
      if (handleSelectMultipleCarts) {
        handleSelectMultipleCarts([id], checked);
      } else if (handleSelectCart) {
        handleSelectCart(id, checked, shiftKey, index);
      }
    }
    setLastSelectedCartIndex(index);
  };

  const handleSelectAllCartsLocal = (e) => {
    const checked = e.target.checked;
    if (handleSelectMultipleCarts) {
      handleSelectMultipleCarts(filteredAndSortedCarts.map(c => c.session_id || c.id), checked);
    }
  };

  const calculateCartTotal = (cartData) => {
    if (!cartData) return 0;
    
    if (typeof cartData === 'string') {
      try { cartData = JSON.parse(cartData); } catch (e) { return 0; }
    }

    const items = Array.isArray(cartData) ? cartData : (Array.isArray(cartData?.items) ? cartData.items : []);
    if (items.length === 0) {
      if (cartData && typeof cartData.total !== 'undefined') {
        return parseFloat((cartData.total || '0').toString().replace(/[^0-9.]/g, '')) || 0;
      }
      return 0;
    }
    return items.reduce((sum, item) => {
      if (!item) return sum;
      const priceVal = item.price_usd || item.priceUsd || item.price || '0';
      const price = parseFloat(priceVal.toString().replace(/[^0-9.]/g, '')) || 0;
      const qty = parseInt(item.qty || item.quantity || 1) || 1;
      return sum + (price * qty);
    }, 0);
  };

  const getCartItems = (cartData) => {
    if (!cartData) return [];
    if (typeof cartData === 'string') {
      try { cartData = JSON.parse(cartData); } catch (e) { return []; }
    }
    if (Array.isArray(cartData)) return cartData;
    if (cartData && Array.isArray(cartData.items)) return cartData.items;
    return [];
  };

  const untouchedRecoverableCount = filteredAndSortedCarts.filter(cart => {
    const hasContact = !!(cart.user_phone || cart.customer_phone || cart.user_email || cart.customer_email);
    const contacted = cart.recovery_whatsapp_sent || cart.recovery_email_sent || cart.status === 'recovered' || cart.status === 'converted';
    return hasContact && !contacted;
  }).length;

  const openCustomerFromCart = (cart) => {
    onOpenCustomerProfile?.({
      customer_email: cart.customer_email,
      user_email: cart.user_email,
      customer_phone: cart.customer_phone,
      user_phone: cart.user_phone,
      customer_name: cart.customer_name,
      search: cart.user_email || cart.customer_email || cart.user_phone || cart.customer_phone || cart.customer_name
    });
  };

  const openCartWhatsApp = (cart) => {
    const phone = cart.user_phone || cart.customer_phone;
    if (!phone) return;
    const items = getCartItems(cart.cart_data);
    if (onWhatsAppClick) {
      onWhatsAppClick({
        name: cart.customer_name || cart.name || cart.user_email || cart.customer_email || 'Cliente',
        phone,
        session_id: cart.session_id || cart.id,
        cartItems: items,
        context: 'abandoned_cart',
      }, 'discount');
      return;
    }
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
  };

  return (
    <div className="admin-tab-panel carts-manager-panel">
      
      {/* HEADER ACTIONS */}
      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)', padding: '10px', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 15px rgba(56, 189, 248, 0.4)' }}>
            <ShoppingCart size={22} />
          </div>
          <div>
            <h2 className="admin-section-title" style={{ margin: 0 }}>Abandoned Carts</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>{(abandonedCarts || []).length} active carts awaiting recovery</p>
          </div>
        </div>
        
        <div className="admin-toolbar-actions">
          {(abandonedCarts || []).length > 0 && (
            <>
              <button
                onClick={() => setExportModalType('carts')}
                style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
              >
                <Upload size={14} /> Export
              </button>
              <button
                onClick={handleClearAllCarts}
                style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
              >
                <Trash2 size={14} /> Clear All
              </button>
            </>
          )}
          <button className="admin-btn" onClick={loadAdminData} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* AI RECOVERY MODULE */}
      <div className="carts-ai-module" style={{ marginBottom: '30px' }}>
        {generatingCartsAi ? (
          <div style={{ background: 'linear-gradient(135deg, rgba(14, 22, 38, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="sync-spinner" style={{ color: '#38bdf8' }}><Brain size={32} /></div>
              <div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 4px 0' }}>🧬 AI Copilot is auditing active abandoned carts...</h4>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>Compiling peptide cart values, measuring checkout leakage frequency, and drafting recovery discount hooks...</p>
              </div>
            </div>
          </div>
        ) : cartsAiText ? (
          <div style={{ background: 'linear-gradient(135deg, rgba(14, 26, 51, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 40px -10px rgba(56, 189, 248, 0.2)', position: 'relative' }}>
            <button 
              onClick={() => setCartsAiText('')}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
            >
              &times;
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
              <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '10px', borderRadius: '12px', color: '#38bdf8' }}>
                <Sparkles size={22} />
              </div>
              <div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>🧬 Real-Time AI Cart Recovery Strategy</h4>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Generated by Gemini • Data-Driven Recovery hooks</span>
              </div>
            </div>
            
            <div 
              style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{
                __html: cartsAiText
                  .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #38bdf8">$1</strong>')
                  .replace(/^- (.*)$/gm, '<li style="margin-left: 12px; margin-bottom: 8px; list-style-type: square">$1</li>')
              }}
            />
          </div>
        ) : (
          <div 
            onClick={handleGenerateCartsAi}
            className="admin-ai-insight-card"
            style={{ background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.3s', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '12px', borderRadius: '14px', color: '#38bdf8' }}>
                <Brain size={24} />
              </div>
              <div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 4px 0' }}>✨ Generate Real-Time AI Cart Recovery Insights</h4>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>Analyze abandoned carts list, map product abandonment frequency, and draft high-converting recovery hooks.</p>
              </div>
            </div>
            <button className="admin-btn admin-btn-primary" style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600' }}>
              <Sparkles size={16} /> Audit Carts
            </button>
          </div>
        )}
      </div>

      {/* BULK ACTIONS BAR */}
      {selectedCarts && selectedCarts.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '12px 20px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{selectedCarts.length} Selected</span>
            <span style={{ color: '#64748b' }}>|</span>
            <button onClick={handleBulkEmail} className="admin-btn admin-btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail size={12} /> Bulk Email
            </button>
            <button onClick={handleBulkWhatsApp} className="admin-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#10b981', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageCircle size={12} /> Bulk WhatsApp
            </button>
          </div>
          <button onClick={handleBulkDelete} className="admin-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Trash2 size={12} /> Delete Selected
          </button>
        </div>
      )}

      {bulkProcessing && (
        <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '16px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="sync-spinner" style={{ marginBottom: '10px', color: '#38bdf8' }}><Brain size={24} /></div>
          <div style={{ color: '#f8fafc', fontWeight: 'bold' }}>Processing Bulk Action...</div>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Please do not close this window.</div>
        </div>
      )}

      
      {/* Search and Sort Toolbar */}
      <div className="carts-filter-row" style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input 
            type="text" 
            placeholder="Search email or phone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '10px 10px 10px 36px', borderRadius: '8px', fontSize: '0.9rem' }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', padding: '0 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <select 
            value={contactFilter} 
            onChange={(e) => setContactFilter(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="all" style={{background: '#0f172a'}}>All Contacts</option>
            <option value="has_phone" style={{background: '#0f172a'}}>Has Phone</option>
            <option value="has_email" style={{background: '#0f172a'}}>Has Email</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', padding: '0 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="all" style={{background: '#0f172a'}}>All Status</option>
            <option value="contacted" style={{background: '#0f172a'}}>Contacted</option>
            <option value="not_contacted" style={{background: '#0f172a'}}>Not Contacted</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)', padding: '0 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <ArrowDownUp size={14} color="#94a3b8" />
          <select 
            value={sortField} 
            onChange={(e) => setSortField(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="date" style={{background: '#0f172a'}}>Sort by Date</option>
            <option value="value" style={{background: '#0f172a'}}>Sort by Value</option>
            <option value="items" style={{background: '#0f172a'}}>Sort by Items</option>
          </select>
          <select 
            value={sortDir} 
            onChange={(e) => setSortDir(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="desc" style={{background: '#0f172a'}}>Desc</option>
            <option value="asc" style={{background: '#0f172a'}}>Asc</option>
          </select>
        </div>
      </div>

      {/* CARTS TABLE */}

      {!filteredAndSortedCarts.length ? (
        <div className="admin-empty-state" style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <div className="empty-icon" style={{ opacity: 0.5 }}><ShoppingCart size={48} /></div>
          <h3>No Abandoned Carts</h3>
          <p>Your checkout funnel is completely clear right now.</p>
        </div>
      ) : (
        <div className="carts-recovery-section">
        <div className="cart-recovery-heading">
          <div>
            <h3>Recoverable carts</h3>
            <p>{untouchedRecoverableCount} untouched carts with contact details</p>
          </div>
          <button type="button" className="admin-btn admin-btn-primary" onClick={handleGenerateCartsAi}>
            <MessageCircle size={14} /> Recovery playbook
          </button>
        </div>
        <div className="cart-mobile-list admin-mobile-only">
          {filteredAndSortedCarts.map((cart, index) => {
            const total = calculateCartTotal(cart.cart_data);
            const items = getCartItems(cart.cart_data);
            const isSelected = selectedCarts && selectedCarts.includes(cart.session_id || cart.id);
            const rs = getRecoveryStatus(cart);
            const phone = cart.user_phone || cart.customer_phone;
            const email = cart.user_email || cart.customer_email;
            return (
              <article key={cart.id} className={`cart-mobile-card${isSelected ? ' selected' : ''}`}>
                <div className="cart-mobile-top">
                  <label className="cart-mobile-check">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleLocalSelectCart(cart.session_id || cart.id, e.target.checked, e.nativeEvent.shiftKey, index)}
                    />
                  </label>
                  <button type="button" className="cart-mobile-customer" onClick={() => setSelectedCartDetails && setSelectedCartDetails(cart)}>
                    <strong>{email || cart.customer_name || 'Guest Checkout'}</strong>
                    <span>{phone || 'No phone'} · {new Date(cart.created_at).toLocaleDateString()}</span>
                  </button>
                  <span className="cart-mobile-total">${total.toFixed(2)}</span>
                </div>
                <div className="cart-mobile-items">
                  {items.slice(0, 3).map((item, idx) => (
                    <span key={idx}><Package size={11} /> {item.qty || item.quantity || 1}x {item.product || item.name || item.product_name || 'Product'}</span>
                  ))}
                  {items.length > 3 && <span>+ {items.length - 3} more</span>}
                </div>
                <div className="cart-mobile-status" style={{ color: rs.color }}>
                  {rs.icon} {rs.label}
                </div>
                <div className="cart-mobile-actions">
                  <button type="button" className="admin-btn" onClick={() => openCustomerFromCart(cart)}>
                    <User size={13} /> Profile
                  </button>
                  {phone && (
                    <button
                      type="button"
                      className="admin-btn cart-mobile-whatsapp"
                      onClick={() => openCartWhatsApp(cart)}
                    >
                      <MessageCircle size={13} /> WhatsApp
                    </button>
                  )}
                  {email && (
                    <button type="button" className="admin-btn" onClick={() => handleSendRecoveryEmail && handleSendRecoveryEmail(cart)}>
                      <Mail size={13} /> Email
                    </button>
                  )}
                  <button type="button" className="admin-btn" onClick={() => setSelectedCartDetails && setSelectedCartDetails(cart)}>
                    <Eye size={13} /> Details
                  </button>
                  <button type="button" className="admin-btn cart-mobile-delete" onClick={() => handleDeleteCart && handleDeleteCart(cart.session_id || cart.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        
        <div className="table-responsive admin-desktop-table" style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <table className="spreadsheet-table responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(30, 41, 59, 0.8)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <tr>
                <th style={{ padding: '12px 16px', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={filteredAndSortedCarts.length > 0 && selectedCarts && selectedCarts.length === filteredAndSortedCarts.length}
                    onChange={handleSelectAllCartsLocal}
                    style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
                  />
                </th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Customer</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Date</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Cart Value</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Items</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Status</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedCarts.map((cart, index) => {
                const total = calculateCartTotal(cart.cart_data);
                const items = getCartItems(cart.cart_data);
                const isSelected = selectedCarts && selectedCarts.includes(cart.session_id || cart.id);
                
                return (
                  <tr 
                    key={cart.id} 
                    style={{ 
                      background: isSelected ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      transition: 'background 0.2s'
                    }}
                  >
                    <td data-label="Select" style={{ padding: '12px 16px' }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={(e) => handleLocalSelectCart(cart.session_id || cart.id, e.target.checked, e.nativeEvent.shiftKey, index)}
                        style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
                      />
                    </td>
                    <td data-label="Customer" style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#f8fafc', wordBreak: 'break-all' }}>
                        {cart.user_email || cart.customer_email || 'Guest Checkout'}
                      </div>
                      {(cart.user_phone || cart.customer_phone) && (
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <MessageCircle size={10} /> {cart.user_phone || cart.customer_phone}
                        </div>
                      )}
                    </td>
                    <td data-label="Date" style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                        <Clock size={12} /> {new Date(cart.created_at).toLocaleDateString()} {new Date(cart.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </td>
                    <td data-label="Cart Value" style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#10b981' }}>${total.toFixed(2)}</span>
                    </td>
                    <td data-label="Items" style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {items.slice(0, 2).map((item, idx) => (
                          <div key={idx} style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Package size={10} style={{ color: '#64748b' }} />
                            <span>{item.qty || item.quantity || 1}x {item.product || item.name || item.product_name || 'Product'}</span>
                          </div>
                        ))}
                        {items.length > 2 && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                            + {items.length - 2} more...
                          </div>
                        )}
                      </div>
                    </td>
                    <td data-label="Status" style={{ padding: '12px 16px' }}>
                      {(() => {
                        const rs = getRecoveryStatus(cart);
                        return (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: `${rs.color}15`, color: rs.color, border: `1px solid ${rs.color}30`, padding: '3px 9px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                            {rs.icon} {rs.label}
                          </div>
                        );
                      })()}
                    </td>
                    <td data-label="Actions" style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => openCustomerFromCart(cart)}
                          style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                          title="Open Customer Profile"
                        >
                          <User size={14} />
                        </button>
                        {(cart.user_phone || cart.customer_phone) && (
                          <button 
                            onClick={() => openCartWhatsApp(cart)}
                            style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                            title="Quick WhatsApp"
                          >
                            <MessageCircle size={14} />
                          </button>
                        )}
                        {(cart.user_email || cart.customer_email) && (
                          <button 
                            onClick={() => handleSendRecoveryEmail && handleSendRecoveryEmail(cart)}
                            style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                            title="Send Recovery Email"
                          >
                            <Mail size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => setSelectedCartDetails && setSelectedCartDetails(cart)}
                          style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteCart && handleDeleteCart(cart.session_id || cart.id)}
                          style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                          title="Delete Cart"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>

      )}
    </div>
  );
}
