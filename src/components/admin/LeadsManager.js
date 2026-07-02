"use client";

import React, { useState } from 'react';
import { 
  Users, Trash2, Upload, Brain, Sparkles, AlertCircle, 
  Clock, Mail, MessageCircle, ArrowRight, Target, Flame, Snowflake, Globe
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
  leadsPerPage = 50
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
    if (leadsSourceFilter) {
      if (leadsSourceFilter === 'whatsapp' && l.contact_method !== 'whatsapp') return false;
      if (leadsSourceFilter === 'email' && l.contact_method !== 'email') return false;
      if (leadsSourceFilter === 'converted' && !getLeadConversion(l).converted) return false;
      if (leadsSourceFilter === 'facebook' && !(l.source && String(l.source).toLowerCase().includes('facebook'))) return false;
    }
    if (leadsAreaFilter) {
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
  const getLeadTemperature = (lead) => {
    if (!lead) return { color: '#38bdf8', label: 'Warm (Organic)', icon: <Snowflake size={12}/> };
    const isConverted = getLeadConversion(lead).converted;
    if (isConverted) return { color: '#10b981', label: 'Converted', icon: <Target size={12}/> };
    if (lead.tags && lead.tags.includes('VIP')) return { color: '#8b5cf6', label: 'VIP', icon: <Sparkles size={12}/> };
    if (lead.utm_source || lead.utm_medium || (lead.source && String(lead.source).toLowerCase().includes('facebook'))) {
      return { color: '#f97316', label: 'Hot (Ads)', icon: <Flame size={12}/> };
    }
    return { color: '#38bdf8', label: 'Warm (Organic)', icon: <Snowflake size={12}/> };
  };

  const getSourceIcon = (lead) => {
    if (lead.source && String(lead.source).toLowerCase().includes('facebook')) {
      return <FacebookIcon size={14} color="#1877f2" />;
    }
    return <Globe size={14} color="#94a3b8" />;
  };

  return (
    <div className="admin-tab-panel">
      
      {/* HEADER ACTIONS */}
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
              style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
            >
              <Upload size={14} /> Export CRM
            </button>
          )}
          <button className="admin-btn" onClick={loadAdminData} style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* MARKETING METRICS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Paid Traffic (Ads)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f8fafc' }}>{adsLeads}</div>
        </div>
        <div style={{ background: 'rgba(30, 41, 59, 0.4)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Organic / Direct</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f8fafc' }}>{organicLeads}</div>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ fontSize: '0.75rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Converted to Sale</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{convertedLeads}</div>
        </div>
      </div>

      {/* AI ANALYSIS MODULE */}
      <div style={{ marginBottom: '30px' }}>
        {generatingLeadsAi ? (
          <div style={{ background: 'linear-gradient(135deg, rgba(14, 22, 38, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div className="sync-spinner" style={{ color: '#38bdf8' }}><Brain size={32} /></div>
              <div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 4px 0' }}>🧬 AI is analyzing CRM Lead Quality...</h4>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>Evaluating geographic clusters, conversion likelihood, and drafting personalized outreach scripts...</p>
              </div>
            </div>
          </div>
        ) : leadsAiText ? (
          <div style={{ background: 'linear-gradient(135deg, rgba(14, 26, 51, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 40px -10px rgba(56, 189, 248, 0.2)', position: 'relative' }}>
            <button 
              onClick={() => setLeadsAiText('')}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
            >
              &times;
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
              <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '10px', borderRadius: '12px', color: '#38bdf8' }}>
                <Sparkles size={22} />
              </div>
              <div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>🧬 Deep CRM Lead Intelligence</h4>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Generated by Gemini • Geo-Targeted Outreach Scripts</span>
              </div>
            </div>
            
            <div 
              style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}
              dangerouslySetInnerHTML={{
                __html: leadsAiText
                  .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #38bdf8">$1</strong>')
                  .replace(/^- (.*)$/gm, '<li style="margin-left: 12px; margin-bottom: 8px; list-style-type: square">$1</li>')
              }}
            />
          </div>
        ) : (
          <div 
            onClick={handleGenerateLeadsAi}
            className="admin-ai-insight-card"
            style={{ background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.3s', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '12px', borderRadius: '14px', color: '#38bdf8' }}>
                <Brain size={24} />
              </div>
              <div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 4px 0' }}>✨ Generate Real-Time Lead Intelligence</h4>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>Audits your entire CRM pipeline, identifies geographic hot-zones, and writes personalized scripts.</p>
              </div>
            </div>
            <button className="admin-btn admin-btn-primary" style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600' }}>
              <Sparkles size={16} /> Analyze Leads
            </button>
          </div>
        )}
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="admin-filters-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', background: 'rgba(30, 41, 59, 0.3)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <input
          type="text"
          className="admin-input"
          placeholder="Search name, phone, email..."
          value={leadsSearch}
          onChange={(e) => setLeadsSearch(e.target.value)}
          style={{ flex: '1 1 250px' }}
        />
        <select 
          className="admin-select"
          value={leadsSourceFilter}
          onChange={(e) => setLeadsSourceFilter(e.target.value)}
          style={{ flex: '1 1 150px' }}
        >
          <option value="">All Sources</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="facebook">Facebook Ads</option>
          <option value="converted">Converted Only</option>
        </select>
        <select
          className="admin-select"
          value={leadsAreaFilter}
          onChange={(e) => setLeadsAreaFilter(e.target.value)}
          style={{ flex: '1 1 150px' }}
        >
          <option value="">All Regions</option>
          {uniqueAreas.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* BULK ACTIONS BAR */}
      {selectedLeads && selectedLeads.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '12px 20px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{selectedLeads.length} Selected</span>
            <span style={{ color: '#64748b' }}>|</span>
            <button onClick={handleBulkLeadsEmail} className="admin-btn admin-btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail size={12} /> Bulk Email
            </button>
            <button onClick={handleBulkLeadsWhatsApp} className="admin-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#10b981', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageCircle size={12} /> Bulk WhatsApp
            </button>
          </div>
          <button onClick={handleBulkDeleteLeads} className="admin-btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Trash2 size={12} /> Delete Selected
          </button>
        </div>
      )}

      {/* LEADS GRID - MOBILE FIRST CARDS */}
      {currentLeads.length === 0 ? (
        <div className="admin-empty-state" style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', padding: '60px 20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <div className="empty-icon" style={{ opacity: 0.5 }}><Users size={48} /></div>
          <h3>No Leads Found</h3>
          <p>Try adjusting your search filters.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {/* "Select All Current Page" Utility Card */}
          {currentLeads.length > 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 10px' }}>
              <input 
                type="checkbox"
                checked={isAllCurrentSelected}
                onChange={() => handleSelectAllLeads(currentLeads.map(l => l.id), isAllCurrentSelected)}
                style={{ width: '16px', height: '16px', accentColor: '#38bdf8', cursor: 'pointer' }}
                id="selectAllLeads"
              />
              <label htmlFor="selectAllLeads" style={{ color: '#94a3b8', fontSize: '0.9rem', cursor: 'pointer' }}>
                Select all {currentLeads.length} leads on this page
              </label>
            </div>
          )}

          {currentLeads.map((lead) => {
            const isSelected = selectedLeads && selectedLeads.includes(lead.id);
            const temp = getLeadTemperature(lead);
            const { converted } = getLeadConversion(lead);
            
            return (
              <div 
                key={lead.id} 
                style={{ 
                  background: isSelected ? 'rgba(56, 189, 248, 0.05)' : 'rgba(30, 41, 59, 0.4)', 
                  border: isSelected ? '1px solid rgba(56, 189, 248, 0.3)' : (converted ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(255,255,255,0.05)'), 
                  borderRadius: '16px', 
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s',
                  boxShadow: converted ? '0 4px 20px rgba(16, 185, 129, 0.05)' : '0 4px 15px rgba(0,0,0,0.1)'
                }}
              >
                {/* CARD HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => handleSelectLead && handleSelectLead(lead.id)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#38bdf8', marginTop: '4px' }}
                    />
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {lead.first_name || lead.last_name ? `${lead.first_name || ''} ${lead.last_name || ''}` : 'Unknown Lead'}
                        {getSourceIcon(lead)}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px', wordBreak: 'break-all' }}>
                        {lead.contact_value || lead.phone || lead.email}
                      </div>
                    </div>
                  </div>
                  <div style={{ background: `${temp.color}15`, color: temp.color, border: `1px solid ${temp.color}30`, padding: '4px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                    {temp.icon} {temp.label}
                  </div>
                </div>

                {/* LEAD DETAILS */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {(lead.city || lead.region) && (
                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Globe size={12} style={{ color: '#64748b' }}/> 
                      {lead.city}{lead.city && lead.region ? ', ' : ''}{lead.region}
                    </div>
                  )}
                  {lead.utm_source && (
                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Target size={12} style={{ color: '#f97316' }}/> 
                      {lead.utm_source} {lead.utm_campaign ? ` / ${lead.utm_campaign}` : ''}
                    </div>
                  )}
                  {lead.notes && (
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px', marginTop: '4px' }}>
                      "{lead.notes}"
                    </div>
                  )}
                </div>

                {/* TAGS */}
                {lead.tags && lead.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {lead.tags.map(t => (
                      <span key={t} style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '600' }}>
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {/* FOOTER ACTIONS */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {new Date(lead.created_at).toLocaleDateString()}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => {
                        const val = lead.contact_value || lead.phone;
                        if (val) window.open(`https://wa.me/${String(val).replace(/\D/g, '')}?text=Hi ${lead.first_name || ''}!`, '_blank');
                      }}
                      style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#10b981', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)' }}
                      title="Quick WhatsApp"
                    >
                      <MessageCircle size={14} />
                    </button>
                    {(lead.email || lead.contact_value?.includes('@')) && (
                      <button 
                        onClick={() => window.location.href = `mailto:${lead.email || lead.contact_value}`}
                        style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)' }}
                        title="Send Email"
                      >
                        <Mail size={14} />
                      </button>
                    )}
                    <button 
                      onClick={() => handleLeadDelete && handleLeadDelete(lead.id)}
                      style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                      title="Delete Lead"
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

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '30px' }}>
          <button 
            disabled={page === 1} 
            onClick={() => setPage(page - 1)}
            className="admin-btn"
            style={{ padding: '8px 16px', borderRadius: '8px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
          >
            Prev
          </button>
          <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
            Page {page} of {totalPages}
          </span>
          <button 
            disabled={page === totalPages} 
            onClick={() => setPage(page + 1)}
            className="admin-btn"
            style={{ padding: '8px 16px', borderRadius: '8px', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
          >
            Next
          </button>
        </div>
      )}

    </div>
  );
}
