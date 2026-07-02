{activeTab === 'leads' && (() => {
          const uniqueAreas = Array.from(new Set(leads.map(l => l.region || l.city).filter(Boolean))).sort();
          
          // Calculate Stats dynamically
          const totalLeads = leads.length;
          const waLeads = leads.filter(l => l.contact_method === 'whatsapp').length;
          const emailLeads = totalLeads - waLeads;
          const waPercent = totalLeads > 0 ? Math.round((waLeads / totalLeads) * 100) : 0;
          const emailPercent = totalLeads > 0 ? 100 - waPercent : 0;
          
          const convertedLeads = leads.filter(l => getLeadConversion(l).converted).length;
          const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0.0';
          
          const adsLeads = leads.filter(l => l.utm_source || l.utm_medium || l.utm_campaign).length;
          const organicLeads = totalLeads - adsLeads;
          const adsPercent = totalLeads > 0 ? Math.round((adsLeads / totalLeads) * 100) : 0;
          const organicPercent = totalLeads > 0 ? 100 - adsPercent : 0;

          const totalLeadsPages = Math.ceil(filteredLeads.length / leadsPerPage);

          return (
            <div className="admin-orders-tab admin-tab-panel">
              <div className="admin-section-header admin-leads-header">
                <div>
                  <h2 className="admin-section-title">Catalog Access Leads</h2>
                  <p className="admin-page-subtitle">Users who provided their contact info to view the catalog.</p>
                </div>
                <div>
                  <button 
                    className={`admin-btn admin-btn-danger ${selectedLeads.length === 0 ? 'disabled' : ''}`}
                    onClick={handleBulkDeleteLeads}
                    disabled={selectedLeads.length === 0}
                    style={{ opacity: selectedLeads.length === 0 ? 0.5 : 1, cursor: selectedLeads.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    <Trash2 size={16} /> Delete Selected {selectedLeads.length > 0 ? `(${selectedLeads.length})` : ''}
                  </button>
                  <button 
                    className="admin-btn admin-btn-secondary"
                    onClick={() => setExportModalType('leads')}
                    disabled={leads.length === 0}
                  >
                    <Download size={16} /> Export Data
                  </button>
                </div>
              </div>

              {/* Funnel Metrics Grid */}
              <div className="admin-funnel-grid">
                {/* Captured Leads Card */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(56, 189, 248, 0.15)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'blur(8px)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Subtle Background Glow Accent */}
                  <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)', borderRadius: '50%' }}></div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      padding: '10px',
                      borderRadius: '12px',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)'
                    }}>
                      <Users size={20} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Captured Leads</div>
                    <div style={{ fontSize: '2rem', fontWeight: '950', color: '#f8fafc', margin: '4px 0 2px 0', lineHeight: '1', letterSpacing: '-0.02em' }}>{totalLeads}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Lifetime visitors captured</div>
                  </div>
                </div>

                {/* Lead-to-Order Conversion Card */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(34, 197, 94, 0.15)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'blur(8px)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Subtle Background Glow Accent */}
                  <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%)', borderRadius: '50%' }}></div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                      padding: '10px',
                      borderRadius: '12px',
                      color: '#4ade80',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 15px rgba(34, 197, 94, 0.2)'
                    }}>
                      <TrendingUp size={20} />
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 8px', borderRadius: '20px' }}>
                      Target: 10%
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conversion Rate</div>
                    <div style={{ fontSize: '2rem', fontWeight: '950', color: '#4ade80', margin: '4px 0 2px 0', lineHeight: '1', letterSpacing: '-0.02em' }}>{conversionRate}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>{convertedLeads} matched purchases</div>
                    
                    {/* Sleek Progress Indicator */}
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '5px', width: '100%', marginTop: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(parseFloat(conversionRate) * 10, 100)}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)', borderRadius: '4px', boxShadow: '0 0 8px rgba(74, 222, 128, 0.5)' }}></div>
                    </div>
                  </div>
                </div>

                {/* Preferred Method Card */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(168, 85, 247, 0.15)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'blur(8px)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Subtle Background Glow Accent */}
                  <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, transparent 70%)', borderRadius: '50%' }}></div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{
                      background: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                      padding: '10px',
                      borderRadius: '12px',
                      color: '#c084fc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 15px rgba(168, 85, 247, 0.2)'
                    }}>
                      <Smartphone size={20} />
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.25)', color: '#c084fc', padding: '2px 8px', borderRadius: '20px' }}>
                      Bilingual
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preferred Method</div>
                    <div style={{ fontSize: '2rem', fontWeight: '950', color: '#c084fc', margin: '4px 0 2px 0', lineHeight: '1', letterSpacing: '-0.02em' }}>{waPercent}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>WhatsApp ({emailPercent}% Email requests)</div>
                    
                    {/* Visual Percentage Split Pill */}
                    <div style={{ display: 'flex', height: '5px', borderRadius: '3px', overflow: 'hidden', marginTop: '10px', background: 'rgba(255,255,255,0.05)' }}>
                      <div style={{ width: `${waPercent}%`, background: 'linear-gradient(90deg, #a855f7, #c084fc)' }}></div>
                      <div style={{ width: `${emailPercent}%`, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)' }}></div>
                    </div>
                  </div>
                </div>

                {/* Attribution Mix Card */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                  backdropFilter: 'blur(8px)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Subtle Background Glow Accent */}
                  <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', background: 'radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%)', borderRadius: '50%' }}></div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      padding: '10px',
                      borderRadius: '12px',
                      color: '#fbbf24',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 15px rgba(245, 158, 11, 0.2)'
                    }}>
                      <Target size={20} />
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.25)', color: '#fbbf24', padding: '2px 8px', borderRadius: '20px' }}>
                      UTMs Active
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attribution Mix</div>
                    <div style={{ fontSize: '2rem', fontWeight: '950', color: '#fbbf24', margin: '4px 0 2px 0', lineHeight: '1', letterSpacing: '-0.02em' }}>{adsPercent}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Paid Ads ({organicPercent}% Organic / Direct)</div>
                    
                    {/* Visual Segment Split */}
                    <div style={{ display: 'flex', height: '5px', borderRadius: '3px', overflow: 'hidden', marginTop: '10px', background: 'rgba(255,255,255,0.05)' }}>
                      <div style={{ width: `${adsPercent}%`, background: 'linear-gradient(90deg, #d97706, #fbbf24)' }}></div>
                      <div style={{ width: `${organicPercent}%`, background: 'linear-gradient(90deg, #475569, #94a3b8)' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* LEADS AI CAMPAIGN STRATEGY CARD */}
              <div className="admin-leads-padded" style={{ marginBottom: '24px' }}>
                {generatingLeadsAi ? (
                  <div style={{ background: 'linear-gradient(135deg, rgba(14, 22, 38, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="sync-spinner" style={{ color: '#38bdf8' }}><Brain size={32} /></div>
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 4px 0' }}>🧬 AI Copilot is scoring catalog access leads and campaigns...</h4>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Mapping geographical interest densities, analyzing UTM traffic conversion velocity, and drafting custom bilingual pitch hooks...</p>
                      </div>
                    </div>
                  </div>
                ) : leadsAiText ? (
                  <div style={{ background: 'linear-gradient(135deg, rgba(14, 26, 51, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 40px -10px rgba(56, 189, 248, 0.15)', position: 'relative' }}>
                    <button 
                      onClick={() => setLeadsAiText('')}
                      style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      &times;
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
                      <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '8px', borderRadius: '10px', color: '#38bdf8' }}>
                        <Sparkles size={20} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>🧬 Real-Time AI Leads Acquisition & Outreach Strategy</h4>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Generated by Gemini • Bilingual Traffic Analysis</span>
                      </div>
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
                  <div 
                    onClick={handleGenerateLeadsAi}
                    style={{ background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.25) 0%, rgba(15, 23, 42, 0.45) 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '10px', borderRadius: '12px', color: '#38bdf8' }}>
                        <Brain size={20} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 2px 0' }}>✨ Generate Real-Time AI Lead Insights & Campaigns</h4>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Score catalog lead sources, analyze regional demand densities, and draft hyper-targeted outbound campaigns in English & Spanish.</p>
                      </div>
                    </div>
                    <button 
                      className="admin-btn admin-btn-primary" 
                      style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateLeadsAi();
                      }}
                    >
                      <Sparkles size={13} /> Audit Leads
                    </button>
                  </div>
                )}
              </div>

              {/* Filtering Controls */}
              <div className="admin-leads-padded admin-bulk-actions" style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 auto', minWidth: '220px' }}>
                  <input 
                    className="admin-input"
                    type="text" 
                    placeholder="Search by email, phone, city, campaign..." 
                    value={leadsSearch}
                    onChange={(e) => {
                      setLeadsSearch(e.target.value);
                      setLeadsCurrentPage(1);
                    }}
                    style={{ paddingLeft: '36px', width: '100%' }}
                  />
                  <span style={{ position: 'absolute', left: '12px', top: '52%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.9rem' }}>🔍</span>
                </div>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Source Filter */}
                  <select
                    className="admin-select"
                    value={leadsSourceFilter}
                    onChange={(e) => {
                      setLeadsSourceFilter(e.target.value);
                      setLeadsCurrentPage(1);
                    }}
                  >
                    <option value="All">📢 All Attribution Sources</option>
                    <option value="Ads">🎯 Paid Ads (Any utm_source)</option>
                    <option value="Direct">🌐 Direct / Organic Traffic</option>
                    <option value="instagram">📸 Instagram</option>
                    <option value="facebook">👥 Facebook</option>
                    <option value="google">🔎 Google</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="linkedin">👔 LinkedIn</option>
                    <option value="pinterest">📌 Pinterest</option>
                  </select>

                  {/* Area/Region Filter */}
                  <select
                    className="admin-select"
                    value={leadsAreaFilter}
                    onChange={(e) => {
                      setLeadsAreaFilter(e.target.value);
                      setLeadsCurrentPage(1);
                    }}
                  >
                    <option value="All">📍 All Areas / Locations</option>
                    {uniqueAreas.map(area => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                  
                  {/* Clear Filters */}
                  {(leadsSearch || leadsSourceFilter !== 'All' || leadsAreaFilter !== 'All') && (
                    <button
                      onClick={() => {
                        setLeadsSearch('');
                        setLeadsSourceFilter('All');
                        setLeadsAreaFilter('All');
                        setLeadsCurrentPage(1);
                      }}
                      style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          
          {loadingLeads ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading leads...</div>
          ) : leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No leads captured yet.</div>
          ) : filteredLeads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No leads match your active filters.</div>
          ) : (
            <div className="table-responsive admin-table-wrap" style={{ background: '#0e1626', borderRadius: '12px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
              <table className="spreadsheet-table responsive-table">
                <thead>
                  <tr>
                    <th style={{ padding: '10px 12px', width: '40px' }}>
                      <input 
                        type="checkbox" 
                        checked={paginatedLeads.length > 0 && paginatedLeads.every(l => selectedLeads.includes(l.id))}
                        onChange={(e) => handleSelectAllLeads(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ padding: '10px 12px' }}>Date</th>
                    <th style={{ padding: '10px 12px' }}>Contact Details</th>
                    <th style={{ padding: '10px 12px', minWidth: '150px' }}>Location</th>
                    <th style={{ padding: '10px 12px' }}>Attribution</th>
                    <th style={{ padding: '10px 12px' }}>Last Contacted</th>
                    <th style={{ padding: '10px 12px' }}>Browsing History</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.map((lead, index) => (
                  <tr key={lead.id}>
                    <td data-label="Select" style={{ padding: '10px 12px' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedLeads.includes(lead.id)}
                        onClick={(e) => {
                          const checked = e.target.checked;
                          const shiftKey = e.shiftKey;
                          handleSelectLead(lead.id, checked, shiftKey, index);
                        }}
                        onChange={() => {}}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td data-label="Date" style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      {new Date(lead.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                    </td>
                    <td data-label="Contact Details" style={{ padding: '10px 12px' }}>
                      {editingLeadId === lead.id ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <select 
                            value={editLeadMethod} 
                            onChange={(e) => setEditLeadMethod(e.target.value)}
                            className="admin-select"
                            style={{ width: '90px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem' }}
                          >
                            <option value="whatsapp">whatsapp</option>
                            <option value="email">email</option>
                          </select>
                          <input 
                            type="text" 
                            value={editLeadValue} 
                            onChange={(e) => setEditLeadValue(e.target.value)}
                            className="admin-input"
                            style={{ flex: 1, padding: '4px 8px', height: 'auto', fontSize: '0.8rem' }}
                          />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ 
                              background: lead.contact_method === 'whatsapp' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)', 
                              color: lead.contact_method === 'whatsapp' ? '#4ade80' : '#38bdf8', 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.7rem', 
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              border: lead.contact_method === 'whatsapp' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                            }}>
                              {lead.contact_method === 'whatsapp' ? '💬 WA' : '✉️ Email'}
                            </span>
                            <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem' }}>
                              {lead.contact_value}
                            </span>
                            <span style={{ padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 'bold' }}>
                              {lead.language ? lead.language.toUpperCase() : 'EN'}
                            </span>
                            {lead.contact_method === 'whatsapp' ? (
                              <button 
                                onClick={() => openLeadOutreachComposer(lead, 'whatsapp')}
                                style={{
                                  color: '#4ade80',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'rgba(34, 197, 94, 0.1)',
                                  borderRadius: '50%',
                                  width: '22px',
                                  height: '22px',
                                  fontSize: '0.75rem',
                                  border: '1px solid rgba(34, 197, 94, 0.2)',
                                  cursor: 'pointer'
                                }}
                                title="Open AI WhatsApp Outreach Composer"
                              >
                                💬
                              </button>
                            ) : (
                              <button 
                                onClick={() => openLeadOutreachComposer(lead, 'email')}
                                style={{
                                  color: '#38bdf8',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'rgba(56, 189, 248, 0.1)',
                                  borderRadius: '50%',
                                  width: '22px',
                                  height: '22px',
                                  fontSize: '0.75rem',
                                  border: '1px solid rgba(56, 189, 248, 0.2)',
                                  cursor: 'pointer'
                                }}
                                title="Open AI Email Outreach Composer"
                              >
                                ✉️
                              </button>
                            )}
                          </div>
                              {(() => {
                                const conv = getLeadConversion(lead);
                                if (conv.converted) {
                                  return (
                                    <span 
                                      onClick={() => setSelectedOrderDetails(conv.order)}
                                      style={{ 
                                        padding: '2px 6px', 
                                        background: 'rgba(34, 197, 94, 0.15)', 
                                        borderRadius: '4px', 
                                        fontSize: '0.68rem', 
                                        color: '#4ade80', 
                                        fontWeight: 'bold', 
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                        border: '1px solid rgba(34, 197, 94, 0.2)',
                                        alignSelf: 'flex-start',
                                        marginTop: '2px'
                                      }}
                                      title={`Matches Order #${conv.order.order_number || conv.order.id}`}
                                    >
                                      🎉 Converted (Order #{conv.order.order_number || conv.order.id?.substring(0, 6)})
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        </td>
                        <td data-label="Location" style={{ padding: '10px 12px', minWidth: '150px', whiteSpace: 'nowrap' }}>
                          {lead.city || lead.country ? (
                            <span style={{ color: '#f8fafc', fontSize: '0.85rem' }}>
                              {[lead.city, lead.country].filter(Boolean).join(', ')}
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>—</span>
                          )}
                        </td>
                        <td data-label="Attribution" style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                            <span style={{ 
                              ...getReferralBadgeStyles(getReferralLabel(lead)),
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              display: 'inline-block'
                            }}>
                              {getReferralLabel(lead)}
                            </span>
                            {lead.utm_campaign && (
                              <span style={{ 
                                fontSize: '0.7rem', 
                                color: '#38bdf8', 
                                fontWeight: '800', 
                                background: 'rgba(56, 189, 248, 0.1)', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                border: '1px solid rgba(56, 189, 248, 0.15)'
                              }}>
                                📢 {lead.utm_campaign}
                              </span>
                            )}
                            {lead.utm_medium && (
                              <span style={{ 
                                fontSize: '0.65rem', 
                                color: '#94a3b8',
                                background: 'rgba(255, 255, 255, 0.03)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                display: 'inline-block'
                              }}>
                                medium: <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>{lead.utm_medium}</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td data-label="Last Contacted" style={{ padding: '10px 12px' }}>
                          {(() => {
                            if (!lead.last_contacted_at) {
                              return (
                                <span style={{ 
                                  background: 'rgba(255,255,255,0.03)', 
                                  color: '#64748b', 
                                  padding: '4px 8px', 
                                  borderRadius: '6px', 
                                  fontSize: '0.75rem', 
                                  fontWeight: 'bold',
                                  border: '1px solid rgba(255,255,255,0.06)'
                                }}>
                                  Never
                                </span>
                              );
                            }
                            const contactedDate = new Date(lead.last_contacted_at);
                            const isRecent = (new Date() - contactedDate) < 259200000;
                            return (
                              <span style={{ 
                                background: isRecent ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)', 
                                color: isRecent ? '#fbbf24' : '#4ade80', 
                                padding: '4px 8px', 
                                borderRadius: '6px', 
                                fontSize: '0.75rem', 
                                fontWeight: 'bold',
                                border: isRecent ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }} title={`Last contacted on: ${contactedDate.toLocaleString()}`}>
                                {isRecent ? '⚠️ ' : ''}{formatRelativeTime(lead.last_contacted_at)}
                              </span>
                            );
                          })()}
                        </td>

                        <td data-label="Browsing History" style={{ padding: '10px 12px' }}>
                          {(() => {
                            const views = productViews.filter(v => v.contact_value === lead.contact_value);
                            if (views.length === 0) return <span style={{ color: '#64748b', fontSize: '0.8rem' }}>No views</span>;
                            return (
                              <button 
                                onClick={() => setSelectedLeadDetails(lead)}
                                style={{ 
                                  background: 'rgba(56, 189, 248, 0.1)', 
                                  border: '1px solid rgba(56, 189, 248, 0.2)', 
                                  color: '#38bdf8', 
                                  padding: '4px 10px', 
                                  borderRadius: '20px', 
                                  fontSize: '0.75rem', 
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                              >
                                👀 {views.length} {views.length === 1 ? 'Product' : 'Products'}
                              </button>
                            );
                          })()}
                        </td>
                        <td data-label="Actions" style={{ padding: '10px 12px' }}>
                          <div className="admin-card-actions">
                            {editingLeadId === lead.id ? (
                              <button 
                                className="admin-btn admin-btn-success" 
                                onClick={() => handleLeadUpdate(lead.id)}
                              >
                                Save
                              </button>
                            ) : (
                              <>
                                <button 
                                  className="admin-btn admin-btn-primary" 
                                  onClick={() => setSelectedLeadDetails(lead)}
                                >
                                  Details
                                </button>
                                <button 
                                  className="admin-btn admin-btn-secondary" 
                                  onClick={() => {
                                    setEditingLeadId(lead.id);
                                    setEditLeadValue(lead.contact_value);
                                    setEditLeadMethod(lead.contact_method);
                                  }}
                                >
                                  Edit
                                </button>
                              </>
                            )}
                            <button 
                              className="admin-btn admin-btn-danger" 
                              onClick={() => handleLeadDelete(lead.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {filteredLeads.length > 0 && (
              <div className="admin-pagination-bar">
                <div className="admin-pagination-info">
                  Showing {Math.min(filteredLeads.length, (leadsCurrentPage - 1) * leadsPerPage + 1)} to {Math.min(filteredLeads.length, leadsCurrentPage * leadsPerPage)} of {filteredLeads.length} leads
                </div>
                <div className="admin-pagination-controls">
                  <button 
                    className="admin-pagination-btn"
                    onClick={() => setLeadsCurrentPage(p => Math.max(1, p - 1))}
                    disabled={leadsCurrentPage === 1}
                  >
                    &laquo; Prev
                  </button>
                  {Array.from({ length: totalLeadsPages }, (_, i) => i + 1)
                    .filter(page => {
                      return page === 1 || 
                             page === totalLeadsPages || 
                             Math.abs(page - leadsCurrentPage) <= 1;
                    })
                    .map((page, index, array) => {
                      const elements = [];
                      if (index > 0 && page - array[index - 1] > 1) {
                        elements.push(
                          <span key={`ell-${page}`} style={{ padding: '0 8px', color: '#64748b', fontSize: '0.8rem' }}>
                            ...
                          </span>
                        );
                      }
                      elements.push(
                        <button
                          key={page}
                          className={`admin-pagination-btn ${leadsCurrentPage === page ? 'active' : ''}`}
                          onClick={() => setLeadsCurrentPage(page)}
                        >
                          {page}
                        </button>
                      );
                      return elements;
                    })
                  }
                  <button 
                    className="admin-pagination-btn"
                    onClick={() => setLeadsCurrentPage(p => Math.min(totalLeadsPages, p + 1))}
                    disabled={leadsCurrentPage === totalLeadsPages}
                  >
                    Next &raquo;
                  </button>
                </div>
                <div>
                  <select
                    className="admin-pagination-limit"
                    value={leadsPerPage}
                    onChange={(e) => {
                      setLeadsPerPage(Number(e.target.value));
                      setLeadsCurrentPage(1);
                    }}
                  >
                    <option value={10}>Show 10</option>
                    <option value={25}>Show 25</option>
                    <option value={50}>Show 50</option>
                    <option value={100}>Show 100</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* TAB: TEAM MANAGEMENT */}
        