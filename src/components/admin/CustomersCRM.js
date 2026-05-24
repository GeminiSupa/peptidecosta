import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, User, Mail, MessageCircle, MapPin, DollarSign, Calendar, ShoppingBag, Edit2, X, Save, Phone, BadgeCheck, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExportModal from './ExportModal';

export default function CustomersCRM({ orders = [], abandonedCarts = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // Derived customer data from order history and abandoned carts
  const customers = useMemo(() => {
    const map = {};

    const extractCity = (address) => {
      if (!address) return '';
      const lines = address.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length >= 3) {
        // Try to get Province, Canton line
        return lines[2].substring(0, 40);
      }
      return address.replace(/\n/g, ', ').substring(0, 40);
    };

    orders.forEach(o => {
      // Group primarily by email, fallback to phone, then name
      const id = (o.customer_email || '').toLowerCase() || 
                 (o.customer_phone || '').replace(/\D/g, '') || 
                 (o.customer_name || '').toLowerCase() || 
                 'unknown';
                 
      if (id === 'unknown' || id === '') return;

      if (!map[id]) {
        map[id] = {
          id,
          name: o.customer_name || 'Unknown',
          email: o.customer_email || '',
          phone: o.customer_phone || '',
          whatsappWaId: o.whatsapp_wa_id || '',
          location: o.location_data?.city || extractCity(o.shipping_address),
          totalSpentUsd: 0,
          orderCount: 0,
          lastOrderDate: o.created_at,
          isLead: false
        };
      }
      
      if (o.status?.toLowerCase() === 'completed' || o.status?.toLowerCase() === 'paid') {
          map[id].totalSpentUsd += parseFloat(o.total_usd || 0);
      }
      map[id].orderCount += 1;
      
      // Keep most recent contact details
      if (new Date(o.created_at) > new Date(map[id].lastOrderDate)) {
         map[id].lastOrderDate = o.created_at;
         if (o.customer_name) map[id].name = o.customer_name;
         if (o.customer_email) map[id].email = o.customer_email;
         if (o.customer_phone) map[id].phone = o.customer_phone;
         if (o.whatsapp_wa_id) map[id].whatsappWaId = o.whatsapp_wa_id;
         
         const newLoc = o.location_data?.city || extractCity(o.shipping_address);
         if (newLoc) map[id].location = newLoc;
      }
    });

    // Merge named abandoned cart leads who haven't ordered yet
    abandonedCarts.forEach(c => {
      const id = (c.customer_email || '').toLowerCase() || 
                 (c.customer_phone || '').replace(/\D/g, '') || 
                 (c.customer_name || '').toLowerCase() || 
                 'unknown';

      if (id === 'unknown' || id === '') return; // Skip anonymous carts

      if (!map[id]) {
        map[id] = {
          id,
          name: c.customer_name || 'Pre-purchase Lead',
          email: c.customer_email || '',
          phone: c.customer_phone || '',
          whatsappWaId: '',
          location: c.location_data?.city || '',
          totalSpentUsd: 0,
          orderCount: 0,
          lastOrderDate: c.last_updated,
          isLead: true,
          lang: c.lang || 'es',
          currency: c.currency || 'CRC',
          cartItems: c.cart_data || []
        };
      } else {
        // If they already exist in orders, they are a customer (not a lead)
        map[id].isLead = false;
      }
    });
    
    // Convert to array and sort by customer type (Customers first, then Leads) and LTV/Last updated
    return Object.values(map).sort((a, b) => {
      if (a.isLead !== b.isLead) {
        return a.isLead ? 1 : -1; // Customers first
      }
      return b.totalSpentUsd - a.totalSpentUsd || new Date(b.lastOrderDate) - new Date(a.lastOrderDate);
    });
  }, [orders, abandonedCarts]);

  // Filter based on search
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      location: customer.location
    });
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer || !editForm.name) return;
    setSaving(true);
    
    try {
      // Build the update payload
      const updates = {
        customer_name: editForm.name,
        customer_email: editForm.email,
        customer_phone: editForm.phone,
        // we'll update the location_data city inside a minimal JSON object
        location_data: { city: editForm.location }
      };

      // Since the CRM derives identity primarily from email, then phone, then name,
      // we must update all orders matching the old identity to the new one.
      let query = supabase.from('orders').update(updates);
      
      if (editingCustomer.email) {
        query = query.eq('customer_email', editingCustomer.email);
      } else if (editingCustomer.phone) {
        query = query.eq('customer_phone', editingCustomer.phone);
      } else {
        query = query.eq('customer_name', editingCustomer.name);
      }

      const { error } = await query;
      if (error) throw error;
      
      // Update abandoned_carts table as well
      const cartUpdates = {
        customer_name: editForm.name,
        customer_email: editForm.email,
        customer_phone: editForm.phone,
        location_data: { city: editForm.location }
      };
      
      let cartQuery = supabase.from('abandoned_carts').update(cartUpdates);
      if (editingCustomer.email) {
        cartQuery = cartQuery.eq('customer_email', editingCustomer.email);
      } else if (editingCustomer.phone) {
        cartQuery = cartQuery.eq('customer_phone', editingCustomer.phone);
      } else {
        cartQuery = cartQuery.eq('customer_name', editingCustomer.name);
      }

      await cartQuery;
      
      // Close modal - realtime listeners in parent will auto-refresh the data
      setEditingCustomer(null);
      
    } catch (err) {
      console.error("Failed to update customer:", err);
      alert("Failed to save customer data. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = (format) => {
    setExportLoading(true);
    setTimeout(() => {
      try {
        const headers = [ 'Name', 'Type', 'Email', 'Phone', 'Location', 'Total Spent (USD)', 'Orders', 'Last Active' ];
        const dataRows = filteredCustomers.map(c => [
          c.name,
          c.isLead ? 'Lead' : 'Customer',
          c.email,
          c.whatsappWaId ? `+${c.whatsappWaId}` : c.phone,
          c.location,
          c.totalSpentUsd.toFixed(2),
          c.orderCount,
          new Date(c.lastOrderDate).toLocaleDateString()
        ]);
        const filename = `peptidescr-customers-${new Date().toISOString().slice(0, 10)}`;

        if (format === 'csv') {
          const csvContent = [headers, ...dataRows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = `${filename}.csv`;
          document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
        } else if (format === 'xlsx') {
          const worksheetData = [headers, ...dataRows];
          const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
          const wscols = headers.map(h => ({ wch: Math.max(15, h.length + 2) }));
          worksheet['!cols'] = wscols;
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
          XLSX.writeFile(workbook, `${filename}.xlsx`);
        } else if (format === 'pdf') {
          const doc = new jsPDF('landscape');
          doc.setFontSize(16);
          doc.text('Costa Rica Peptides - Customers Export', 14, 15);
          doc.setFontSize(10);
          doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
          doc.autoTable({
            head: [headers],
            body: dataRows,
            startY: 28,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [14, 22, 38], textColor: 255 },
            alternateRowStyles: { fillColor: [240, 240, 240] }
          });
          doc.save(`${filename}.pdf`);
        }
      } finally {
        setExportLoading(false);
        setShowExportModal(false);
      }
    }, 500);
  };

  return (
    <div className="crm-container">
      <style dangerouslySetInnerHTML={{__html: `
        .crm-container {
          background: rgba(14, 26, 51, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          overflow: hidden;
        }
        .crm-header {
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        .crm-title h2 {
          font-size: 1.25rem;
          font-weight: 800;
          color: #e2e8f0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .crm-search {
          position: relative;
          min-width: 250px;
        }
        .crm-search input {
          width: 100%;
          padding: 10px 14px 10px 38px;
          background: rgba(30, 41, 59, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
          outline: none;
          transition: border-color 0.2s;
        }
        .crm-search input:focus {
          border-color: #0ea5e9;
        }
        .crm-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }
        .customer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
          padding: 20px;
        }
        .customer-card {
          background: rgba(30, 41, 59, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          transition: transform 0.2s, border-color 0.2s;
        }
        .customer-card:hover {
          transform: translateY(-2px);
          border-color: rgba(14, 165, 233, 0.3);
        }
        .cust-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          position: relative;
        }
        .cust-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 1.1rem;
        }
        .cust-name {
          font-weight: 700;
          color: #f8fafc;
          font-size: 1rem;
          padding-right: 24px; /* Space for edit icon */
        }
        .cust-edit-btn {
          position: absolute;
          top: 0;
          right: 0;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #94a3b8;
          border-radius: 6px;
          padding: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .cust-edit-btn:hover {
          color: #0ea5e9;
          background: rgba(14, 165, 233, 0.1);
          border-color: rgba(14, 165, 233, 0.3);
        }
        .cust-location {
          font-size: 0.75rem;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .cust-stats-row {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
          padding: 12px 0;
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .cust-stat {
          flex: 1;
        }
        .cust-stat-label {
          font-size: 0.65rem;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }
        .cust-stat-val {
          font-size: 1.1rem;
          font-weight: 800;
          color: #e2e8f0;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .cust-stat-val.green { color: #34d399; }
        .cust-contact {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .contact-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          color: #cbd5e1;
        }
        .contact-item a {
          color: #cbd5e1;
          text-decoration: none;
        }
        .contact-item a:hover {
          color: #0ea5e9;
        }
        .cust-actions {
          display: flex;
          gap: 8px;
        }
        .cust-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          border-radius: 8px;
          border: none;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          color: white;
          text-decoration: none;
        }
        .btn-wa { background: #16a34a; }
        .btn-wa:hover { background: #15803d; }
        .btn-mail { background: #334155; }
        .btn-mail:hover { background: #475569; }
      `}} />

      <div className="crm-header">
        <div className="crm-title">
          <h2><User size={20} color="#0ea5e9" /> CRM Database ({filteredCustomers.length})</h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
            Auto-generated customer profiles and lifetime value.
          </p>
        </div>
        <div className="crm-search" style={{ display: 'flex', gap: '8px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} className="crm-search-icon" />
            <input 
              type="text" 
              placeholder="Search by name, email, or phone..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {filteredCustomers.length > 0 && (
            <button
              onClick={() => setShowExportModal(true)}
              style={{ padding: '0 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Upload size={14} /> Export
            </button>
          )}
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          No customers found matching your search.
        </div>
      ) : (
        <div className="customer-grid">
          {filteredCustomers.map(cust => (
            <div key={cust.id} className="customer-card">
              
              <div className="cust-header">
                <div className="cust-avatar" style={{ background: cust.isLead ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' }}>
                  {cust.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div className="cust-name">{cust.name}</div>
                    {cust.isLead ? (
                      <span style={{ fontSize: '0.65rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '9999px', fontWeight: 'bold' }}>Cart Lead</span>
                    ) : (
                      <span style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '9999px', fontWeight: 'bold' }}>Customer</span>
                    )}
                  </div>
                  {cust.location && (
                    <div className="cust-location">
                      <MapPin size={12} /> {cust.location}
                    </div>
                  )}
                </div>
                <button className="cust-edit-btn" onClick={() => openEditModal(cust)} title="Edit Customer">
                  <Edit2 size={12} />
                </button>
              </div>

              <div className="cust-stats-row">
                <div className="cust-stat">
                  <div className="cust-stat-label">Lifetime Value</div>
                  <div className="cust-stat-val green">
                    <DollarSign size={14} />{cust.totalSpentUsd.toFixed(0)}
                  </div>
                </div>
                <div className="cust-stat">
                  <div className="cust-stat-label">Orders</div>
                  <div className="cust-stat-val">
                    <ShoppingBag size={14} />{cust.orderCount}
                  </div>
                </div>
              </div>

              <div className="cust-contact">
                {cust.email && (
                  <div className="contact-item">
                    <Mail size={14} color="#64748b" />
                    <a href={`mailto:${cust.email}`}>{cust.email}</a>
                  </div>
                )}
                {cust.whatsappWaId && (
                  <div className="contact-item" style={{ background: 'rgba(34, 197, 94, 0.08)', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.15)' }}>
                    <BadgeCheck size={14} color="#22c55e" />
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>+{cust.whatsappWaId}</span>
                    <span style={{ fontSize: '0.6rem', color: '#22c55e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '4px' }}>Verified WA</span>
                  </div>
                )}
                {cust.phone && (
                  <div className="contact-item">
                    <Phone size={14} color="#64748b" />
                    <a href={`tel:${cust.phone}`}>{cust.phone}</a>
                    {!cust.whatsappWaId && <span style={{ fontSize: '0.6rem', color: '#64748b', marginLeft: '4px' }}>(from form)</span>}
                  </div>
                )}
                <div className="contact-item">
                  <Calendar size={14} color="#64748b" />
                  <span>{cust.isLead ? 'Cart updated:' : 'Last order:'} {new Date(cust.lastOrderDate).toLocaleDateString()}</span>
                </div>
                {cust.isLead && cust.cartItems && cust.cartItems.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', marginTop: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Abandoned Cart:</div>
                    {cust.cartItems.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                        <span>• {item.product}</span>
                        <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>x{item.qty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="cust-actions">
                {(cust.whatsappWaId || cust.phone) && (
                  <a 
                    href={`https://wa.me/${(cust.whatsappWaId || cust.phone).replace(/[^0-9]/g, '')}?text=Hi ${cust.name}, `}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="cust-btn btn-wa"
                  >
                    <MessageCircle size={14} /> WhatsApp{cust.whatsappWaId ? ' ✓' : ''}
                  </a>
                )}
                {cust.email && (
                  <a href={`mailto:${cust.email}`} className="cust-btn btn-mail">
                    <Mail size={14} /> Email
                  </a>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
          <div style={{
            background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '400px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit2 size={18} color="#0ea5e9" /> Edit Profile
              </h3>
              <button onClick={() => setEditingCustomer(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Full Name</label>
                <input 
                  type="text" 
                  value={editForm.name} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  style={{ width: '100%', padding: '10px', background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Email Address</label>
                <input 
                  type="email" 
                  value={editForm.email} 
                  onChange={e => setEditForm({...editForm, email: e.target.value})}
                  style={{ width: '100%', padding: '10px', background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Phone Number</label>
                <input 
                  type="tel" 
                  value={editForm.phone} 
                  onChange={e => setEditForm({...editForm, phone: e.target.value})}
                  style={{ width: '100%', padding: '10px', background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>City / Location</label>
                <input 
                  type="text" 
                  value={editForm.location} 
                  onChange={e => setEditForm({...editForm, location: e.target.value})}
                  style={{ width: '100%', padding: '10px', background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>

              <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => setEditingCustomer(null)}
                  style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveCustomer}
                  disabled={saving}
                  style={{ flex: 2, padding: '10px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold' }}
                >
                  {saving ? 'Saving...' : <><Save size={16} /> Save Changes</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ExportModal 
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Customers"
        description="Choose a format to download the customer database."
        loading={exportLoading}
        onExportCSV={() => handleExport('csv')}
        onExportXLSX={() => handleExport('xlsx')}
        onExportPDF={() => handleExport('pdf')}
      />
    </div>
  );
}
