"use client";

import React, { useState } from 'react';
import { 
  ShoppingCart, Trash2, Upload, Brain, Sparkles, AlertCircle, 
  Clock, Mail, MessageCircle, ArrowRight, Package, CreditCard
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
  selectedCarts,
  handleSendRecoveryEmail,
  handleDeleteCart
}) {

  // Visual Urgency Calculation
  const getUrgency = (createdAt) => {
    const hours = (new Date() - new Date(createdAt)) / 3600000;
    if (hours < 1) return { color: '#10b981', label: 'Fresh (< 1h)', icon: <Sparkles size={12}/> };
    if (hours < 24) return { color: '#f59e0b', label: 'Warm (< 24h)', icon: <Clock size={12}/> };
    return { color: '#ef4444', label: 'Cold (24h+)', icon: <AlertCircle size={12}/> };
  };

  const calculateCartTotal = (cartData) => {
    if (!cartData) return 0;
    if (typeof cartData.total === 'number') return cartData.total;
    if (Array.isArray(cartData)) {
      return cartData.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    }
    return 0;
  };

  const getCartItems = (cartData) => {
    if (Array.isArray(cartData)) return cartData;
    if (cartData && Array.isArray(cartData.items)) return cartData.items;
    return [];
  };

  return (
    <div className="admin-tab-panel">
      
      {/* HEADER ACTIONS */}
      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)', padding: '10px', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 15px rgba(56, 189, 248, 0.4)' }}>
            <ShoppingCart size={22} />
          </div>
          <div>
            <h2 className="admin-section-title" style={{ margin: 0 }}>Abandoned Carts</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>{abandonedCarts.length} active carts awaiting recovery</p>
          </div>
        </div>
        
        <div className="admin-toolbar-actions">
          {abandonedCarts.length > 0 && (
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
      <div style={{ marginBottom: '30px' }}>
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

      {/* CARTS GRID - MOBILE FIRST CARDS */}
      {abandonedCarts.length === 0 ? (
        <div className="admin-empty-state" style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <div className="empty-icon" style={{ opacity: 0.5 }}><ShoppingCart size={48} /></div>
          <h3>No Abandoned Carts</h3>
          <p>Your checkout funnel is completely clear right now.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {abandonedCarts.map((cart) => {
            const urgency = getUrgency(cart.created_at);
            const total = calculateCartTotal(cart.cart_data);
            const items = getCartItems(cart.cart_data);
            const isSelected = selectedCarts && selectedCarts.includes(cart.id);
            
            return (
              <div 
                key={cart.id} 
                style={{ 
                  background: isSelected ? 'rgba(56, 189, 248, 0.05)' : 'rgba(30, 41, 59, 0.4)', 
                  border: isSelected ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(255,255,255,0.05)', 
                  borderRadius: '16px', 
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                }}
              >
                {/* CARD HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => handleSelectCart && handleSelectCart(cart.id)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#38bdf8' }}
                    />
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', wordBreak: 'break-all' }}>
                        {cart.user_email || 'Guest Checkout'}
                      </div>
                      {cart.user_phone && (
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <MessageCircle size={10} /> {cart.user_phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ background: `${urgency.color}15`, color: urgency.color, border: `1px solid ${urgency.color}30`, padding: '4px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                    {urgency.icon} {urgency.label}
                  </div>
                </div>

                {/* CART SUMMARY */}
                <div style={{ flex: 1, background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '12px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Cart Value</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>${total.toFixed(2)}</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {items.slice(0, 3).map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '6px', color: '#64748b' }}><Package size={12}/></div>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.quantity}x {item.name || item.product_name || 'Product'}</span>
                        <span style={{ color: '#94a3b8' }}>${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                      </div>
                    ))}
                    {items.length > 3 && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>
                        + {items.length - 3} more items...
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD FOOTER ACTIONS */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', gap: '10px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={10} /> {new Date(cart.created_at).toLocaleDateString()} {new Date(cart.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {cart.user_phone && (
                      <button 
                        onClick={() => window.open(`https://wa.me/${cart.user_phone.replace(/\D/g, '')}?text=Hi! We noticed you left some items in your Costa Peptides cart. Can we help you complete your order?`, '_blank')}
                        style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#10b981', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)' }}
                        title="Quick WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </button>
                    )}
                    {cart.user_email && (
                      <button 
                        onClick={() => handleSendRecoveryEmail && handleSendRecoveryEmail(cart)}
                        style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)' }}
                        title="Send Recovery Email"
                      >
                        <Mail size={14} />
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteCart && handleDeleteCart(cart.id)}
                      style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                      title="Delete Cart"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
