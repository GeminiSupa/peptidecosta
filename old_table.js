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
