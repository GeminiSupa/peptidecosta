"use client";

import React from 'react';
import { 
  Users, Trash2, Upload, Brain, Sparkles, 
  Clock, Mail, MessageCircle, Target, Flame, Snowflake, Globe, ChevronLeft, ChevronRight
} from 'lucide-react';

const FacebookIcon = ({ size = 14, color = "currentColor", style, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={color} style={style} {...props}>
    <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z" />
  </svg>
);

export default function LeadsManager({
  leads,
  loadAdminData,
  setExportModalType,
  generatingLeadsAi,
  leadsAiText,
  setLeadsAiText,
  handleGenerateLeadsAi,
  getLeadConversion,
  handleSelectLead,
  handleSelectAllLeads,
  selectedLeads,
  handleBulkLeadsEmail,
  handleBulkLeadsWhatsApp,
  handleBulkDeleteLeads,
  handleLeadUpdate,
  handleLeadDelete,
  leadsSearch,
  setLeadsSearch,
  leadsSourceFilter,
  setLeadsSourceFilter,
  leadsAreaFilter,
  setLeadsAreaFilter,
  page,
  setPage,
  leadsPerPage = 50,
  productViews = [],
  setSelectedLeadDetails,
  openLeadOutreachComposer
}) {

  const uniqueAreas = Array.from(new Set((leads || []).map(l => l.region || l.city).filter(Boolean))).sort();

  // Stats
  const safeLeads = leads || [];
  const totalLeads = safeLeads.length;
  const waLeads = safeLeads.filter(l => l.contact_method === 'whatsapp').length;
  const convertedLeads = safeLeads.filter(l => getLeadConversion(l).converted).length;
  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0.0';
  const adsLeads = safeLeads.filter(l => l.utm_source || l.utm_medium || l.utm_campaign || (l.source && l.source.toLowerCase().includes('facebook'))).length;
  const organicLeads = totalLeads - adsLeads;

  // Filtering
  const filteredLeads = safeLeads.filter(l => {
    if (leadsSearch) {
      const q = leadsSearch.toLowerCase();
      const match = (
        String(l.first_name || '').toLowerCase().includes(q) ||
        String(l.last_name || '').toLowerCase().includes(q) ||
        String(l.contact_value || l.phone || l.email || '').toLowerCase().includes(q)
      );
      if (!match) return false;
    }
    if (leadsSourceFilter && leadsSourceFilter !== 'All') {
      if (leadsSourceFilter === 'whatsapp' && l.contact_method !== 'whatsapp') return false;
      if (leadsSourceFilter === 'email' && l.contact_method !== 'email') return false;
      if (leadsSourceFilter === 'converted' && !getLeadConversion(l).converted) return false;
      if (leadsSourceFilter === 'facebook' && !(l.source && String(l.source).toLowerCase().includes('facebook'))) return false;
    }
    if (leadsAreaFilter && leadsAreaFilter !== 'All') {
      if (l.region !== leadsAreaFilter && l.city !== leadsAreaFilter) return false;
    }
    return true;
  });

  const safePage = page || 1;
  const totalPages = Math.ceil(filteredLeads.length / leadsPerPage);
  const currentLeads = filteredLeads.slice((safePage - 1) * leadsPerPage, safePage * leadsPerPage);

  const safeSelectedLeads = selectedLeads || [];
  const isAllCurrentSelected = currentLeads.length > 0 && currentLeads.every(l => safeSelectedLeads.includes(l.id));

  // Temperature Logic
  const getLeadTemp = (lead) => {
    if (!lead) return { color: '#38bdf8', label: 'Warm', icon: '❄️' };
    const isConverted = getLeadConversion(lead).converted;
    if (isConverted) return { color: '#10b981', label: 'Converted', icon: '✅' };
    if (lead.tags && lead.tags.includes('VIP')) return { color: '#8b5cf6', label: 'VIP', icon: '⭐' };
    if (lead.utm_source || lead.utm_medium || (lead.source && String(lead.source).toLowerCase().includes('facebook'))) {
      return { color: '#f97316', label: 'Hot', icon: '🔥' };
    }
    return { color: '#38bdf8', label: 'Warm', icon: '❄️' };
  };

  const getViews = (lead) => {
    return productViews.filter(v => v.contact_value === lead.contact_value).length;
  };

  // Styles
  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    transition: 'background 0.15s',
    flexWrap: 'wrap',
  };

  const pillStyle = (color) => ({
    background: `${color}18`,
    color: color,
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '0.7rem',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
  });

  const iconBtnStyle = (bg) => ({
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    background: bg,
    color: '#fff',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
  });

  return (
    <div className="admin-tab-panel">
      
      {/* HEADER */}
      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '10px', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)' }}>
            <Users size={22} />
          </div>
          <div>
            <h2 className="admin-section-title" style={{ margin: 0 }}>CRM Lead Pipeline</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Total {totalLeads} Leads | {conversionRate}% Conversion Rate</p>
          </div>
        </div>
        
        <div className="admin-toolbar-actions">
          {leads.length > 0 && (
            <button
              onClick={() => setExportModalType('leads')}
              style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={14} /> Export
            </button>
          )}
          <button className="admin-btn" onClick={loadAdminData} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* QUICK STATS ROW */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 120px', background: 'rgba(30, 41, 59, 0.4)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ads</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f97316' }}>{adsLeads}</div>
        </div>
        <div style={{ flex: '1 1 120px', background: 'rgba(30, 41, 59, 0.4)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Organic</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#38bdf8' }}>{organicLeads}</div>
        </div>
        <div style={{ flex: '1 1 120px', background: 'rgba(16, 185, 129, 0.08)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
          <div style={{ fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Converted</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#10b981' }}>{convertedLeads}</div>
        </div>
      </div>

      {/* AI ANALYSIS - COMPACT */}
      <div style={{ marginBottom: '20px' }}>
        {generatingLeadsAi ? (
          <div style={{ background: 'rgba(14, 22, 38, 0.9)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="sync-spinner" style={{ color: '#38bdf8' }}><Brain size={24} /></div>
            <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>AI analyzing leads...</span>
          </div>
        ) : leadsAiText ? (
          <div style={{ background: 'rgba(14, 26, 51, 0.95)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '20px', position: 'relative' }}>
            <button 
              onClick={() => setLeadsAiText('')}
              style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              &times;
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Sparkles size={18} style={{ color: '#38bdf8' }}/>
              <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#f8fafc' }}>AI Lead Intelligence</span>
            </div>
            <div 
              style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{
                __html: leadsAiText
                  .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #38bdf8">$1</strong>')
                  .replace(/^- (.*)$/gm, '<li style="margin-left: 12px; margin-bottom: 6px; list-style-type: square">$1</li>')
              }}
            />
          </div>
        ) : (
          <button 
            onClick={handleGenerateLeadsAi}
            style={{ width: '100%', background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s', color: '#f8fafc' }}
          >
            <Brain size={20} style={{ color: '#38bdf8' }}/>
            <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>✨ Analyze Leads with AI</span>
          </button>
        )}
      </div>

      {/* SEARCH AND FILTERS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          className="admin-input"
          placeholder="Search name, phone, email..."
          value={leadsSearch}
          onChange={(e) => setLeadsSearch(e.target.value)}
          style={{ flex: '1 1 200px', padding: '8px 12px', fontSize: '0.85rem' }}
        />
        <select 
          className="admin-select"
          value={leadsSourceFilter}
          onChange={(e) => setLeadsSourceFilter(e.target.value)}
          style={{ flex: '0 1 140px', padding: '8px', fontSize: '0.85rem' }}
        >
          <option value="All">All Sources</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="facebook">Facebook Ads</option>
          <option value="converted">Converted</option>
        </select>
        <select
          className="admin-select"
          value={leadsAreaFilter}
          onChange={(e) => setLeadsAreaFilter(e.target.value)}
          style={{ flex: '0 1 140px', padding: '8px', fontSize: '0.85rem' }}
        >
          <option value="All">All Regions</option>
          {uniqueAreas.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* BULK ACTIONS */}
      {selectedLeads && selectedLeads.length > 0 && (
        <div style={{ marginBottom: '12px', padding: '10px 16px', background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{selectedLeads.length} Selected</span>
          <span style={{ color: '#334155' }}>|</span>
          <button onClick={handleBulkLeadsEmail} style={{ ...iconBtnStyle('#3b82f6'), width: 'auto', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', gap: '4px', display: 'inline-flex' }}>
            <Mail size={12} /> Email
          </button>
          <button onClick={handleBulkLeadsWhatsApp} style={{ ...iconBtnStyle('#10b981'), width: 'auto', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', gap: '4px', display: 'inline-flex' }}>
            <MessageCircle size={12} /> WhatsApp
          </button>
          <button onClick={handleBulkDeleteLeads} style={{ ...iconBtnStyle('rgba(239,68,68,0.15)'), width: 'auto', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', background: 'transparent', gap: '4px', display: 'inline-flex' }}>
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}

      {/* LEADS LIST */}
      {currentLeads.length === 0 ? (
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '12px', padding: '40px 20px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <Users size={36} style={{ color: '#334155', marginBottom: '10px' }} />
          <h3 style={{ color: '#94a3b8', margin: 0, fontSize: '1rem' }}>No Leads Found</h3>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: '0.85rem' }}>Try adjusting your search filters.</p>
        </div>
      ) : (
        <div style={{ background: 'rgba(30, 41, 59, 0.3)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          
          {/* Select All Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' }}>
            <input 
              type="checkbox"
              checked={isAllCurrentSelected}
              onChange={() => handleSelectAllLeads(currentLeads.map(l => l.id), isAllCurrentSelected)}
              style={{ width: '15px', height: '15px', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Select all {currentLeads.length} on this page</span>
            <span style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.75rem' }}>{filteredLeads.length} total</span>
          </div>

          {/* Lead Rows */}
          {currentLeads.map((lead) => {
            const isSelected = selectedLeads && selectedLeads.includes(lead.id);
            const temp = getLeadTemp(lead);
            const views = getViews(lead);
            const name = (lead.first_name || lead.last_name) 
              ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() 
              : 'Unknown';
            const contact = lead.contact_value || lead.phone || lead.email || '';
            const location = [lead.city, lead.region].filter(Boolean).join(', ');

            return (
              <div 
                key={lead.id} 
                style={{
                  ...rowStyle,
                  background: isSelected ? 'rgba(56, 189, 248, 0.04)' : 'transparent',
                }}
              >
                {/* Checkbox */}
                <input 
                  type="checkbox" 
                  checked={isSelected}
                  onChange={() => handleSelectLead && handleSelectLead(lead.id)}
                  style={{ width: '15px', height: '15px', accentColor: '#38bdf8', cursor: 'pointer', flexShrink: 0 }}
                />

                {/* Name + Contact - clickable to open details */}
                <div 
                  onClick={() => setSelectedLeadDetails?.(lead)}
                  style={{ flex: '1 1 180px', minWidth: 0, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {contact}
                  </div>
                </div>

                {/* Pills row */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', flex: '0 1 auto', alignItems: 'center' }}>
                  {/* Temperature */}
                  <span style={pillStyle(temp.color)}>
                    {temp.icon} {temp.label}
                  </span>

                  {/* Location */}
                  {location && (
                    <span style={pillStyle('#64748b')}>
                      📍 {location.length > 18 ? location.substring(0, 18) + '…' : location}
                    </span>
                  )}

                  {/* Product Views */}
                  {views > 0 && (
                    <span 
                      onClick={() => setSelectedLeadDetails?.(lead)}
                      style={{ ...pillStyle('#10b981'), cursor: 'pointer' }}
                    >
                      👀 {views}
                    </span>
                  )}

                  {/* Source */}
                  {lead.utm_source && (
                    <span style={pillStyle('#f97316')}>
                      📢 {String(lead.utm_source).length > 12 ? String(lead.utm_source).substring(0, 12) + '…' : lead.utm_source}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                  <button 
                    onClick={() => {
                      if (openLeadOutreachComposer) {
                        openLeadOutreachComposer(lead, 'whatsapp');
                      } else {
                        const val = lead.contact_value || lead.phone;
                        if (val) window.open(`https://wa.me/${String(val).replace(/\D/g, '')}?text=Hi ${lead.first_name || ''}!`, '_blank');
                      }
                    }}
                    style={iconBtnStyle('#10b981')}
                    title="WhatsApp"
                  >
                    <MessageCircle size={13} />
                  </button>
                  {(lead.email || (lead.contact_value && lead.contact_value.includes('@'))) && (
                    <button 
                      onClick={() => {
                        if (openLeadOutreachComposer) {
                          openLeadOutreachComposer(lead, 'email');
                        } else {
                          window.location.href = `mailto:${lead.email || lead.contact_value}`;
                        }
                      }}
                      style={iconBtnStyle('#3b82f6')}
                      title="Email"
                    >
                      <Mail size={13} />
                    </button>
                  )}
                  <button 
                    onClick={() => handleLeadDelete && handleLeadDelete(lead.id)}
                    style={{ ...iconBtnStyle('transparent'), color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
          <button 
            disabled={page === 1} 
            onClick={() => setPage(page - 1)}
            style={{ ...iconBtnStyle('rgba(255,255,255,0.05)'), color: page === 1 ? '#334155' : '#94a3b8', border: '1px solid rgba(255,255,255,0.05)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            {page} / {totalPages}
          </span>
          <button 
            disabled={page === totalPages} 
            onClick={() => setPage(page + 1)}
            style={{ ...iconBtnStyle('rgba(255,255,255,0.05)'), color: page === totalPages ? '#334155' : '#94a3b8', border: '1px solid rgba(255,255,255,0.05)', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

    </div>
  );
}
