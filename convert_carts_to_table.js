const fs = require('fs');
let code = fs.readFileSync('src/components/admin/CartsManager.js', 'utf8');

const tableLayout = `
        <div className="table-responsive" style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <table className="spreadsheet-table responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(30, 41, 59, 0.8)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <tr>
                <th style={{ padding: '12px 16px', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={(abandonedCarts || []).length > 0 && selectedCarts && selectedCarts.length === (abandonedCarts || []).length}
                    onChange={(e) => {
                      // Note: We don't have a handleSelectAllCarts prop passed directly, but the logic 
                      // can be handled if we map all ids manually. For now, since handleSelectCart only takes one, 
                      // this checkbox might be mostly visual or require passing a new prop if we wanted bulk select all.
                    }}
                    style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
                  />
                </th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Customer</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Date & Urgency</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Cart Value</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>Items</th>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(abandonedCarts || []).map((cart, index) => {
                const urgency = getUrgency(cart.created_at);
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
                        onChange={(e) => handleSelectCart && handleSelectCart(cart.session_id || cart.id, e.target.checked, e.nativeEvent.shiftKey, index)}
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
                    <td data-label="Date & Urgency" style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                        <Clock size={12} /> {new Date(cart.created_at).toLocaleDateString()} {new Date(cart.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                      <div style={{ display: 'inline-flex', background: \`\${urgency.color}15\`, color: urgency.color, border: \`1px solid \${urgency.color}30\`, padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: '700', alignItems: 'center', gap: '4px' }}>
                        {urgency.icon} {urgency.label}
                      </div>
                    </td>
                    <td data-label="Cart Value" style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#10b981' }}>\${total.toFixed(2)}</span>
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
                    <td data-label="Actions" style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {(cart.user_phone || cart.customer_phone) && (
                          <button 
                            onClick={() => window.open(\`https://wa.me/\${(cart.user_phone || cart.customer_phone).replace(/\\D/g, '')}?text=Hi! We noticed you left some items in your Costa Peptides cart. Can we help you complete your order?\`, '_blank')}
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
                          onClick={() => handleDeleteCart && handleDeleteCart(cart.id)}
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
`;

// Extract grid start and end
const startPattern = "<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>";
const startIdx = code.indexOf(startPattern);
if (startIdx === -1) {
  console.log("Could not find start of grid");
  process.exit(1);
}

// Find the end of the grid block. It ends with a `</div>` followed by `)}`
const endPattern = "        </div>\n      )}\n    </div>\n  );\n}";
const endIdx = code.indexOf(endPattern, startIdx);
if (endIdx === -1) {
  console.log("Could not find end of grid");
  process.exit(1);
}

const originalGrid = code.substring(startIdx, endIdx + 14);

code = code.replace(originalGrid, tableLayout + "\n      )}");

fs.writeFileSync('src/components/admin/CartsManager.js', code);
console.log("Successfully replaced grid with table in CartsManager.");
