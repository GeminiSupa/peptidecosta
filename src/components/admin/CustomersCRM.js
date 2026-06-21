import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, User, Users, Crown, Mail, MessageCircle, MapPin, DollarSign, Calendar, ShoppingBag, Edit2, X, Save, Phone, BadgeCheck, Upload, Sparkles, Brain, Send } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ExportModal from './ExportModal';
import { adminFetch } from '@/lib/adminApi';

const resolveRecommendation = (cust) => {
  // Combine past purchases and cart items to search for keywords
  const items = [
    ...(cust.purchasedItems || []),
    ...(cust.cartItems ? cust.cartItems.map(i => i.product) : [])
  ].map(i => i.toLowerCase());

  // 1. Healing / Recovery (BPC-157 / TB-500)
  if (items.some(name => name.includes('bpc') || name.includes('157') || name.includes('tb-') || name.includes('tb500'))) {
    // If they already bought BPC-157 but not TB-500, recommend TB-500. Otherwise recommend BPC-157
    const hasTb = items.some(name => name.includes('tb-') || name.includes('tb500'));
    return {
      product: hasTb ? 'BPC-157 5mg' : 'TB-500 5mg',
      subtext: hasTb ? 'Emparejamiento de Tejidos' : 'Sinergia de Recuperación Muscular',
      theme: 'healing',
      badgeBg: 'rgba(16, 185, 129, 0.12)',
      badgeBorder: 'rgba(16, 185, 129, 0.3)',
      badgeColor: '#34d399'
    };
  }

  // 2. Weight Loss / Metabolic (Semaglutide / Tirzepatide / Retatrutide)
  if (items.some(name => name.includes('sema') || name.includes('ozempic') || name.includes('tirz') || name.includes('mounj') || name.includes('retat'))) {
    // If bought Semaglutide but not Tirzepatide, suggest Tirzepatide
    const hasTirz = items.some(name => name.includes('tirz') || name.includes('mounj'));
    return {
      product: hasTirz ? 'Retatrutide 10mg' : 'Tirzepatide 10mg',
      subtext: hasTirz ? 'Termogénico Fase III' : 'Metabolismo de Grasa Avanzado',
      theme: 'metabolic',
      badgeBg: 'rgba(245, 158, 11, 0.12)',
      badgeBorder: 'rgba(245, 158, 11, 0.3)',
      badgeColor: '#fbbf24'
    };
  }

  // 3. Anti-Aging / Skin & Hair (GHK-Cu / Ipamorelin / CJC-1295)
  if (items.some(name => name.includes('ghk') || name.includes('cobre') || name.includes('copper') || name.includes('ipam') || name.includes('cjc') || name.includes('sermor'))) {
    const hasCjc = items.some(name => name.includes('cjc') || name.includes('ipam'));
    return {
      product: hasCjc ? 'GHK-Cu 50mg' : 'CJC-1295 + Ipamorelin 10mg',
      subtext: hasCjc ? 'Protocolo Estimulación de Colágeno' : 'Estimulador Hormona de Crecimiento',
      theme: 'anti-aging',
      badgeBg: 'rgba(168, 85, 247, 0.12)',
      badgeBorder: 'rgba(168, 85, 247, 0.3)',
      badgeColor: '#c084fc'
    };
  }

  // Default: General Scientific Standard (Suggest BPC-157 as the universal entry peptide)
  return {
    product: 'BPC-157 5mg',
    subtext: 'Péptido Regenerativo Estándar',
    theme: 'general',
    badgeBg: 'rgba(14, 165, 233, 0.12)',
    badgeBorder: 'rgba(14, 165, 233, 0.3)',
    badgeColor: '#38bdf8'
  };
};

export default function CustomersCRM({ orders = [], abandonedCarts = [], onWhatsAppClick }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [customersPerPage, setCustomersPerPage] = useState(25);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [generatingPitchId, setGeneratingPitchId] = useState(null);
  const [filterTab, setFilterTab] = useState('all');

  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState(null);
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
          isLead: false,
          purchasedItems: []
        };
      }
      
      let parsedItems = [];
      if (o.items) {
        if (Array.isArray(o.items)) {
          parsedItems = o.items;
        } else if (typeof o.items === 'string') {
          try {
            parsedItems = JSON.parse(o.items);
          } catch (e) {}
        }
      }
      
      if (Array.isArray(parsedItems)) {
        parsedItems.forEach(item => {
          if (item && item.product && !map[id].purchasedItems.includes(item.product)) {
            map[id].purchasedItems.push(item.product);
          }
        });
      }
      
      if (o.status?.toLowerCase() === 'completed' || o.status?.toLowerCase() === 'paid' || o.status?.toLowerCase() === 'order complete') {
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

  const crmStats = useMemo(() => {
    let totalContacts = customers.length;
    let activeCustomers = customers.filter(c => !c.isLead).length;
    let totalLtv = customers.reduce((sum, c) => sum + (c.totalSpentUsd || 0), 0);
    return { totalContacts, activeCustomers, totalLtv };
  }, [customers]);

  // Filter based on search and selected tab
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // Search term filter
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.phone.includes(searchTerm);
      if (!matchesSearch) return false;
      
      // Tab filter
      if (filterTab === 'customers') return !c.isLead;
      if (filterTab === 'leads') return c.isLead;
      return true;
    });
  }, [customers, searchTerm, filterTab]);


  const totalCustomersPages = Math.ceil(filteredCustomers.length / customersPerPage);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * customersPerPage,
    currentPage * customersPerPage
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

  const handleGeneratePitch = async (cust, recommendedProduct) => {
    if (!cust) return;
    setGeneratingPitchId(cust.id);

    try {
      const purchasedProducts = cust.isLead 
        ? (cust.cartItems || []).map(i => i.product)
        : (cust.purchasedItems || []);

      const response = await adminFetch('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'cross_sell',
          context: {
            customerName: cust.name,
            purchasedProducts,
            recommendation: recommendedProduct
          }
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const contactPhone = cust.whatsappWaId || cust.phone;
        if (onWhatsAppClick) {
          onWhatsAppClick({
            name: cust.name,
            phone: contactPhone,
            prefilledText: data.text.trim(),
            cartItems: cust.cartItems || []
          });
        } else {
          // Fallback if callback is not wired
          window.open(`https://wa.me/${contactPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(data.text.trim())}`, '_blank');
        }
      } else {
        alert('Failed to generate AI pitch: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error generating AI pitch:', err);
      alert('Error generating AI pitch: ' + err.message);
    } finally {
      setGeneratingPitchId(null);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedCustomerIds.length === paginatedCustomers.length) {
      setSelectedCustomerIds([]);
    } else {
      setSelectedCustomerIds(paginatedCustomers.map(c => c.id));
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedCustomerIds(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const handleBroadcastSubmit = async () => {
    if (!broadcastMessage.trim()) return;
    setBroadcastLoading(true);
    setBroadcastResults(null);
    
    const recipients = customers
      .filter(c => selectedCustomerIds.includes(c.id))
      .map(c => ({ phone: c.whatsappWaId || c.phone, name: c.name }))
      .filter(c => c.phone);

    try {
      const res = await adminFetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, message: broadcastMessage.trim() })
      });
      const data = await res.json();
      setBroadcastResults(data);
      if (data.success) {
        setSelectedCustomerIds([]);
        // Don't auto close, let them see results
      }
    } catch (err) {
      alert('Broadcast failed: ' + err.message);
    } finally {
      setBroadcastLoading(false);
    }
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
        .crm-table-wrapper {
          overflow-x: auto;
          background: rgba(14, 26, 51, 0.2);
        }
        .crm-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .crm-table th {
          padding: 14px 16px;
          background: rgba(15, 23, 42, 0.4);
          color: #94a3b8;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .crm-table td {
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          color: #cbd5e1;
          font-size: 0.85rem;
          vertical-align: middle;
        }
        .crm-table tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }
        .cust-avatar-mini {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 0.85rem;
        }
        .cust-row-name {
          font-weight: 700;
          color: #f8fafc;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cust-row-badge {
          font-size: 0.65rem;
          padding: 2px 8px;
          border-radius: 9999px;
          font-weight: bold;
          display: inline-block;
        }
        .cust-badge-lead {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
        }
        .cust-badge-customer {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
        }
        .crm-cell-location {
          font-size: 0.8rem;
          color: #cbd5e1;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .crm-cell-contact {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 0.8rem;
        }
        .crm-cell-contact a {
          color: #cbd5e1;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .crm-cell-contact a:hover {
          color: #0ea5e9;
        }
        .crm-cell-val {
          font-weight: 800;
          color: #e2e8f0;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .crm-cell-val.green {
          color: #34d399;
        }
        .crm-compact-actions {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }
        .crm-icon-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #cbd5e1;
          border-radius: 6px;
          padding: 6px;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
        }
        .crm-icon-btn:hover {
          background: rgba(14, 165, 233, 0.15);
          border-color: rgba(14, 165, 233, 0.3);
          color: #0ea5e9;
        }
        .crm-icon-btn.wa {
          background: rgba(34, 197, 94, 0.08);
          border-color: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }
        .crm-icon-btn.wa:hover {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.3);
          color: #4ade80;
        }
        .crm-icon-btn.edit:hover {
          background: rgba(56, 189, 248, 0.15);
          border-color: rgba(56, 189, 248, 0.3);
          color: #38bdf8;
        }

        /* KPI Cards Row */
        .crm-kpi-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          padding: 20px;
          background: rgba(15, 23, 42, 0.15);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .crm-kpi-card {
          background: rgba(30, 41, 59, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .crm-kpi-card:hover {
          background: rgba(30, 41, 59, 0.35);
          border-color: rgba(14, 165, 233, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        .crm-kpi-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .crm-kpi-icon.blue {
          background: rgba(14, 165, 233, 0.1);
          color: #38bdf8;
          border: 1px solid rgba(14, 165, 233, 0.2);
        }
        .crm-kpi-icon.green {
          background: rgba(16, 185, 129, 0.1);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }
        .crm-kpi-icon.purple {
          background: rgba(168, 85, 247, 0.1);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.2);
        }
        .crm-kpi-info {
          display: flex;
          flex-direction: column;
        }
        .crm-kpi-label {
          font-size: 0.68rem;
          color: #64748b;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .crm-kpi-value {
          font-size: 1.4rem;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1.2;
          margin-top: 2px;
        }

        /* Filter Tabs Row */
        .crm-tabs-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: rgba(15, 23, 42, 0.25);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .crm-tabs-row::-webkit-scrollbar {
          display: none;
        }
        .crm-tab {
          background: transparent;
          border: 1px solid transparent;
          color: #94a3b8;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .crm-tab:hover {
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.03);
        }
        .crm-tab.active {
          background: rgba(14, 165, 233, 0.1);
          border-color: rgba(14, 165, 233, 0.2);
          color: #38bdf8;
        }
        .crm-tab-badge {
          font-size: 0.65rem;
          padding: 1px 6px;
          border-radius: 4px;
          font-weight: 800;
          background: rgba(255, 255, 255, 0.06);
          color: #94a3b8;
        }
        .crm-tab.active .crm-tab-badge {
          background: rgba(14, 165, 233, 0.2);
          color: #38bdf8;
        }

        /* VIP Tag */
        .cust-row-name-container {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .cust-vip-badge {
          background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%) !important;
          color: #050b14 !important;
          font-size: 0.6rem !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.04em !important;
          padding: 1px 6px !important;
          border-radius: 4px !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 2px !important;
          box-shadow: 0 0 8px rgba(245, 158, 11, 0.3) !important;
        }

        /* LTV green pill */
        .crm-cell-ltv-pill {
          background: rgba(16, 185, 129, 0.12) !important;
          border: 1px solid rgba(16, 185, 129, 0.25) !important;
          color: #34d399 !important;
          padding: 4px 10px !important;
          border-radius: 6px !important;
          font-weight: 800 !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 4px !important;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.05) !important;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />

      {/* KPI stats summary cards */}
      <div className="crm-kpi-row">
        <div className="crm-kpi-card">
          <div className="crm-kpi-icon blue">
            <Users size={18} />
          </div>
          <div className="crm-kpi-info">
            <span className="crm-kpi-label">Total Contacts</span>
            <span className="crm-kpi-value">{crmStats.totalContacts}</span>
          </div>
        </div>
        <div className="crm-kpi-card">
          <div className="crm-kpi-icon green">
            <BadgeCheck size={18} />
          </div>
          <div className="crm-kpi-info">
            <span className="crm-kpi-label">Active Customers</span>
            <span className="crm-kpi-value">{crmStats.activeCustomers}</span>
          </div>
        </div>
        <div className="crm-kpi-card">
          <div className="crm-kpi-icon purple">
            <DollarSign size={18} />
          </div>
          <div className="crm-kpi-info">
            <span className="crm-kpi-label">Pipeline LTV Value</span>
            <span className="crm-kpi-value">${crmStats.totalLtv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

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
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          {selectedCustomerIds.length > 0 && (
            <button
              onClick={() => setShowBroadcastModal(true)}
              style={{ padding: '0 14px', fontSize: '0.85rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#4ade80', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <MessageCircle size={14} /> Bulk WhatsApp ({selectedCustomerIds.length})
            </button>
          )}
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

      {/* Tab Filter Row */}
      <div className="crm-tabs-row">
        <button 
          className={`crm-tab ${filterTab === 'all' ? 'active' : ''}`}
          onClick={() => { setFilterTab('all'); setCurrentPage(1); }}
        >
          All Contacts
          <span className="crm-tab-badge">{customers.length}</span>
        </button>
        <button 
          className={`crm-tab ${filterTab === 'customers' ? 'active' : ''}`}
          onClick={() => { setFilterTab('customers'); setCurrentPage(1); }}
        >
          Customers
          <span className="crm-tab-badge">{customers.filter(c => !c.isLead).length}</span>
        </button>
        <button 
          className={`crm-tab ${filterTab === 'leads' ? 'active' : ''}`}
          onClick={() => { setFilterTab('leads'); setCurrentPage(1); }}
        >
          Cart Leads
          <span className="crm-tab-badge">{customers.filter(c => c.isLead).length}</span>
        </button>
      </div>

      {filteredCustomers.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          No customers found matching your search.
        </div>
      ) : (
        <div className="crm-table-wrapper">
          <table className="crm-table responsive-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedCustomerIds.length > 0 && selectedCustomerIds.length === paginatedCustomers.length}
                    onChange={handleToggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th>Customer / Lead</th>
                <th>Contact details</th>
                <th>Location</th>
                <th style={{ textAlign: 'center' }}>Orders</th>
                <th style={{ textAlign: 'center' }}>Lifetime Value</th>
                <th>Last Active</th>
                <th>AI Cross-Sell</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.map(cust => {
                const contactPhone = cust.whatsappWaId || cust.phone;
                return (
                  <tr key={cust.id} style={{ background: selectedCustomerIds.includes(cust.id) ? 'rgba(56, 189, 248, 0.05)' : 'transparent' }}>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedCustomerIds.includes(cust.id)}
                        onChange={() => handleToggleSelect(cust.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    {/* Customer Profile Column */}
                    <td data-label="Customer / Lead">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="cust-avatar-mini" style={{ background: cust.isLead ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)' }}>
                          {cust.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="cust-row-name-container">
                            <span className="cust-row-name">{cust.name}</span>
                            {!cust.isLead && cust.totalSpentUsd >= 500 && (
                              <span className="cust-vip-badge" title="VIP Customer (Spent >= $500)">
                                <Crown size={9} /> VIP
                              </span>
                            )}
                            <span className={`cust-row-badge ${cust.isLead ? 'cust-badge-lead' : 'cust-badge-customer'}`}>
                              {cust.isLead ? 'Cart Lead' : 'Customer'}
                            </span>
                          </div>
                          {cust.isLead && cust.cartItems && cust.cartItems.length > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '2px', fontWeight: '500' }}>
                              🛒 {cust.cartItems.map(item => `${item.product} (x${item.qty})`).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contact Info Column */}
                    <td data-label="Contact Details">
                      <div className="crm-cell-contact">
                        {cust.email && (
                          <a href={`mailto:${cust.email}`} title="Send Email">
                            <Mail size={12} style={{ color: '#64748b' }} /> {cust.email}
                          </a>
                        )}
                        {contactPhone && (
                          <a href={`tel:${contactPhone}`} title="Call Phone">
                            {cust.whatsappWaId ? (
                              <BadgeCheck size={12} style={{ color: '#22c55e' }} />
                            ) : (
                              <Phone size={12} style={{ color: '#64748b' }} />
                            )}
                            <span style={{ color: cust.whatsappWaId ? '#4ade80' : '#cbd5e1', fontWeight: cust.whatsappWaId ? 700 : 'normal' }}>
                              +{contactPhone}
                            </span>
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Location Column */}
                    <td data-label="Location">
                      {cust.location ? (
                        <span className="crm-cell-location">
                          <MapPin size={12} style={{ color: '#64748b' }} />
                          {cust.location}
                        </span>
                      ) : (
                        <span style={{ color: '#475569', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>

                    {/* Orders Count Column */}
                    <td data-label="Orders" style={{ textAlign: 'center' }}>
                      <span className="crm-cell-val">
                        <ShoppingBag size={12} style={{ color: '#64748b' }} />
                        {cust.orderCount}
                      </span>
                    </td>

                    {/* Lifetime Value Column */}
                    <td data-label="Lifetime Value" style={{ textAlign: 'center' }}>
                      <span className="crm-cell-ltv-pill">
                        <DollarSign size={12} />
                        {cust.totalSpentUsd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    </td>

                    {/* Last Active Column */}
                    <td data-label="Last Active" style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={12} />
                        <span>{new Date(cust.lastOrderDate).toLocaleDateString()}</span>
                      </div>
                    </td>

                    {/* AI Recommendation Column */}
                    <td data-label="AI Cross-Sell">
                      {(() => {
                        const rec = resolveRecommendation(cust);
                        const isGenerating = generatingPitchId === cust.id;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            <span style={{ 
                              background: rec.badgeBg, 
                              border: `1px solid ${rec.badgeBorder}`, 
                              color: rec.badgeColor, 
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.72rem', 
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap'
                            }}>
                              <Sparkles size={11} style={{ flexShrink: 0 }} /> {rec.product}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '500', marginLeft: '2px' }}>
                              {rec.subtext}
                            </span>
                            {contactPhone ? (
                              <button
                                onClick={() => handleGeneratePitch(cust, rec.product)}
                                disabled={generatingPitchId !== null}
                                style={{
                                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(56, 189, 248, 0.04) 100%)',
                                  border: '1px solid rgba(56, 189, 248, 0.25)',
                                  color: '#38bdf8',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: '800',
                                  cursor: (generatingPitchId !== null) ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  marginTop: '4px',
                                  opacity: (generatingPitchId !== null && !isGenerating) ? 0.4 : 1,
                                  transition: 'all 0.2s',
                                  boxShadow: '0 2px 6px rgba(56, 189, 248, 0.05)'
                                }}
                              >
                                {isGenerating ? (
                                  <>
                                    <div className="sync-spinner-mini" style={{ width: '10px', height: '10px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#38bdf8 transparent #38bdf8 transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                    <span>Creando...</span>
                                  </>
                                ) : (
                                  <>
                                    <Brain size={10} />
                                    <span>Redactar Oferta</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.65rem', color: '#475569', fontStyle: 'italic' }}>Falta teléfono</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Actions Column */}
                    <td data-label="Actions">
                      <div className="crm-compact-actions">
                        <button className="crm-icon-btn edit" onClick={() => openEditModal(cust)} title="Edit Profile">
                          <Edit2 size={13} />
                        </button>
                        {contactPhone && (
                          <button 
                            onClick={() => {
                              if (onWhatsAppClick) {
                                onWhatsAppClick({
                                  name: cust.name,
                                  phone: contactPhone,
                                  cartItems: cust.cartItems || []
                                });
                              } else {
                                window.open(`https://wa.me/${contactPhone.replace(/[^0-9]/g, '')}?text=Hi ${cust.name}, `, '_blank');
                              }
                            }}
                            className="crm-icon-btn wa"
                            style={{ cursor: 'pointer' }}
                            title="Chat on WhatsApp"
                          >
                            <MessageCircle size={13} />
                          </button>
                        )}
                        {cust.email && (
                          <a 
                            href={`mailto:${cust.email}`} 
                            className="crm-icon-btn"
                            title="Send Email"
                          >
                            <Mail size={13} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredCustomers.length > 0 && (
            <div className="admin-pagination-bar" style={{ margin: '16px 0 0 0' }}>
              <div className="admin-pagination-info">
                Showing {Math.min(filteredCustomers.length, (currentPage - 1) * customersPerPage + 1)} to {Math.min(filteredCustomers.length, currentPage * customersPerPage)} of {filteredCustomers.length} customers
              </div>
              <div className="admin-pagination-controls">
                <button 
                  className="admin-pagination-btn"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  &laquo; Prev
                </button>
                {Array.from({ length: totalCustomersPages }, (_, i) => i + 1)
                  .filter(page => {
                    return page === 1 || 
                           page === totalCustomersPages || 
                           Math.abs(page - currentPage) <= 1;
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
                        className={`admin-pagination-btn ${currentPage === page ? 'active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    );
                    return elements;
                  })
                }
                <button 
                  className="admin-pagination-btn"
                  onClick={() => setCurrentPage(p => Math.min(totalCustomersPages, p + 1))}
                  disabled={currentPage === totalCustomersPages}
                >
                  Next &raquo;
                </button>
              </div>
              <div>
                <select
                  className="admin-pagination-limit"
                  value={customersPerPage}
                  onChange={(e) => {
                    setCustomersPerPage(Number(e.target.value));
                    setCurrentPage(1);
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

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
          <div style={{
            background: '#0e1626', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '500px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageCircle size={18} color="#4ade80" /> Bulk WhatsApp Broadcast
              </h3>
              <button onClick={() => { setShowBroadcastModal(false); setBroadcastResults(null); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: '#cbd5e1' }}>
              You are about to send a message to <strong>{selectedCustomerIds.length}</strong> selected contacts.
              <br/><br/>
              <span style={{ color: '#fbbf24' }}>⚠️ IMPORTANT:</span> Meta requires you to use an approved Message Template if you are initiating the conversation outside the 24-hour window. Make sure your message exactly matches an approved template in your WhatsApp Manager.
            </div>

            <textarea 
              value={broadcastMessage}
              onChange={e => setBroadcastMessage(e.target.value)}
              placeholder="Paste your approved template text here..."
              rows={6}
              style={{ width: '100%', padding: '12px', background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', outline: 'none', resize: 'vertical', marginBottom: '16px' }}
            />

            {broadcastResults && (
              <div style={{ padding: '12px', background: broadcastResults.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${broadcastResults.success ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`, borderRadius: '8px', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: broadcastResults.success ? '#4ade80' : '#f87171' }}>Broadcast Results</h4>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                  Success: <strong>{broadcastResults.successCount}</strong><br/>
                  Failed: <strong>{broadcastResults.failCount}</strong>
                </div>
                {broadcastResults.errors && broadcastResults.errors.length > 0 && (
                  <div style={{ marginTop: '8px', maxHeight: '100px', overflowY: 'auto', fontSize: '0.75rem', color: '#f87171' }}>
                    {broadcastResults.errors.map((e, i) => (
                      <div key={i}>{e.phone}: {e.error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => { setShowBroadcastModal(false); setBroadcastResults(null); }}
                style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}
              >
                Close
              </button>
              {!broadcastResults?.success && (
                <button 
                  onClick={handleBroadcastSubmit}
                  disabled={broadcastLoading || !broadcastMessage.trim()}
                  style={{ flex: 2, padding: '10px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold', opacity: (broadcastLoading || !broadcastMessage.trim()) ? 0.5 : 1 }}
                >
                  {broadcastLoading ? 'Sending...' : <><Send size={16} /> Send Broadcast</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
