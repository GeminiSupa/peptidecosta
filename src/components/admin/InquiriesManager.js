"use client";

import React, { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/adminApi';
import { 
  Mail, Search, Filter, Trash2, Send, Eye, Clock, CheckCircle, 
  XCircle, MessageSquare, ChevronDown, ChevronUp, RefreshCw, Inbox,
  ArrowLeft, User, Calendar, Sparkles, ArrowRight
} from 'lucide-react';

const STATUS_CONFIG = {
  'New': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', icon: Mail },
  'Read': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', icon: Eye },
  'Replied': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', icon: CheckCircle },
  'Closed': { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', border: 'rgba(107, 114, 128, 0.3)', icon: XCircle },
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const extractPhone = (message) => {
  if (!message) return null;
  const match = message.match(/(?:\+?506)?\s?[23456789]\d{3}[-\s]?\d{4}/);
  if (!match) return null;
  const digits = match[0].replace(/[-\s]/g, '');
  if (digits.startsWith('506') || digits.startsWith('+506')) {
    return digits.startsWith('+') ? digits : `+${digits}`;
  }
  return `+506${digits}`;
};

const INQUIRY_ASSIGNMENTS_KEY = 'peptides_inquiry_assignments_v1';

const readInquiryAssignments = () => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(INQUIRY_ASSIGNMENTS_KEY) || '{}');
  } catch {
    return {};
  }
};

const getSlaInfo = (inquiry) => {
  if (!inquiry?.created_at) return { label: 'No age', tone: 'neutral' };
  if (inquiry.status === 'Closed' || inquiry.status === 'Replied') {
    return { label: inquiry.status, tone: 'done' };
  }
  const ageHours = Math.floor((Date.now() - new Date(inquiry.created_at).getTime()) / 3600000);
  if (ageHours >= 24) return { label: `${Math.floor(ageHours / 24)}d open`, tone: 'danger' };
  if (ageHours >= 4) return { label: `${ageHours}h open`, tone: 'warn' };
  return { label: ageHours <= 0 ? 'New' : `${ageHours}h open`, tone: 'ok' };
};

export default function InquiriesManager({ adminEmail, products = [], onOpenCustomerProfile, onCreateOrderFromInquiry, onNavigate }) {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draftingReply, setDraftingReply] = useState(false);
  const [assignmentMap, setAssignmentMap] = useState(() => readInquiryAssignments());
  const replyInputRef = React.useRef(null);

  useEffect(() => {
    if (selectedInquiry && selectedInquiry.status !== 'Closed') {
      const timer = setTimeout(() => {
        if (replyInputRef.current) replyInputRef.current.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedInquiry]);

  const fetchInquiries = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await adminFetch('/api/admin/inquiries');
      const data = await res.json();
      if (res.ok && data.success) {
        setInquiries(data.inquiries || []);
      }
    } catch (err) {
      console.error('Failed to fetch inquiries:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => fetchInquiries(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleMarkAsRead = async (inquiry) => {
    if (inquiry.status !== 'New') return;
    try {
      await adminFetch('/api/admin/inquiries/update', {
        method: 'PATCH',
        body: JSON.stringify({ inquiryId: inquiry.id, status: 'Read' })
      });
      setInquiries(prev => prev.map(i => i.id === inquiry.id ? { ...i, status: 'Read' } : i));
      if (selectedInquiry?.id === inquiry.id) setSelectedInquiry(prev => ({ ...prev, status: 'Read' }));
    } catch (err) { console.error(err); }
  };

  const handleClose = async (inquiryId) => {
    try {
      await adminFetch('/api/admin/inquiries/update', {
        method: 'PATCH',
        body: JSON.stringify({ inquiryId, status: 'Closed' })
      });
      setInquiries(prev => prev.map(i => i.id === inquiryId ? { ...i, status: 'Closed' } : i));
      if (selectedInquiry?.id === inquiryId) setSelectedInquiry(prev => ({ ...prev, status: 'Closed' }));
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (inquiryId) => {
    if (!confirm('Delete this inquiry permanently?')) return;
    try {
      await adminFetch(`/api/admin/inquiries/update?id=${inquiryId}`, { method: 'DELETE' });
      setInquiries(prev => prev.filter(i => i.id !== inquiryId));
      if (selectedInquiry?.id === inquiryId) setSelectedInquiry(null);
    } catch (err) { console.error(err); }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedInquiry) return;
    setSending(true);
    try {
      const res = await adminFetch('/api/admin/inquiries/reply', {
        method: 'POST',
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          replyMessage: replyText.trim(),
          adminEmail: adminEmail || 'admin'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const now = new Date().toISOString();
        setInquiries(prev => prev.map(i => i.id === selectedInquiry.id ? {
          ...i, status: 'Replied', admin_reply: replyText.trim(), replied_at: now, replied_by: adminEmail
        } : i));
        setSelectedInquiry(prev => ({
          ...prev, status: 'Replied', admin_reply: replyText.trim(), replied_at: now, replied_by: adminEmail
        }));
        setReplyText('');
        alert('✅ Reply sent successfully!');
      } else {
        alert('❌ Failed to send reply: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('❌ Error sending reply: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDraftReply = async () => {
    if (!selectedInquiry) return;
    setDraftingReply(true);
    try {
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'draft_inquiry_reply',
          context: {
            customerName: selectedInquiry.customer_name,
            subject: selectedInquiry.subject,
            message: selectedInquiry.message,
            products: products
          }
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.text) {
        setReplyText(data.text);
      } else {
        alert('❌ Failed to draft reply: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('❌ Error drafting reply: ' + err.message);
    } finally {
      setDraftingReply(false);
    }
  };

  const openInquiry = (inquiry) => {
    setSelectedInquiry(inquiry);
    setReplyText('');
    if (inquiry.status === 'New') handleMarkAsRead(inquiry);
  };

  const saveAssignment = (inquiryId, assignee) => {
    setAssignmentMap(prev => {
      const next = { ...prev, [inquiryId]: assignee };
      try {
        localStorage.setItem(INQUIRY_ASSIGNMENTS_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('Could not save inquiry assignment:', err);
      }
      return next;
    });
  };

  const getAssignee = (inquiry) => assignmentMap[inquiry.id] || inquiry.assigned_to || 'Unassigned';

  const openCustomerFromInquiry = (inquiry) => {
    onOpenCustomerProfile?.({
      customer_email: inquiry.customer_email,
      customer_name: inquiry.customer_name,
      phone: extractPhone(inquiry.message),
      search: inquiry.customer_email || extractPhone(inquiry.message) || inquiry.customer_name
    });
  };

  const convertInquiry = (inquiry, target) => {
    try {
      localStorage.setItem('admin_inquiry_conversion_context', JSON.stringify({
        target,
        inquiryId: inquiry.id,
        name: inquiry.customer_name,
        email: inquiry.customer_email,
        phone: extractPhone(inquiry.message),
        subject: inquiry.subject,
        message: inquiry.message
      }));
    } catch (err) {
      console.warn('Could not save inquiry conversion context:', err);
    }
    if (target === 'order') {
      onCreateOrderFromInquiry?.(inquiry);
      onNavigate?.('orders');
    } else {
      onNavigate?.('leads');
    }
  };

  // Filtering
  const filtered = inquiries.filter(i => {
    if (statusFilter !== 'All' && i.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (i.customer_name?.toLowerCase().includes(q) || 
              i.customer_email?.toLowerCase().includes(q) ||
              i.subject?.toLowerCase().includes(q) ||
              i.message?.toLowerCase().includes(q));
    }
    return true;
  });

  const statusCounts = {
    All: inquiries.length,
    New: inquiries.filter(i => i.status === 'New').length,
    Read: inquiries.filter(i => i.status === 'Read').length,
    Replied: inquiries.filter(i => i.status === 'Replied').length,
    Closed: inquiries.filter(i => i.status === 'Closed').length,
  };

  const styles = {
    container: { display: 'flex', flexDirection: 'column', gap: '20px' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
    title: { fontSize: '1.5rem', fontWeight: '800', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 },
    toolbar: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
    searchBox: { display: 'flex', alignItems: 'center', gap: '8px', background: '#0e1626', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '8px 14px', minWidth: '220px' },
    searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: '13px', width: '100%' },
    filterBtn: (active) => ({
      padding: '6px 14px', borderRadius: '8px', border: '1px solid', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
      background: active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.04)',
      borderColor: active ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255,255,255,0.08)',
      color: active ? '#34d399' : '#94a3b8', transition: 'all 0.2s'
    }),
    refreshBtn: { background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', padding: '8px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    list: { display: 'flex', flexDirection: 'column', gap: '8px' },
    card: (isNew) => ({
      background: isNew ? 'rgba(245, 158, 11, 0.04)' : '#0e1626',
      border: `1px solid ${isNew ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: '12px', padding: '16px 20px', cursor: 'pointer', transition: 'all 0.2s',
      borderLeft: isNew ? '3px solid #f59e0b' : '3px solid transparent'
    }),
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' },
    cardName: { fontSize: '14px', fontWeight: '700', color: '#f1f5f9', margin: 0 },
    cardEmail: { fontSize: '12px', color: '#64748b', margin: '2px 0 0' },
    cardSubject: { fontSize: '13px', fontWeight: '600', color: '#cbd5e1', margin: '6px 0 4px' },
    cardPreview: { fontSize: '12.5px', color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
    badge: (status) => {
      const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['New'];
      return { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' };
    },
    time: { fontSize: '11px', color: '#475569', whiteSpace: 'nowrap' },
    // Detail view styles
    detailPanel: { background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden' },
    detailHeader: { background: 'linear-gradient(135deg, #0f172a, #022c22)', padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
    backBtn: { display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginBottom: '16px' },
    detailSubject: { fontSize: '1.25rem', fontWeight: '800', color: '#f1f5f9', margin: '0 0 12px' },
    detailMeta: { display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '13px', color: '#94a3b8' },
    metaItem: { display: 'flex', alignItems: 'center', gap: '6px' },
    messageBody: { padding: '24px', fontSize: '14px', lineHeight: '1.7', color: '#cbd5e1', whiteSpace: 'pre-wrap', borderBottom: '1px solid rgba(255,255,255,0.06)' },
    replySection: { padding: '24px' },
    replyLabel: { fontSize: '13px', fontWeight: '700', color: '#f1f5f9', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' },
    replyTextarea: { width: '100%', minHeight: '120px', background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px', color: '#e2e8f0', fontSize: '14px', lineHeight: '1.6', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
    replyActions: { display: 'flex', gap: '10px', marginTop: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' },
    btnPrimary: { display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', opacity: sending ? 0.6 : 1 },
    btnSecondary: (color = '#6b7280') => ({
      display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', color, border: '1px solid rgba(255,255,255,0.08)', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
    }),
    previousReply: { margin: '0 24px 24px', padding: '16px 20px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '12px' },
    prevReplyLabel: { fontSize: '12px', fontWeight: '700', color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' },
    prevReplyText: { fontSize: '13px', color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: '1.6' },
    emptyState: { textAlign: 'center', padding: '80px 20px', color: '#475569' },
    emptyIcon: { width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' },
    loadingState: { textAlign: 'center', padding: '60px 20px', color: '#64748b', fontSize: '14px' },
    deleteBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', opacity: 0.6 },
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.loadingState}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
        Loading inquiries...
      </div>
    );
  }

  // Detail view
  if (selectedInquiry) {
    const inq = selectedInquiry;
    const sla = getSlaInfo(inq);
    return (
      <div style={styles.container}>
        <div style={styles.detailPanel}>
          <div style={styles.detailHeader}>
            <button style={styles.backBtn} onClick={() => setSelectedInquiry(null)}>
              <ArrowLeft size={14} /> Back to Inbox
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={styles.detailSubject}>{inq.subject || 'No Subject'}</h2>
                <div style={styles.detailMeta}>
                  <span style={styles.metaItem}><User size={14} /> {inq.customer_name}</span>
                  <span style={styles.metaItem}><Mail size={14} /> {inq.customer_email}</span>
                  <span style={styles.metaItem}><Calendar size={14} /> {new Date(inq.created_at).toLocaleString()}</span>
                  {extractPhone(inq.message) && (
                    <span 
                      style={{ ...styles.metaItem, color: '#4ade80', cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => {
                        const phone = extractPhone(inq.message);
                        const waMsg = encodeURIComponent(`Hola ${inq.customer_name}, te saluda el equipo de Peptides Costa Rica sobre tu consulta: "${inq.subject || 'Contacto'}". ¿Cómo te podemos ayudar?`);
                        window.open(`https://wa.me/${phone.replace('+', '')}?text=${waMsg}`, '_blank');
                      }}
                      title="WhatsApp Customer"
                    >
                      <MessageSquare size={14} /> WhatsApp ({extractPhone(inq.message)})
                    </span>
                  )}
                </div>
              </div>
              <span style={styles.badge(inq.status)}>{inq.status}</span>
            </div>
          </div>

          <div className="inquiry-action-rail">
            <label className="inquiry-assignment-control">
              <span>Owner</span>
              <select value={getAssignee(inq)} onChange={(event) => saveAssignment(inq.id, event.target.value)}>
                <option value="Unassigned">Unassigned</option>
                <option value={adminEmail || 'Me'}>{adminEmail || 'Me'}</option>
                <option value="Sales">Sales</option>
                <option value="Support">Support</option>
              </select>
            </label>
            <span className={`inquiry-sla-pill ${sla.tone}`}><Clock size={13} /> {sla.label}</span>
            <button type="button" className="admin-btn" onClick={() => openCustomerFromInquiry(inq)}>
              <User size={13} /> Profile
            </button>
            <button type="button" className="admin-btn" onClick={() => convertInquiry(inq, 'lead')}>
              <ArrowRight size={13} /> Lead
            </button>
            <button type="button" className="admin-btn admin-btn-primary" onClick={() => convertInquiry(inq, 'order')}>
              <ArrowRight size={13} /> Order
            </button>
          </div>

          <div className="inquiry-thread">
            <div className="inquiry-thread-message customer">
              <div className="inquiry-thread-meta">
                <User size={13} /> {inq.customer_name || 'Customer'} · {formatDate(inq.created_at)}
              </div>
              <div>{inq.message}</div>
            </div>
            {inq.admin_reply && (
              <div className="inquiry-thread-message admin">
                <div className="inquiry-thread-meta">
                  <CheckCircle size={13} /> {inq.replied_by || 'Admin'} · {formatDate(inq.replied_at)}
                </div>
                <div>{inq.admin_reply}</div>
              </div>
            )}
          </div>

          {/* Reply Composer */}
          {inq.status !== 'Closed' && (
            <div style={styles.replySection}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={styles.replyLabel}>
                  <Send size={14} /> {inq.admin_reply ? 'Send Another Reply' : 'Reply to Customer'}
                </div>
                <button
                  onClick={handleDraftReply}
                  disabled={draftingReply}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(168, 85, 247, 0.05))',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                    color: '#c084fc',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: draftingReply ? 'not-allowed' : 'pointer',
                    opacity: draftingReply ? 0.6 : 1,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { if(!draftingReply) { e.currentTarget.style.boxShadow = '0 0 10px rgba(168, 85, 247, 0.3)'; e.currentTarget.style.borderColor = '#c084fc'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)'; }}
                >
                  <Sparkles size={13} style={draftingReply ? { animation: 'spin 2s linear infinite' } : {}} />
                  {draftingReply ? 'Drafting...' : 'Draft AI Reply'}
                </button>
              </div>
              <textarea
                ref={replyInputRef}
                style={styles.replyTextarea}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Write your reply to ${inq.customer_name}...`}
              />
              <div style={styles.replyActions}>
                <button style={styles.btnSecondary('#ef4444')} onClick={() => handleDelete(inq.id)}>
                  <Trash2 size={13} /> Delete
                </button>
                {inq.status !== 'Closed' && (
                  <button style={styles.btnSecondary('#6b7280')} onClick={() => handleClose(inq.id)}>
                    <XCircle size={13} /> Close
                  </button>
                )}
                <button style={styles.btnPrimary} onClick={handleReply} disabled={!replyText.trim() || sending}>
                  <Send size={14} /> {sending ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </div>
          )}

          {inq.status === 'Closed' && (
            <div style={{ padding: '20px 24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
              This inquiry has been closed.
              <button style={{ ...styles.btnSecondary('#ef4444'), marginLeft: '12px', display: 'inline-flex' }} onClick={() => handleDelete(inq.id)}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Inbox list view
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          <Inbox size={22} /> Customer Inquiries
          {statusCounts.New > 0 && (
            <span style={{ ...styles.badge('New'), fontSize: '12px', marginLeft: '4px' }}>
              {statusCounts.New} new
            </span>
          )}
        </h2>
        <div style={styles.toolbar}>
          <div style={styles.searchBox}>
            <Search size={14} color="#64748b" />
            <input
              style={styles.searchInput}
              placeholder="Search inquiries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button style={styles.refreshBtn} onClick={() => fetchInquiries(true)} title="Refresh">
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {['All', 'New', 'Read', 'Replied', 'Closed'].map(s => (
          <button key={s} style={styles.filterBtn(statusFilter === s)} onClick={() => setStatusFilter(s)}>
            {s} ({statusCounts[s]})
          </button>
        ))}
      </div>

      {/* Inquiry List */}
      {filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}><Inbox size={28} color="#10b981" /></div>
          <h3 style={{ color: '#94a3b8', marginBottom: '8px' }}>No inquiries found</h3>
          <p style={{ fontSize: '13px' }}>
            {searchQuery ? 'Try adjusting your search.' : 'When customers submit the contact form, their messages will appear here.'}
          </p>
        </div>
      ) : (
        <div style={styles.list}>
          {filtered.map(inq => {
            const sla = getSlaInfo(inq);
            const assignee = getAssignee(inq);
            return (
            <div key={inq.id} style={styles.card(inq.status === 'New')} onClick={() => openInquiry(inq)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = inq.status === 'New' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'none'; }}
            >
              <div style={styles.cardHeader}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <p style={styles.cardName}>{inq.customer_name}</p>
                    <span style={styles.badge(inq.status)}>{inq.status}</span>
                  </div>
                  <p style={styles.cardEmail}>{inq.customer_email}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={styles.time}>{formatDate(inq.created_at)}</span>
                  <button style={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); handleDelete(inq.id); }} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {inq.subject && <p style={styles.cardSubject}>{inq.subject}</p>}
              <p style={styles.cardPreview}>{inq.message}</p>
              <div className="inquiry-card-ops" onClick={(e) => e.stopPropagation()}>
                <span className={`inquiry-sla-pill ${sla.tone}`}><Clock size={12} /> {sla.label}</span>
                <label className="inquiry-assignment-control compact">
                  <span>Owner</span>
                  <select value={assignee} onChange={(event) => saveAssignment(inq.id, event.target.value)}>
                    <option value="Unassigned">Unassigned</option>
                    <option value={adminEmail || 'Me'}>{adminEmail || 'Me'}</option>
                    <option value="Sales">Sales</option>
                    <option value="Support">Support</option>
                  </select>
                </label>
              </div>

              {/* Quick Actions CTA Row */}
              <div 
                style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '12px',
                  justifyContent: 'flex-start',
                  flexWrap: 'wrap',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  paddingTop: '10px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {inq.status === 'New' && (
                  <button
                    onClick={() => handleMarkAsRead(inq)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: '#60a5fa',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Eye size={12} /> Mark Read
                  </button>
                )}

                {inq.status !== 'Closed' && (
                  <button
                    onClick={() => openInquiry(inq)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34d399',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Send size={12} /> Reply
                  </button>
                )}

                {inq.status !== 'Closed' && (
                  <button
                    onClick={() => handleClose(inq.id)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'rgba(107, 114, 128, 0.15)',
                      border: '1px solid rgba(107, 114, 128, 0.3)',
                      color: '#9ca3af',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <XCircle size={12} /> Close
                  </button>
                )}

                {extractPhone(inq.message) && (
                  <button
                    onClick={() => {
                      const phone = extractPhone(inq.message);
                      const waMsg = encodeURIComponent(`Hola ${inq.customer_name}, te saluda el equipo de Peptides Costa Rica sobre tu consulta: "${inq.subject || 'Contacto'}". ¿Cómo te podemos ayudar?`);
                      window.open(`https://wa.me/${phone.replace('+', '')}?text=${waMsg}`, '_blank');
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      color: '#4ade80',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <MessageSquare size={12} /> WhatsApp
                  </button>
                )}
                <button
                  onClick={() => openCustomerFromInquiry(inq)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    color: '#38bdf8',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <User size={12} /> Profile
                </button>
                <button
                  onClick={() => convertInquiry(inq, 'lead')}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.28)',
                    color: '#fbbf24',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ArrowRight size={12} /> Lead
                </button>
                <button
                  onClick={() => convertInquiry(inq, 'order')}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ArrowRight size={12} /> Order
                </button>
              </div>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}
