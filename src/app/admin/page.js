"use client";

import '@/app/admin.css';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { adminFetch } from '@/lib/adminApi';
import { cleanPhoneNumber } from '@/lib/whatsapp';
import { 
  Lock, LayoutDashboard, ListFilter, Plus, Trash2, Mail, MessageCircle,
  Save, Upload, Download, Share2, Clipboard, LogOut, Check, 
  AlertCircle, ChevronRight, ChevronUp, ChevronDown, MessageSquare, Database,
  Dna, FlaskConical, Syringe, TestTubes, Atom, 
  Brain, Shield, Moon, Flame, Zap, Sparkles, Microscope,
  KeyRound, ShoppingCart, Table, ClipboardList, Link2, Star, FileText, BarChart2, Users, UserPlus, Send,
  Bell, X, TrendingUp, Target, Smartphone, Inbox, Search, ChevronLeft, Megaphone
} from 'lucide-react';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';
import CustomersCRM from '@/components/admin/CustomersCRM';
import ExportModal from '@/components/admin/ExportModal';
import TeamManagement from '@/components/admin/TeamManagement';
import TeamChat from '@/components/admin/TeamChat';
import AffiliatesManager from '@/components/admin/AffiliatesManager';
import InquiriesManager from '@/components/admin/InquiriesManager';
import DashboardHome from '@/components/admin/DashboardHome';
import AgentDashboard from '@/components/admin/AgentDashboard';
import { filterOrdersVisibleToAgent } from '@/lib/agentOrders';
import GlobalSearch from '@/components/admin/GlobalSearch';
import NotificationCenter from '@/components/admin/NotificationCenter';
import OrderDetailPanel from '@/components/admin/OrderDetailPanel';
import AbandonedCartEditPanel from '@/components/admin/AbandonedCartEditPanel';
import ManualOrderModal from '@/components/admin/ManualOrderModal';
import BroadcastsPanel from '@/components/admin/BroadcastsPanel';
import WhatsAppInbox from '@/components/admin/WhatsAppInbox';
import { DEFAULT_WHATSAPP_AI_PROMPT } from '@/lib/whatsappRecovery';
import {
  ADMIN_NAV_GROUPS,
  ADMIN_TAB_IDS,
  ADMIN_TAB_TITLES,
  ALWAYS_AVAILABLE_TAB_IDS,
  SUPERADMIN_ONLY_TAB_IDS,
} from '@/lib/adminModules';
import dynamic from 'next/dynamic';

const EmailMarketingStudio = dynamic(() => import('@/components/admin/marketing/EmailMarketingStudio'), { ssr: false });
const WhatsAppSession = dynamic(() => import('@/components/admin/marketing/WhatsAppSession'), { ssr: false });

const FacebookIcon = ({ size = 14, style, ...props }) => (
  <svg 
    viewBox="0 0 24 24" 
    width={size} 
    height={size} 
    fill="currentColor" 
    style={style}
    {...props}
  >
    <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z" />
  </svg>
);

const FALLBACK_EXCHANGE_RATE = 454.48;

const cartHasItems = (cartData) => Array.isArray(cartData) && cartData.length > 0;

const getCartRecoveryStatus = (c) => {
  if (c.status === 'recovered' || c.status === 'converted') return 'recovered';
  if (c.recovery_whatsapp_sent) return 'contacted_whatsapp';
  if (c.recovery_email_sent) return 'contacted_email';
  return 'not_contacted';
};

const formatCustomerIdType = (idType) => {
  if (!idType) return '';
  const types = {
    '1': 'Cédula',
    '2': 'Cédula jurídica',
    '5': 'Passport',
    '6': 'DIMEX',
  };
  return types[String(idType)] || idType;
};

function getAdminPageSubtitle(tabId, { orders, abandonedCarts, leads, reviews, isStaffAgent = false }) {
  const pendingOrders = orders.filter((o) => (o.status || 'Pending') === 'Pending').length;
  const pendingReviews = reviews.filter((r) => r.status === 'Pending').length;
  const newLeads = leads.filter((l) => (l.status || 'New') === 'New').length;

  switch (tabId) {
    case 'home':
      return isStaffAgent
        ? 'Your sales, commission, and payout history'
        : 'Store overview · revenue, carts, and alerts';
    case 'orders':
      return isStaffAgent
        ? (pendingOrders
          ? `${pendingOrders} pending · ${orders.length} visible to you`
          : `${orders.length} order${orders.length !== 1 ? 's' : ''} (yours + unassigned)`)
        : (pendingOrders
          ? `${pendingOrders} pending · ${orders.length} total`
          : `${orders.length} order${orders.length !== 1 ? 's' : ''}`);
    case 'carts':
      return abandonedCarts.length
        ? `${abandonedCarts.length} cart${abandonedCarts.length !== 1 ? 's' : ''} to recover`
        : 'No active abandoned carts';
    case 'leads':
      return newLeads
        ? `${newLeads} new lead${newLeads !== 1 ? 's' : ''} · ${leads.length} total`
        : `${leads.length} lead${leads.length !== 1 ? 's' : ''}`;
    case 'reviews':
      return pendingReviews
        ? `${pendingReviews} awaiting approval`
        : `${reviews.length} review${reviews.length !== 1 ? 's' : ''}`;
    case 'whatsapp_ai':
      return 'Reply to customers · AI autopilot available';
    default:
      return '';
  }
}

function resolveTabAccess(tabId, profile) {
  if (!profile || !ADMIN_TAB_IDS.has(tabId)) return false;
  if (ALWAYS_AVAILABLE_TAB_IDS.has(tabId)) return true;
  if (SUPERADMIN_ONLY_TAB_IDS.has(tabId)) return profile.is_superadmin;
  if (profile.is_superadmin) return true;
  return profile.permissions?.includes(tabId) ?? false;
}

function getDefaultTab(profile) {
  if (!profile) return 'home';
  if (profile.is_superadmin) return 'home';
  if (profile.permissions?.includes('home')) return 'home';
  return profile.permissions?.[0] || 'home';
}

const CATEGORY_TRANSLATIONS = {
  'Weight Loss & Metabolism': 'Pérdida de peso y metabolismo',
  'Exercise Mimetic & Metabolic Modulator': 'Exercise Mimetic & Metabolic Modulator',
  'Recovery & Healing': 'Recuperación y curación',
  'Anti-Inflammatory': 'Antiinflamatorio',
  'Performance & Hormones': 'Rendimiento y hormonas',
  'Anti-Aging & Longevity': 'Antienvejecimiento y longevidad',
  'Immune System Modulation': 'Modulación del sistema inmunitario',
  'Cognitive & Mood': 'Cognitivo y estado de ánimo',
  'Sleep': 'Dormir',
  'Sexual Health': 'Salud sexual',
  'Tanning & Sexual Function': 'Bronceado y función sexual',
  'Skin & Hair': 'Piel y cabello',
  'Immune & Antioxidant': 'Sistema inmunitario y antioxidante',
};

const getReferralLabel = (lead) => {
  const source = lead.utm_source;
  const referrer = lead.referrer;
  
  if (source) {
    let cleanSource = source.toLowerCase();
    if (cleanSource === 'ig' || cleanSource === 'instagram') return 'Instagram Ads';
    if (cleanSource === 'fb' || cleanSource === 'facebook') return 'Facebook Ads';
    if (cleanSource === 'google' || cleanSource === 'gads') return 'Google Ads';
    return source.charAt(0).toUpperCase() + source.slice(1);
  }
  
  if (referrer) {
    try {
      const url = new URL(referrer);
      const host = url.hostname.toLowerCase();
      if (host.includes('instagram.com')) return 'Instagram (Org)';
      if (host.includes('facebook.com')) return 'Facebook (Org)';
      if (host.includes('google.com')) return 'Google (Organic)';
      if (host.includes('t.co') || host.includes('twitter.com') || host.includes('x.com')) return 'X / Twitter';
      if (host.includes('l.wl.co') || host.includes('whatsapp')) return 'Whatsapp';
      return url.hostname.replace('www.', '');
    } catch (e) {
      return 'Referral';
    }
  }
  
  return 'Direct';
};

const getReferralBadgeStyles = (label) => {
  if (!label) {
    return {
      background: 'rgba(148, 163, 184, 0.15)',
      color: '#94a3b8'
    };
  }

  const lower = label.toLowerCase();
  
  if (lower.includes('whatsapp')) {
    return {
      background: 'rgba(34, 197, 94, 0.15)',
      color: '#4ade80',
      border: '1px solid rgba(34, 197, 94, 0.3)'
    };
  }
  
  if (lower.includes('instagram') || lower === 'ig') {
    return {
      background: 'rgba(236, 72, 153, 0.15)',
      color: '#f472b6',
      border: '1px solid rgba(236, 72, 153, 0.3)'
    };
  }
  
  if (lower.includes('facebook') || lower === 'fb') {
    return {
      background: 'rgba(59, 130, 246, 0.15)',
      color: '#60a5fa',
      border: '1px solid rgba(59, 130, 246, 0.3)'
    };
  }
  
  if (lower.includes('google') || lower === 'gads') {
    return {
      background: 'rgba(99, 102, 241, 0.15)',
      color: '#818cf8',
      border: '1px solid rgba(99, 102, 241, 0.3)'
    };
  }
  
  if (lower.includes('twitter') || lower === 'x' || lower.includes('x /')) {
    return {
      background: 'rgba(14, 165, 233, 0.15)',
      color: '#38bdf8',
      border: '1px solid rgba(14, 165, 233, 0.3)'
    };
  }
  
  if (lower === 'direct') {
    return {
      background: 'rgba(148, 163, 184, 0.15)',
      color: '#94a3b8',
      border: '1px solid rgba(148, 163, 184, 0.3)'
    };
  }

  return {
    background: 'rgba(168, 85, 247, 0.15)',
    color: '#c084fc',
    border: '1px solid rgba(168, 85, 247, 0.3)'
  };
};

const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Never';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    if (isNaN(diffMs) || diffMs < 0) return 'Just now';
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return 'Never';
  }
};

export default function AdminPage() {
  const router = useRouter();
  
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const loggedInEmail = React.useRef(''); // persists the email used to sign in
  const loadedProfileUserIdRef = React.useRef(null);
  
  // Mounted state for hydration fix
  const [mounted, setMounted] = useState(false);

  // Dashboard state tabs: 'spreadsheet', 'orders', 'share'
  const [activeTab, setActiveTab] = useState('spreadsheet');

  // Spreadsheet product editor states
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [abandonedCarts, setAbandonedCarts] = useState([]);
  const [cartSort, setCartSort] = useState('date_desc');
  const [cartFilterContact, setCartFilterContact] = useState('all');
  const [cartFilterStatus, setCartFilterStatus] = useState('all');
  const [cartFilterValue, setCartFilterValue] = useState('all');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderSearch, setOrderSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [loadingAbandonedCarts, setLoadingAbandonedCarts] = useState(true);
  const [sendingRecoveryEmail, setSendingRecoveryEmail] = useState({});
  const [sendingRecoveryWhatsApp, setSendingRecoveryWhatsApp] = useState({});
  const [selectedCartIds, setSelectedCartIds] = useState([]);
  const [lastSelectedCartIndex, setLastSelectedCartIndex] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgressText, setBulkProgressText] = useState('');
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [leads, setLeads] = useState([]);
  const [lastSelectedLeadIndex, setLastSelectedLeadIndex] = useState(null);
  const [expandedLeadViews, setExpandedLeadViews] = useState({});
  const [selectedLeadDetails, setSelectedLeadDetails] = useState(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [inquiryCount, setInquiryCount] = useState(0);
  const [unreadTeamMsgCount, setUnreadTeamMsgCount] = useState(0);
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);
  const [selectedCartDetails, setSelectedCartDetails] = useState(null);
  const [loadingLeads, setLoadingLeads] = useState(true);
  
  // Facebook Notifications States
  const [facebookNotifications, setFacebookNotifications] = useState([]);
  const [loadingFbNotifications, setLoadingFbNotifications] = useState(true);
  const [fbFilter, setFbFilter] = useState('All');
  const [toastMessage, setToastMessage] = useState('');
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsSourceFilter, setLeadsSourceFilter] = useState('All');
  const [leadsAreaFilter, setLeadsAreaFilter] = useState('All');
  const [fbReplyId, setFbReplyId] = useState(null);
  const [fbReplyText, setFbReplyText] = useState('');
  const [fbReplyLoading, setFbReplyLoading] = useState(false);
  
  // Pagination States
  const [leadsCurrentPage, setLeadsCurrentPage] = useState(1);
  const [leadsPerPage, setLeadsPerPage] = useState(25);
  const [ordersCurrentPage, setOrdersCurrentPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(25);

  const [productViews, setProductViews] = useState([]);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(FALLBACK_EXCHANGE_RATE);
  
  // Storage Bucket States
  const [bucketImages, setBucketImages] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loadingBucketImages, setLoadingBucketImages] = useState(false);
  
  // CMS States
  const [blogs, setBlogs] = useState([]);
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [siteSettings, setSiteSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [cmsSaveStatus, setCmsSaveStatus] = useState('');
  const [cmsSaveLoading, setCmsSaveLoading] = useState(false);
  const [editingBlog, setEditingBlog] = useState(null);
  const [businessLinks, setBusinessLinks] = useState(null);  
  // CSV Import States
  const [csvDragActive, setCsvDragActive] = useState(false);
  const [csvStatus, setCsvStatus] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const [isCsvOpen, setIsCsvOpen] = useState(false);

  // Operation statuses
  const [saveStatus, setSaveStatus] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  // Edit Description Modal States
  const [editDescModalOpen, setEditDescModalOpen] = useState(false);
  const [editDescProduct, setEditDescProduct] = useState(null);
  const [editDescEn, setEditDescEn] = useState('');
  const [editDescEs, setEditDescEs] = useState('');
  const [loadingAiDesc, setLoadingAiDesc] = useState(false);
  const [loadingAiTranslate, setLoadingAiTranslate] = useState(false);

  // AI WhatsApp Outbound Composer States
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waRecipient, setWaRecipient] = useState(null); // { name, phone, orderId, cartItems, context }
  const [waMessageText, setWaMessageText] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waDrafting, setWaDrafting] = useState(false);
  const [waSelectedAgent, setWaSelectedAgent] = useState('');
  const [waSelectedTemplate, setWaSelectedTemplate] = useState('standard');

  // AI Leads Outreach Composer States
  const [leadOutreachModalOpen, setLeadOutreachModalOpen] = useState(false);
  const [leadOutreachActive, setLeadOutreachActive] = useState(null); // the current lead object
  const [leadOutreachMethod, setLeadOutreachMethod] = useState('whatsapp'); // 'whatsapp' or 'email'
  const [leadOutreachMessage, setLeadOutreachMessage] = useState('');
  const [leadOutreachDrafting, setLeadOutreachDrafting] = useState(false);
  const [leadOutreachSending, setLeadOutreachSending] = useState(false);

  // AI Copilot States
  const [aiChatMessages, setAiChatMessages] = useState([
    { role: 'assistant', text: '¡Hola! Soy tu Copiloto de Inteligencia Artificial para Costa Peptides. 🧬 ¿En qué te puedo asistir hoy?\n\nPuedo redactar boletines de marketing, traducir descripciones científicas, formular resúmenes de investigación para tus blogs, o estructurar plantillas de mensajes de WhatsApp altamente personalizadas.' }
  ]);
  const [aiInputText, setAiInputText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // WhatsApp AI Live Inbox States
  const [whatsappMessages, setWhatsappMessages] = useState([]);
  const [loadingWhatsappMessages, setLoadingWhatsappMessages] = useState(true);
  const [activeChatWaId, setActiveChatWaId] = useState(null);
  const [whatsappSettings, setWhatsappSettings] = useState({
    ai_auto_reply: true,
    ai_system_prompt: DEFAULT_WHATSAPP_AI_PROMPT,
  });
  const [savingWaSettings, setSavingWaSettings] = useState(false);
  const [chatInputText, setChatInputText] = useState('');
  const [draftingAiReply, setDraftingAiReply] = useState(false);

  // Baileys (2nd Device) Inbox States
  const [baileysActiveChatWaId, setBaileysActiveChatWaId] = useState(null);
  const [baileysChatInputText, setBaileysChatInputText] = useState('');
  const [sendingBaileysMsg, setSendingBaileysMsg] = useState(false);

  // Save WhatsApp settings handler
  const handleSaveWhatsappSettings = async (settings) => {
    setSavingWaSettings(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('site_settings')
          .upsert({ id: 'whatsapp_settings', value: settings });
        if (error) throw error;
        setWhatsappSettings(settings);
        alert('✅ WhatsApp AI autopilot settings saved successfully!');
      } else {
        alert('Supabase is not configured. Saving locally in memory.');
        setWhatsappSettings(settings);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingWaSettings(false);
    }
  };

  // Ask Gemini to draft response contextually
  const handleDraftAiChatReply = async (waId) => {
    if (!waId) return;
    setDraftingAiReply(true);
    try {
      const activeThread = whatsappMessages
        .filter(m => m.wa_id === waId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      const threadContext = activeThread.map(m => 
        `${m.direction === 'inbound' ? 'Customer' : 'Store Assistant (' + (m.display_name || 'AI') + ')'}: "${m.message_text}"`
      ).join('\n');

      const latestMsg = activeThread[activeThread.length - 1]?.message_text || '';

      const waTail = waId.replace(/\D/g, '').slice(-8);
      const matchedOrders = orders
        .filter((o) => (o.customer_phone || '').replace(/\D/g, '').includes(waTail))
        .slice(0, 2);
      const matchedCarts = abandonedCarts
        .filter((c) => (c.customer_phone || '').replace(/\D/g, '').includes(waTail) && Array.isArray(c.cart_data) && c.cart_data.length > 0)
        .slice(0, 2);

      let crmContext = '';
      if (matchedOrders.length) {
        crmContext += 'Customer orders:\n' + matchedOrders.map((o) =>
          `- #${o.order_number || o.id.slice(0, 8)} (${o.status}): ${(o.items || []).map((i) => `${i.product} x${i.qty}`).join(', ')}`
        ).join('\n') + '\n\n';
      }
      if (matchedCarts.length) {
        crmContext += 'Active abandoned carts:\n' + matchedCarts.map((c) =>
          `- ${c.cart_data.map((i) => `${i.product} x${i.qty}`).join(', ')} | https://catalog.peptidescostarica.net/catalog?recover_session=${c.session_id}`
        ).join('\n');
      }

      const promptText = `
System Instructions:
${whatsappSettings.ai_system_prompt}

Active Products in Catalog:
${products.map(p => `- ${p.product} (Category: ${p.category}, Price: ${p.priceUsd} USD / ${p.priceCrc || 'N/A'} CRC, Status: ${p.status})`).join('\n')}

${crmContext ? `Customer CRM Context:\n${crmContext}\n` : ''}
Recent Conversation Thread:
${threadContext}

Customer's Latest Message:
"${latestMsg}"

Please draft a perfect next response to this customer. Match their language (Spanish or English). Write only the reply body ready to send. Keep it natural, polite, and scientific yet friendly. Return ONLY the reply text, no headers or meta-notes.
`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt: promptText
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setChatInputText(data.text.trim());
      } else {
        alert('Failed to draft AI response: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error generating draft: ' + err.message);
    } finally {
      setDraftingAiReply(false);
    }
  };

  // Send Manual reply via WhatsApp Cloud API
  const handleSendLiveWhatsappMessage = async () => {
    if (!activeChatWaId || !chatInputText.trim()) return;
    
    const textToSend = chatInputText.trim();
    setChatInputText('');

    // Optimistically insert message into UI state thread
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      wa_id: activeChatWaId,
      display_name: 'Peptides Costa Rica',
      message_text: textToSend,
      message_type: 'text',
      direction: 'outbound',
      created_at: new Date().toISOString()
    };
    
    setWhatsappMessages(prev => [optimisticMessage, ...prev]);

    try {
      const res = await adminFetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeChatWaId,
          message: textToSend,
          customerName: 'Peptides Customer'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        loadAdminData();
      } else {
        alert('❌ Failed to send WhatsApp: ' + (data.error || 'Unknown error'));
        setWhatsappMessages(prev => prev.filter(m => m.id !== tempId));
        setChatInputText(textToSend);
      }
    } catch (err) {
      console.error(err);
      alert('❌ Failed to send WhatsApp: ' + err.message);
      setWhatsappMessages(prev => prev.filter(m => m.id !== tempId));
      setChatInputText(textToSend);
    }
  };

  // Send reply via Baileys (2nd Device) session
  const handleSendBaileysMessage = async () => {
    if (!baileysActiveChatWaId || !baileysChatInputText.trim()) return;
    const textToSend = baileysChatInputText.trim();
    setBaileysChatInputText('');
    setSendingBaileysMsg(true);

    const tempId = `temp-baileys-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      wa_id: baileysActiveChatWaId,
      display_name: 'Peptides Costa Rica',
      message_text: textToSend,
      message_type: 'text',
      direction: 'outbound',
      source: 'baileys_session',
      created_at: new Date().toISOString(),
    };
    setWhatsappMessages(prev => [optimisticMessage, ...prev]);

    try {
      const res = await adminFetch('/api/admin/whatsapp-session/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: baileysActiveChatWaId, message: textToSend }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert('❌ Failed to send: ' + (data.error || 'Unknown error'));
        setWhatsappMessages(prev => prev.filter(m => m.id !== tempId));
        setBaileysChatInputText(textToSend);
      } else {
        loadAdminData();
      }
    } catch (err) {
      alert('❌ Failed to send: ' + err.message);
      setWhatsappMessages(prev => prev.filter(m => m.id !== tempId));
      setBaileysChatInputText(textToSend);
    } finally {
      setSendingBaileysMsg(false);
    }
  };

  const handleSendFbReply = async (notification) => {
    if (!fbReplyText.trim()) return;
    setFbReplyLoading(true);
    try {
      const res = await adminFetch('/api/facebook/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: notification.sender_id,
          messageText: fbReplyText.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMessage('Reply sent successfully!');
        setFbReplyText('');
        setFbReplyId(null);
        handleMarkNotificationRead(notification.id);
      } else {
        alert('Failed to send reply: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Error sending reply: ' + err.message);
    } finally {
      setFbReplyLoading(false);
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  // Carts AI Audit States
  const [cartsAiText, setCartsAiText] = useState('');
  const [generatingCartsAi, setGeneratingCartsAi] = useState(false);

  const handleGenerateCartsAi = async () => {
    setGeneratingCartsAi(true);
    setCartsAiText('');
    try {
      const activeAbandoned = abandonedCarts.filter(c => c.status === 'active' || !c.status);
      const totalPotentialVal = activeAbandoned.reduce((sum, c) => {
        if (!Array.isArray(c.cart_data)) return sum;
        return sum + c.cart_data.reduce((acc, item) => {
          const price = parseFloat((item.price_usd || item.priceUsd || '0').replace(/[^0-9.]/g, '')) || 0;
          return acc + (price * (item.qty || 1));
        }, 0);
      }, 0);

      const itemsDropped = {};
      activeAbandoned.forEach(c => {
        if (Array.isArray(c.cart_data)) {
          c.cart_data.forEach(item => {
            const pName = item.product || 'Unknown Product';
            itemsDropped[pName] = (itemsDropped[pName] || 0) + (item.qty || 1);
          });
        }
      });

      const prompt = `You are the chief cart recovery optimizer at Peptides Costa Rica.
Analyze the following active abandoned carts statistics:
- Total Active Abandoned Carts: ${activeAbandoned.length}
- Total Potential Recoverable Value: $${totalPotentialVal.toFixed(2)} USD (CRC ${(totalPotentialVal * exchangeRate).toLocaleString()})
- Items Dropped in Carts (Frequency List): ${Object.entries(itemsDropped).map(([name, qty]) => `${name} (x${qty})`).join(', ') || 'No item data available'}

Please provide the recovery analysis in BOTH English and Spanish. 
Format it as two clear, consecutive sections:
"🇬🇧 ENGLISH CARTS RECOVERY STRATEGY"
and
"🇪🇸 ESTRATEGIA DE RECUPERACIÓN EN ESPAÑOL"

For each language section, include:
1. **Auditor Verdict** (1 bold sentence regarding the urgency/magnitude of this recoverable pool).
2. **Frequency Leader analysis** (Explain which peptide is most abandoned and why: e.g. BPC-157 recovery hooks, Semaglutide commitment dropoff).
3. **Drafted High-converting Pitch Templates** (Write 2 custom WhatsApp templates to recover the top items, including an explicit 10% coupon hook or free courier shipping hook).

Keep your tone highly professional, precise, data-driven, and empowering. Format with clean Markdown (bold text, bullet points). Do not write any greetings or preambles, just start directly with the English header.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCartsAiText(data.text);
      } else {
        alert('Failed to generate insights: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate insights: ' + err.message);
    } finally {
      setGeneratingCartsAi(false);
    }
  };

  // Leads AI Audit States
  const [leadsAiText, setLeadsAiText] = useState('');
  const [generatingLeadsAi, setGeneratingLeadsAi] = useState(false);

  const handleGenerateLeadsAi = async () => {
    setGeneratingLeadsAi(true);
    setLeadsAiText('');
    try {
      const totalLeads = leads.length;
      const referralSources = {};
      const cities = {};

      leads.forEach(l => {
        const source = l.utm_source || l.source || 'Organic/Direct';
        referralSources[source] = (referralSources[source] || 0) + 1;

        const city = l.region || l.city || 'Unknown Region';
        cities[city] = (cities[city] || 0) + 1;
      });

      const prompt = `You are the lead marketing director at Peptides Costa Rica.
Analyze the following catalog access leads pipeline statistics:
- Total Leads Captured: ${totalLeads}
- Traffic Source Breakdown: ${Object.entries(referralSources).map(([source, count]) => `${source} (${count} leads)`).join(', ') || 'No source data'}
- Top Geographic Regions: ${Object.entries(cities).slice(0, 5).map(([city, count]) => `${city} (${count} leads)`).join(', ') || 'No region data'}

Please provide a highly strategic lead acquisition & conversion analysis in BOTH English and Spanish.
Format it as two clear, consecutive sections:
"🇬🇧 ENGLISH LEADS STRATEGY & CAMPAIGNS"
and
"🇪🇸 ESTRATEGIA Y CAMPAÑAS DE PROSPECTOS"

For each language section, include:
1. **Auditor Verdict** (1 bold sentence grading your lead acquisition speed and geographical interest).
2. **Channel Performance analysis** (Identify which acquisition channels are working best and how to optimize them, e.g. paid ads vs instagram influencers).
3. **Outbound Outreach Campaign** (Draft a highly persuasive, hyper-targeted cold outreach email & WhatsApp message in both languages targeting prospects who haven't completed checkout yet, offering an educational catalog review or specific scientific explanation).

Keep your tone highly professional, precise, data-driven, and empowering. Format with clean Markdown (bold text, bullet points). Do not write any greetings or preambles, just start directly with the English header.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLeadsAiText(data.text);
      } else {
        alert('Failed to generate insights: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate insights: ' + err.message);
    } finally {
      setGeneratingLeadsAi(false);
    }
  };


  // Link share builder states
  const [shareLang, setShareLang] = useState('es');
  const [shareCurrency, setShareCurrency] = useState('CRC');
  const [shareSource, setShareSource] = useState('none');
  const [shareMedium, setShareMedium] = useState('');
  const [shareCampaign, setShareCampaign] = useState('');
  const [shareProduct, setShareProduct] = useState('all');
  const [shareCopied, setShareCopied] = useState(false);

  // Password change states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Export Modal States
  const [exportModalType, setExportModalType] = useState(null); // 'orders' | 'products' | 'carts'
  const [exportLoading, setExportLoading] = useState(false);

  // Leads Editing States
  const [editingLeadId, setEditingLeadId] = useState(null);
  const [editLeadValue, setEditLeadValue] = useState('');
  const [editLeadMethod, setEditLeadMethod] = useState('');
  const [selectedLeads, setSelectedLeads] = useState([]);

  // Dynamic CRM states
  const [generatingIndividualAi, setGeneratingIndividualAi] = useState(false);
  const [individualAiText, setIndividualAiText] = useState('');
  const [isLocalAiDraft, setIsLocalAiDraft] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const getLeadConversion = (lead) => {
    if (!lead || !lead.contact_value) return { converted: false };
    const val = lead.contact_value.trim().toLowerCase();
    const isEmail = val.includes('@');
    
    if (isEmail) {
      const match = orders.find(o => o.customer_email && o.customer_email.trim().toLowerCase() === val);
      if (match) return { converted: true, order: match };
    } else {
      const cleanLeadPhone = val.replace(/[^0-9]/g, '');
      if (cleanLeadPhone.length >= 6) {
        const match = orders.find(o => {
          if (!o.customer_phone) return false;
          const cleanOrderPhone = o.customer_phone.replace(/[^0-9]/g, '');
          return cleanOrderPhone.endsWith(cleanLeadPhone) || cleanLeadPhone.endsWith(cleanOrderPhone);
        });
        if (match) return { converted: true, order: match };
      }
    }
    return { converted: false };
  };

  const handleLeadFieldUpdate = async (id, fieldName, value) => {
    // Update local state first
    setLeads(prev => prev.map(l => l.id === id ? { ...l, [fieldName]: value } : l));

    // Save to localStorage in case database schema lacks status/notes columns
    localStorage.setItem(`lead_${fieldName}_${id}`, value);

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('catalog_leads')
          .update({ [fieldName]: value })
          .eq('id', id);

        if (error) {
          console.warn(`Supabase catalog_leads update warning (using local fallback):`, error.message);
        }
      } catch (err) {
        console.warn(`Supabase catalog_leads update error:`, err);
      }
    }
  };

  const logOutreachToNotes = async (lead, outreachType, messageText) => {
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const logHeader = `[${timestamp}] ${outreachType === 'email' ? '✉️ Custom Email Sent' : '💬 WhatsApp Outreach Sent'}:\n`;
    const separator = '-'.repeat(40) + '\n';
    const logEntry = `${logHeader}${separator}${messageText.trim()}\n${separator}\n`;
    
    // Fetch latest lead notes dynamically
    const latestLead = leads.find(l => l.id === lead.id) || lead;
    const currentNotes = latestLead.notes || '';
    const updatedNotes = currentNotes ? `${logEntry}${currentNotes}` : logEntry.trim();
    
    await handleLeadFieldUpdate(lead.id, 'notes', updatedNotes);
  };

  const handleMarkAsContacted = async (leadId) => {
    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, last_contacted_at: now } : l));
    setSelectedLeadDetails(prev => prev && prev.id === leadId ? { ...prev, last_contacted_at: now } : prev);

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('catalog_leads')
          .update({ last_contacted_at: now })
          .eq('id', leadId);

        if (error) {
          console.warn(`Supabase catalog_leads last_contacted_at update warning:`, error.message);
        }
      } catch (err) {
        console.warn(`Supabase catalog_leads last_contacted_at update error:`, err);
      }
    }
  };

  const handleSendEmailOutreach = async (lead, message) => {
    if (!lead || !lead.contact_value || !message) return;
    setEmailSending(true);
    try {
      const res = await adminFetch('/api/admin/send-email', {
        method: 'POST',
        body: JSON.stringify({
          to: lead.contact_value,
          subject: lead.language === 'es' ? 'Acceso Exclusivo al Catálogo - Peptides Costa Rica' : 'Exclusive Catalog Access - Peptides Costa Rica',
          message: message
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ Email outreach sent successfully through your SMTP server!');
        await logOutreachToNotes(lead, 'email', message);
        await handleMarkAsContacted(lead.id);
      } else {
        alert('❌ Failed to send email through server: ' + (data.error || 'Unknown error') + '\n\nOpening your personal email client as fallback instead...');
        const subject = encodeURIComponent(lead.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry');
        window.location.href = `mailto:${lead.contact_value}?subject=${subject}&body=${encodeURIComponent(message)}`;
        await logOutreachToNotes(lead, 'email', `(Fallback Client)\nSubject: ${lead.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry'}\n\n${message}`);
        await handleMarkAsContacted(lead.id);
      }
    } catch (err) {
      console.error(err);
      alert('❌ Connection failed: ' + err.message + '\n\nOpening your personal email client as fallback instead...');
      const subject = encodeURIComponent(lead.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry');
      window.location.href = `mailto:${lead.contact_value}?subject=${subject}&body=${encodeURIComponent(message)}`;
      await logOutreachToNotes(lead, 'email', `(Fallback Client Connection Error)\nSubject: ${lead.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry'}\n\n${message}`);
      await handleMarkAsContacted(lead.id);
    } finally {
      setEmailSending(false);
    }
  };

  const openLeadOutreachComposer = (lead, method) => {
    // Dynamically retrieve viewed products for this lead using global productViews state
    const views = productViews.filter(v => v.contact_value === lead.contact_value);
    const uniqueViewedProducts = Array.from(new Set(views.map(v => v.product_name).filter(Boolean)));
    const enrichedLead = { ...lead, browsing_history: uniqueViewedProducts };

    setLeadOutreachActive(enrichedLead);
    setLeadOutreachMethod(method);
    
    // Create a highly-converting, sales-optimized template message
    let defaultMsg = '';
    const productsStr = uniqueViewedProducts.length > 0 
      ? uniqueViewedProducts.join(', ') 
      : '';
      
    if (lead.language === 'es') {
      if (method === 'email') {
        if (productsStr) {
          defaultMsg = `¡Hola! 👋

Vimos que estuviste revisando nuestro catálogo de péptidos y te interesaste en ${productsStr}. 🧪

¿Tienes alguna duda sobre la reconstitución, dosis o envíos express en Costa Rica? 

Puedes volver al catálogo para completar tu orden en https://catalog.peptidescostarica.net/catalog (¡usa el cupón *COSTA10* para un 10% de descuento!). 

Si prefieres coordinar o realizar tus consultas por WhatsApp, puedes escribirnos directamente a nuestro WhatsApp de la compañía +506 8404-6973 haciendo clic en este enlace: https://wa.me/50684046973

¡Pura vida!
Peptides Costa Rica`;
        } else {
          defaultMsg = `¡Hola! 👋

Vimos que estuviste revisando nuestro catálogo de péptidos en https://catalog.peptidescostarica.net/catalog. 🧪

¿Tienes alguna consulta técnica o sobre stock en la que te podamos ayudar hoy?

Puedes volver al catálogo para completar tu orden en https://catalog.peptidescostarica.net/catalog (¡usa el cupón *COSTA10* para un 10% de descuento!).

Si prefieres coordinar o realizar tus consultas por WhatsApp, puedes escribirnos directamente a nuestro WhatsApp de la compañía +506 8404-6973 haciendo clic en este enlace: https://wa.me/50684046973

¡Pura vida!
Peptides Costa Rica`;
        }
      } else {
        // WhatsApp method
        if (productsStr) {
          defaultMsg = `¡Hola! 👋 Vimos que estuviste revisando nuestro catálogo de péptidos y te interesaste en *${productsStr}*. 🧪\n\n¿Tienes alguna duda sobre la reconstitución, dosis o envíos express en Costa Rica? \n\nPuedes volver al catálogo en catalog.peptidescostarica.net/catalog (usa el cupón *COSTA10* para un 10% de descuento) o responder a este WhatsApp de la compañía al +506 8404-6973 para coordinar de inmediato.`;
        } else {
          defaultMsg = `¡Hola! 👋 Vimos que estuviste revisando nuestro catálogo de péptidos en catalog.peptidescostarica.net/catalog. 🧪\n\n¿Tienes alguna consulta técnica o sobre stock en la que te podamos ayudar hoy?\n\nPuedes volver al catálogo para completar tu orden con un 10% de descuento usando el cupón: *COSTA10* o responder directamente a este WhatsApp de la compañía al +506 8404-6973.`;
        }
      }
    } else {
      if (method === 'email') {
        if (productsStr) {
          defaultMsg = `Hi there! 👋

We noticed you were browsing our peptide catalog and were interested in ${productsStr}. 🧪

Do you have any research questions regarding reconstitution, dosages, or express shipping in Costa Rica?

You can return to our catalog to complete your order at https://catalog.peptidescostarica.net/catalog (use coupon *COSTA10* for 10% off!).

If you prefer to coordinate or ask questions via WhatsApp, you can chat with us directly at our company WhatsApp number +506 8404-6973 by clicking here: https://wa.me/50684046973

Best regards,
Peptides Costa Rica`;
        } else {
          defaultMsg = `Hi there! 👋

We noticed you were browsing our peptide catalog at https://catalog.peptidescostarica.net/catalog. 🧪

Do you have any research questions or stock inquiries we can help you with today?

You can return to our catalog to complete your purchase at https://catalog.peptidescostarica.net/catalog (use coupon *COSTA10* for 10% off!).

If you prefer to coordinate or ask questions via WhatsApp, you can chat with us directly at our company WhatsApp number +506 8404-6973 by clicking here: https://wa.me/50684046973

Best regards,
Peptides Costa Rica`;
        }
      } else {
        // WhatsApp method
        if (productsStr) {
          defaultMsg = `Hi there! 👋 We noticed you were browsing our peptide catalog and were interested in *${productsStr}*. 🧪\n\nDo you have any research questions regarding reconstitution, dosages, or express shipping in Costa Rica?\n\nYou can return to catalog.peptidescostarica.net/catalog (use coupon *COSTA10* for 10% off) or reply directly to this company WhatsApp number (+506 8404-6973) to coordinate.`;
        } else {
          defaultMsg = `Hi there! 👋 We noticed you were browsing our peptide catalog at catalog.peptidescostarica.net/catalog. 🧪\n\nDo you have any research questions or stock inquiries we can help you with today?\n\nYou can return to our catalog to complete your purchase with 10% off using coupon: *COSTA10* or reply directly to this company WhatsApp number (+506 8404-6973).`;
        }
      }
    }
    
    setLeadOutreachMessage(defaultMsg);
    setLeadOutreachModalOpen(true);
  };

  const handleDraftLeadOutreachMessage = async () => {
    if (!leadOutreachActive) return;
    
    setLeadOutreachDrafting(true);
    try {
      const productsStr = leadOutreachActive.browsing_history && leadOutreachActive.browsing_history.length > 0 
        ? leadOutreachActive.browsing_history.join(', ') 
        : '';
      
      const lang = leadOutreachActive.language === 'es' ? 'Spanish' : 'English';
      
      let prompt = `Write an extremely short, simple, warm, and highly converting outbound sales outreach ${leadOutreachMethod === 'email' ? 'email body' : 'WhatsApp message'} in ${lang} for a customer who browsed our site. 

Core Rules:
1. Keep the message extremely short and sweet (MAX 3-4 sentences total).
2. For WhatsApp outreach, include the catalog link (catalog.peptidescostarica.net/catalog) and mention the company WhatsApp number +506 8404-6973.
3. For Email outreach, you MUST explicitly include both the catalog link (https://catalog.peptidescostarica.net/catalog) and a clickable direct link to WhatsApp (https://wa.me/50684046973) along with the company WhatsApp number (+506 8404-6973).
4. Be professional and friendly. Avoid lengthy chemical explanations or overly dense medical details. Keep it focused on helping them finalize their research compounds.`;
      
      if (productsStr) {
        prompt += `\n- The user was interested in: "${productsStr}". Mention we have certified 99%+ pure stocks ready for rapid shipment via Correos de Costa Rica.`;
      } else {
        prompt += `\n- Invite them to ask about our research-grade catalog of 99%+ lab-tested high-purity peptides, and coordinate safe dispatch in Costa Rica.`;
      }
      
      if (leadOutreachActive.city || leadOutreachActive.country) {
        prompt += `\n- Their location is: ${[leadOutreachActive.city, leadOutreachActive.region, leadOutreachActive.country].filter(Boolean).join(', ')}.`;
      }
      
      prompt += `\n\nDo NOT write placeholder fields, subject lines, greetings placeholders, or quotes. Just output the ready-to-send text body.`;
      
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      
      const data = await res.json();
      if (res.ok && data.text) {
        setLeadOutreachMessage(data.text.trim());
      } else {
        alert('Generation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Generation failed: ' + err.message);
    } finally {
      setLeadOutreachDrafting(false);
    }
  };

  const handleSendLeadOutreach = async () => {
    if (!leadOutreachActive || !leadOutreachMessage.trim()) return;
    setLeadOutreachSending(true);
    try {
      if (leadOutreachMethod === 'whatsapp') {
        const formattedPhone = cleanPhoneNumber(leadOutreachActive.contact_value);
        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(leadOutreachMessage)}`, '_blank');
        
        await logOutreachToNotes(leadOutreachActive, 'whatsapp', leadOutreachMessage);
        await handleMarkAsContacted(leadOutreachActive.id);
        
        alert('✅ WhatsApp outreach window opened!');
        setLeadOutreachModalOpen(false);
      } else {
        try {
          const res = await adminFetch('/api/admin/send-email', {
            method: 'POST',
            body: JSON.stringify({
              to: leadOutreachActive.contact_value,
              subject: leadOutreachActive.language === 'es' ? 'Acceso Exclusivo al Catálogo - Peptides Costa Rica' : 'Exclusive Catalog Access - Peptides Costa Rica',
              message: leadOutreachMessage
            })
          });
          
          const data = await res.json();
          if (res.ok && data.success) {
            alert('✅ Email outreach sent successfully through your SMTP server!');
            await logOutreachToNotes(leadOutreachActive, 'email', leadOutreachMessage);
            await handleMarkAsContacted(leadOutreachActive.id);
            setLeadOutreachModalOpen(false);
          } else {
            alert('❌ Failed to send email through server: ' + (data.error || 'Unknown error') + '\n\nOpening your personal email client as fallback instead...');
            const subject = encodeURIComponent(leadOutreachActive.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry');
            window.location.href = `mailto:${leadOutreachActive.contact_value}?subject=${subject}&body=${encodeURIComponent(leadOutreachMessage)}`;
            await logOutreachToNotes(leadOutreachActive, 'email', `(Fallback Client)\nSubject: ${leadOutreachActive.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry'}\n\n${leadOutreachMessage}`);
            await handleMarkAsContacted(leadOutreachActive.id);
            setLeadOutreachModalOpen(false);
          }
        } catch (err) {
          console.error(err);
          alert('❌ Connection failed: ' + err.message + '\n\nOpening your personal email client as fallback instead...');
          const subject = encodeURIComponent(leadOutreachActive.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry');
          window.location.href = `mailto:${leadOutreachActive.contact_value}?subject=${subject}&body=${encodeURIComponent(leadOutreachMessage)}`;
          await logOutreachToNotes(leadOutreachActive, 'email', `(Fallback Client Connection Error)\nSubject: ${leadOutreachActive.language === 'es' ? 'Información sobre Péptidos de Costa Rica' : 'Peptides Costa Rica Inquiry'}\n\n${leadOutreachMessage}`);
          await handleMarkAsContacted(leadOutreachActive.id);
          setLeadOutreachModalOpen(false);
        }
      }
    } catch(err) {
      console.error(err);
    } finally {
      setLeadOutreachSending(false);
    }
  };

  const generateLocalFallbackDraft = (lead, viewedProducts, location) => {
    const isEs = lead.language === 'es';
    const isWhatsApp = lead.contact_method === 'whatsapp';
    const hasSpecificProducts = viewedProducts && !viewedProducts.includes('our scientific peptide catalog');
    const firstProduct = hasSpecificProducts ? viewedProducts.split(',')[0].trim() : '';

    if (isWhatsApp) {
      if (isEs) {
        return `¡Hola! 👋 Vimos que estuviste revisando nuestro catálogo de péptidos y te interesaste en *${firstProduct || 'nuestros compuestos'}*. 🧪

¿Tienes alguna duda sobre la reconstitución, dosis o envíos express en Costa Rica? 

Puedes volver al catálogo en catalog.peptidescostarica.net/catalog o respondernos directamente aquí para coordinar por WhatsApp. ¡Usa el cupón *COSTA10* para un 10% de descuento!`;
      } else {
        return `Hi there! 👋 We noticed you were browsing our peptide catalog and were interested in *${firstProduct || 'our compounds'}*. 🧪

Do you have any research questions regarding reconstitution, dosages, or express shipping in Costa Rica?

You can return to our catalog at catalog.peptidescostarica.net/catalog or reply directly here to coordinate via WhatsApp. Use coupon *COSTA10* for 10% off!`;
      }
    } else {
      if (isEs) {
        return `¡Hola! 👋

Vimos que estuviste consultando información sobre *${viewedProducts}* en nuestro catálogo catalog.peptidescostarica.net/catalog. 🧪

Queríamos ponernos a tu disposición por si tienes alguna duda técnica o consulta sobre stock. Realizamos envíos rápidos a todo el país vía Correos de Costa Rica.

Puedes completar tu pedido en el catálogo o chatear directamente con nosotros por WhatsApp al +506 8404 6973. ¡Aprovecha un 10% de descuento usando el cupón **COSTA10**!

Quedamos a tu entera disposición,

Soporte - Peptides Costa Rica`;
      } else {
        return `Hi there! 👋

We noticed you were browsing *${viewedProducts}* in our research catalog at catalog.peptidescostarica.net/catalog. 🧪

We wanted to reach out in case you have any technical questions or stock inquiries. We offer certified purity >99% and fast shipping across Costa Rica.

You can complete your purchase directly on our site or chat with us on WhatsApp at +506 8404 6973. Use coupon **COSTA10** for a 10% discount on your order!

Best regards,

Support - Peptides Costa Rica`;
      }
    }
  };

  const handleGenerateIndividualAi = async (lead) => {
    if (!lead || !lead.contact_value) return;
    setGeneratingIndividualAi(true);
    setIndividualAiText('');
    setIsLocalAiDraft(false);

    let cleanPhoneOrEmail = lead.contact_value;
    let location = [lead.city, lead.region, lead.country].filter(Boolean).join(', ') || 'Unknown';
    let langLabel = lead.language === 'es' ? 'Spanish' : 'English';
    let viewedProducts = 'our scientific peptide catalog';

    try {
      const views = productViews.filter(v => v.contact_value === lead.contact_value);
      viewedProducts = views.map(v => v.product_name).join(', ') || 'our scientific peptide catalog';

      const prompt = `You are a professional, warm product specialist advisor at Peptides Costa Rica.
Draft a very short, sweet, and highly converting outbound outreach message to a prospect who browsed our site but hasn't completed checkout yet.

Prospect Details:
- Contact Method: ${lead.contact_method} (${cleanPhoneOrEmail})
- Preferred Language: ${langLabel}
- Catalog Browsing History: Viewed products: [${viewedProducts}]

Core Rules:
1. Keep the message extremely short and simple (MAX 3-4 sentences total). No verbose fluff.
2. Direct them to return to the catalog at catalog.peptidescostarica.net/catalog or chat with us on WhatsApp at +506 8404 6973.
3. Offer a 10% coupon code: COSTA10 to finalize their purchase.
4. Keep the tone warm, consultative, and supportive.
5. Write the response ENTIRELY in ${langLabel}. Do NOT write subject lines, placeholders, or preambles. Just output the final outreach text.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsLocalAiDraft(false);
        setIndividualAiText(data.text);
      } else {
        console.warn("Gemini API returned error. Triggering local backup engine.");
        setIsLocalAiDraft(true);
        const fallback = generateLocalFallbackDraft(lead, viewedProducts, location);
        setIndividualAiText(fallback);
      }
    } catch (err) {
      console.error("Gemini API call failed, generating local draft:", err);
      setIsLocalAiDraft(true);
      const fallback = generateLocalFallbackDraft(lead, viewedProducts, location);
      setIndividualAiText(fallback);
    } finally {
      setGeneratingIndividualAi(false);
    }
  };

  // RBAC Profile State
  const [adminProfile, setAdminProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchAdminProfile = async (userId, { showLoading = false, force = false } = {}) => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!force && loadedProfileUserIdRef.current === userId) return;

    if (showLoading) setProfileLoading(true);
    try {
      const { data, error } = await supabase.from('admin_profiles').select('*').eq('user_id', userId).single();
      if (!error && data) {
        setAdminProfile(data);
        loadedProfileUserIdRef.current = userId;
      }
    } catch (e) {
      console.error('Failed to load admin profile', e);
    } finally {
      if (showLoading) setProfileLoading(false);
    }
  };

  const hasAccess = (tabId) => {
    if (profileLoading || !adminProfile) return false;
    return resolveTabAccess(tabId, adminProfile);
  };

  const isStaffAgent = adminProfile && !adminProfile.is_superadmin;

  const visibleOrders = useMemo(
    () => (isStaffAgent ? filterOrdersVisibleToAgent(orders, adminProfile) : orders),
    [orders, adminProfile, isStaffAgent]
  );

  const navigateToTab = useCallback((tabId) => {
    if (!ADMIN_TAB_IDS.has(tabId)) return;
    setActiveTab(tabId);
    setMobileMoreOpen(false);
    router.replace(`/admin?tab=${encodeURIComponent(tabId)}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!mounted) return;
    const activeBtn = document.querySelector('.admin-tab-btn.active');
    activeBtn?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeTab, mounted]);

  useEffect(() => {
    const cls = `admin-tab-${activeTab}`;
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [activeTab]);

  // Resolve ?tab= from URL once admin profile is loaded
  useEffect(() => {
    if (!mounted || !adminProfile || profileLoading) return;

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    let targetTab = tabParam && ADMIN_TAB_IDS.has(tabParam) ? tabParam : getDefaultTab(adminProfile);

    if (!resolveTabAccess(targetTab, adminProfile)) {
      targetTab = getDefaultTab(adminProfile);
    }

    setActiveTab(targetTab);

    if (tabParam !== targetTab) {
      router.replace(`/admin?tab=${encodeURIComponent(targetTab)}`, { scroll: false });
    }
  }, [mounted, adminProfile, profileLoading, router]);

  // Support browser back/forward for tab changes
  useEffect(() => {
    if (!adminProfile || profileLoading) return;

    const onPopState = () => {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam && ADMIN_TAB_IDS.has(tabParam) && resolveTabAccess(tabParam, adminProfile)) {
        setActiveTab(tabParam);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [adminProfile, profileLoading]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAuthenticated]);

  const handleGlobalSearchSelect = (result) => {
    if (result.type === 'order') {
      setSelectedOrderDetails(result.payload);
      navigateToTab('orders');
    } else if (result.type === 'product') {
      setProductSearch(''); // Clear inline search to avoid hiding the highlighted row
      setHighlightedProductId(result.payload.id);
      navigateToTab('spreadsheet');
      setTimeout(() => {
        const el = document.getElementById(`product-row-${result.payload.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    } else if (result.type === 'lead') {
      navigateToTab('leads');
    } else if (result.type === 'customer') {
      navigateToTab('customers');
    }
  };

  const handleOrderUpdated = (updated) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    // Only refresh the open detail panel — don't auto-open it on list status changes
    setSelectedOrderDetails((prev) => (prev?.id === updated.id ? updated : prev));
  };

  const handleManualOrderCreated = (order) => {
    setOrders((prev) => [order, ...prev]);
    setSelectedOrderDetails(order);
    setNotifRefreshKey((k) => k + 1);
    navigateToTab('orders');
  };

  // Auth session — bootstrap once per login, not on every token refresh
  useEffect(() => {
    setMounted(true);
    const savedEmail = localStorage.getItem('admin_email') || 'info@peptidescostarica.net';
    loggedInEmail.current = savedEmail;

    if (!isSupabaseConfigured || !supabase) {
      console.log('Supabase not fully configured. Running in Local Simulation Mode.');
      return;
    }

    const bootstrapAdminSession = (session) => {
      if (!session?.user?.id) return;
      loggedInEmail.current = session.user.email || loggedInEmail.current;
      setIsAuthenticated(true);

      const userId = session.user.id;
      const isFirstLoadForUser = loadedProfileUserIdRef.current !== userId;
      if (isFirstLoadForUser) {
        fetchAdminProfile(userId, { showLoading: true });
        loadAdminData();
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        if (session) setIsAuthenticated(true);
        return;
      }

      if (session) {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          bootstrapAdminSession(session);
        }
        return;
      }

      setIsAuthenticated(false);
      setAdminProfile(null);
      loadedProfileUserIdRef.current = null;
      setProfileLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch live exchange rate
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const cached = localStorage.getItem('exchangeRate_USDCRC');
        const cachedTime = localStorage.getItem('exchangeRate_USDCRC_time');
        if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < 3600000) {
          setExchangeRate(parseFloat(cached));
          return;
        }
        const res = await fetch('/api/exchange-rate');
        const data = await res.json();
        if (data.rate) {
          const rate = data.rate;
          setExchangeRate(rate);
          localStorage.setItem('exchangeRate_USDCRC', rate.toString());
          localStorage.setItem('exchangeRate_USDCRC_time', Date.now().toString());
        }
      } catch (err) {
        console.error('Admin: Live exchange rate fetch failed:', err);
      }
    };
    fetchRate();
  }, []);

  // Supabase Realtime subscription for live sync across all tables
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !isAuthenticated) return;

    const channel = supabase
      .channel('admin-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abandoned_carts' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_leads' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'facebook_notifications' }, (payload) => {
        // Trigger live audio alert
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav');
          audio.volume = 0.5;
          audio.play();
        } catch (audioErr) {
          console.warn('Audio play blocked or failed:', audioErr);
        }
        
        // Show real-time alert toast
        const item = payload.new;
        setToastMessage(`New Facebook ${item.type || 'Alert'} from ${item.sender_name || 'Visitor'}!`);
        setTimeout(() => setToastMessage(''), 6000);
        
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'facebook_notifications' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiries' }, () => {
        loadAdminData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => {
        loadAdminData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated]);

  // Fetch list of files/images in the Supabase product-pics storage bucket
  const fetchBucketImages = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setLoadingBucketImages(true);
    try {
      const { data, error } = await supabase.storage
        .from('product-pics')
        .list('', {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' }
        });
      if (error) throw error;
      if (data) {
        // Map list results to public URLs, filter out placeholder folder entries
        const images = data
          .filter(file => file.name !== '.emptyFolderPlaceholder')
          .map(file => {
            const { data: { publicUrl } } = supabase.storage
              .from('product-pics')
              .getPublicUrl(file.name);
            return {
              name: file.name,
              url: publicUrl
            };
          });
        setBucketImages(images);
      }
    } catch (err) {
      console.error("Failed to list bucket images from Supabase storage:", err);
    } finally {
      setLoadingBucketImages(false);
    }
  };

  // Fetch active sales agents from admin_profiles
  const fetchAgents = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: agentData, error: agentError } = await supabase
          .from('admin_profiles')
          .select('name, email')
          .order('name', { ascending: true });
        
        if (!agentError && agentData) {
          const loadedAgents = agentData.map(a => a.name || a.email).filter(Boolean);
          setAgents(loadedAgents.length > 0 ? loadedAgents : ['Joe', 'info@peptidescostarica.net']);
        } else {
          setAgents(['Joe', 'info@peptidescostarica.net']);
        }
      } catch (err) {
        console.error("Failed to load agents:", err);
        setAgents(['Joe', 'info@peptidescostarica.net']);
      }
    } else {
      setAgents(['Joe', 'info@peptidescostarica.net']);
    }
  };

  // Fetch admin products and orders
  const loadAdminData = async () => {
    // Helper to bypass Supabase 1000 row limit
    const fetchAllRows = async (table, orderCol, ascending = false, matchEq = null) => {
      let allData = [];
      let from = 0;
      const step = 1000;
      while (true) {
        let q = supabase.from(table).select('*').order(orderCol, { ascending }).range(from, from + step - 1);
        if (matchEq) q = q.eq(matchEq.col, matchEq.val);
        const { data, error } = await q;
        if (error) { console.error(`Error fetching ${table}:`, error); break; }
        if (!data || data.length === 0) break;
        allData = [...allData, ...data];
        if (data.length < step) break;
        from += step;
      }
      return allData;
    };

    setLoadingProducts(true);
    setLoadingOrders(true);
    let loadedProducts = [];

    // Fetch bucket images
    fetchBucketImages();

    // Fetch agents
    fetchAgents();

    // 1. Fetch Products
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('priority', { ascending: true });

        if (error) {
          console.error("❌ SUPABASE ADMIN PRODUCTS SELECT ERROR:", error);
          setIsDbConnected(false);
        } else {
          console.log("✅ SUPABASE ADMIN PRODUCTS LOADED:", data?.length, "rows");
        }

        if (!error && data) {
          loadedProducts = data.map(item => ({
            id: item.id,
            product: item.product || '',
            category: item.category || '',
            priceUsd: item.price_usd || '',
            priceCrc: item.price_crc || '',
            originalPriceUsd: item.original_price_usd || '',
            originalPriceCrc: item.original_price_crc || '',
            discount: item.discount || '',
            saleStartTime: item.sale_start_time ? new Date(new Date(item.sale_start_time).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
            saleEndTime: item.sale_end_time ? new Date(new Date(item.sale_end_time).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '',
            status: item.status || 'In Stock',
            coa: item.coa || '',
            imageUrl: item.image_url || '',
            descriptionEn: item.description_en || '',
            descriptionEs: item.description_es || '',
            inventoryCount: item.inventory_count !== undefined ? item.inventory_count : null,
            lowStockThreshold: item.low_stock_threshold !== undefined ? item.low_stock_threshold : 5,
            priority: item.priority || 0
          }));
          setIsDbConnected(true);
        }
      } catch (err) {
        console.error("Failed to load products from database:", err);
        setIsDbConnected(false);
      }
    }

    // Fallback to local CSV products if database is empty or not configured
    if (loadedProducts.length === 0) {
      try {
        const response = await fetch('/master_sheet.csv');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: false,
          skipEmptyLines: true,
          complete: (results) => {
            const lines = results.data;
            const headerIndex = lines.findIndex(l => l.some(cell => cell && cell.toLowerCase().includes('product')));
            
            if (headerIndex !== -1) {
              const headers = lines[headerIndex].map(h => h.toLowerCase().trim());
              const dataLines = lines.slice(headerIndex + 1);

              const parsed = dataLines
                .filter(line => line[0])
                .map((line, idx) => {
                  const p = {};
                  headers.forEach((h, i) => {
                    const key = h.replace(/\s+/g, '');
                    if (key.includes('product') || key.includes('producto')) p.product = line[i];
                    else if (key.includes('category') || key.includes('categoría')) p.category = line[i];
                    else if (key.includes('price') || key.includes('precio')) p.priceUsd = line[i];
                    else if (key.includes('status') || key.includes('estado')) p.status = line[i];
                    else if (key.includes('discount(en)') || key.includes('descuento(en)')) p.bulkDiscountEn = line[i];
                    else if (key.includes('discount(es)') || key.includes('descuento(es)')) p.bulkDiscountEs = line[i];
                    else if (key.includes('coa')) p.coa = line[i];
                    else if (key.includes('image') || key.includes('imagen')) p.imageUrl = line[i];
                  });

                  const usdNum = parseFloat((p.priceUsd || '').replace(/[^0-9.]/g, '')) || 0;
                  const calculatedCrc = Math.round(usdNum * exchangeRate);

                  return {
                    id: `local-${idx}`,
                    product: p.product || '',
                    category: p.category || '',
                    priceUsd: p.priceUsd || '',
                    priceCrc: calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : '',
                    originalPriceUsd: '',
                    originalPriceCrc: '',
                    discount: p.bulkDiscountEs || p.bulkDiscountEn || '',
                    status: p.status || 'In Stock',
                    coa: p.coa || '',
                    imageUrl: p.imageUrl || '',
                    descriptionEn: '',
                    descriptionEs: '',
                    priority: idx
                  };
                });

              setProducts(parsed);
            }
          }
        });
      } catch (err) {
        console.error("Local CSV load error:", err);
      }
    } else {
      setProducts(loadedProducts);
    }
    setLoadingProducts(false);

    // 2. Fetch Orders
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('orders', 'created_at', false);

        if (data) {
          setOrders(data);
        }
      } catch (err) {
        console.error("Failed to load orders from database:", err);
      }
    }
    setLoadingOrders(false);

    // 3. Fetch Abandoned Carts
    setLoadingAbandonedCarts(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('abandoned_carts', 'last_updated', false, { col: 'status', val: 'active' });

        if (data) {
          const withItems = data.filter((c) => cartHasItems(c.cart_data));
          const emptySessionIds = data
            .filter((c) => !cartHasItems(c.cart_data))
            .map((c) => c.session_id);

          setAbandonedCarts(withItems);

          if (emptySessionIds.length > 0) {
            supabase
              .from('abandoned_carts')
              .delete()
              .in('session_id', emptySessionIds)
              .then(({ error }) => {
                if (error) console.warn('Empty abandoned cart cleanup failed:', error.message);
              });
          }
        }
      } catch (err) {
        console.error("Failed to load abandoned carts:", err);
      }
    }
    setLoadingAbandonedCarts(false);

    // 4. Fetch Reviews
    setLoadingReviews(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('product_reviews', 'created_at', false);

        if (data) {
          setReviews(data);
        }
      } catch (err) {
        console.error("Failed to load reviews:", err);
      }
    }
    setLoadingReviews(false);

    // 5. Fetch Leads
    setLoadingLeads(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('catalog_leads', 'created_at', false);

        if (data) {
          // Enrich leads with local storage fallbacks if status/notes are absent or null
          const enriched = data.map(l => ({
            ...l,
            status: l.status !== undefined ? (l.status || 'New') : (localStorage.getItem(`lead_status_${l.id}`) || 'New'),
            notes: l.notes !== undefined ? (l.notes || '') : (localStorage.getItem(`lead_notes_${l.id}`) || '')
          }));
          setLeads(enriched);
        }
      } catch (err) {
        console.error("Failed to load leads:", err);
      }
    }
    setLoadingLeads(false);

    if (isAuthenticated) {
      try {
        const res = await adminFetch('/api/admin/inquiries');
        if (res.ok) {
          const d = await res.json();
          setInquiryCount((d.inquiries || []).filter((i) => (i.status || '').toLowerCase() === 'new').length);
        }
      } catch {
        // inquiries API requires auth
      }
      
      if (isSupabaseConfigured && supabase && adminProfile?.email) {
        try {
          const { data, error } = await supabase
            .from('team_messages')
            .select('id')
            .eq('recipient_email', adminProfile.email)
            .eq('is_read', false);
          
          if (!error && data) {
            setUnreadTeamMsgCount(data.length);
          }
        } catch (err) {
          console.error("Failed to fetch unread team messages:", err);
        }
      }
    }

    // 5. Fetch Blogs
    setLoadingBlogs(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('blogs', 'created_at', false);
        if (data) setBlogs(data);
      } catch (err) { console.error("Failed to load blogs:", err); }
    }
    setLoadingBlogs(false);

    // 6. Fetch Site Settings
    setLoadingSettings(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('site_settings').select('*').eq('id', 'landing_page').single();
        if (!error && data) {
           setSiteSettings(data.value);
        } else {
           setSiteSettings({
              bannerActive: false,
              bannerTextEn: "Flash Sale: 10% Off All Peptides!",
              bannerTextEs: "Oferta Relámpago: ¡10% de descuento en todos los péptidos!",
              heroTitleEn: "Buy Peptides in Costa Rica",
              heroTitleEs: "Compra Péptidos en Costa Rica",
              heroSubEn: "Lab-Tested. High Purity. Fast Local Delivery.",
              heroSubEs: "Testados en Laboratorio. Alta Pureza. Entrega Local Rápida.",
              heroTextEn: "Your trusted local source for premium, research-grade peptides. Verified quality, transparent pricing, and secure checkout.",
              heroTextEs: "Tu fuente local de confianza para péptidos premium de grado investigación. Calidad verificada, precios transparentes y pago seguro."
           });
        }
      } catch (err) { console.error("Failed to load settings:", err); }

      // Fetch WhatsApp Settings as well
      try {
        const { data: waData, error: waError } = await supabase.from('site_settings').select('*').eq('id', 'whatsapp_settings').limit(1).maybeSingle();
        if (!waError && waData) {
          setWhatsappSettings(waData.value);
        }
      } catch (err) {
        console.error("Failed to load whatsapp settings:", err);
      }

      // Fetch Business Links Settings
      try {
        const { data: linkData, error: linkError } = await supabase.from('site_settings').select('*').eq('id', 'business_links').limit(1).maybeSingle();
        if (!linkError && linkData) {
          setBusinessLinks(linkData.value);
        } else {
          setBusinessLinks({
            whatsappNumber: "50684046973",
            whatsappDisplay: "+506 8404-6973",
            googleMapsUrl: "https://maps.app.goo.gl/AgpzEd8NNRKYNbJj9",
            facebookUrl: "",
            instagramUrl: "",
            supportEmail: "support@peptidescostarica.net"
          });
        }
      } catch (err) {
        console.error("Failed to load business links:", err);
      }
    }
    setLoadingSettings(false);

    // 7. Fetch Product Views
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('product_views', 'created_at', false);
        if (data) setProductViews(data);
      } catch (err) { console.error("Failed to load product views:", err); }
    }

    // 8. Fetch Facebook Notifications
    setLoadingFbNotifications(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('facebook_notifications', 'created_at', false);
        if (data) {
          setFacebookNotifications(data);
        }
      } catch (err) {
        console.error("Failed to load facebook notifications:", err);
      }
    }
    setLoadingFbNotifications(false);

    // 9. Fetch WhatsApp Messages log
    setLoadingWhatsappMessages(true);
    if (isSupabaseConfigured && supabase) {
      try {
        const data = await fetchAllRows('whatsapp_messages', 'created_at', false);
        if (data) {
          setWhatsappMessages(data);
        }
      } catch (err) {
        console.error("Failed to load whatsapp messages:", err);
      }
    }
    setLoadingWhatsappMessages(false);
  };

  // Auth Handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    if (isSupabaseConfigured && supabase) {
      // Always try Supabase Auth — this is the single source of truth
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (!error) {
          loggedInEmail.current = email.trim();
          setIsAuthenticated(true);
          setLoginError('');
          setLoginLoading(false);
          return;
        } else {
          // Supabase rejected — don't fall through, treat as real failure
          setLoginError('Invalid email or password.');
          setLoginLoading(false);
          return;
        }
      } catch (err) {
        console.error('Supabase login error:', err);
        setLoginError('Unable to reach authentication server. Please try again.');
        setLoginLoading(false);
        return;
      }
    }

    setLoginError('Authentication is not configured. Contact your administrator.');
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    loadedProfileUserIdRef.current = null;
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    router.push('/');
  };

  // Change password handler
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordStatus('');
    setPasswordLoading(true);

    // Validate new password fields
    if (newPassword.length < 6) {
      setPasswordStatus('error:Password must be at least 6 characters.');
      setPasswordLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus('error:New passwords do not match.');
      setPasswordLoading(false);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setPasswordStatus('error:Authentication is not configured.');
      setPasswordLoading(false);
      return;
    }

    try {
      // Step 1: Verify current password by signing in using the email that was used to log in
      const adminEmail = loggedInEmail.current || localStorage.getItem('admin_email') || 'info@peptidescostarica.net';
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: currentPassword
      });

      if (signInError) {
        // Current password is wrong — show the real reason
        setPasswordStatus(`error:Current password is incorrect. (${signInError.message})`);
        setPasswordLoading(false);
        return;
      }

      // Step 2: Actually change the password in Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        setPasswordStatus(`error:${updateError.message}`);
        setPasswordLoading(false);
        return;
      }

      localStorage.setItem('admin_email', adminEmail);
      setPasswordStatus('success:Password updated! Please log in again with your new password.');
      setPasswordLoading(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Sign out so user is forced to log in fresh with new password
      setTimeout(async () => {
        setPasswordStatus('');
        setShowPasswordModal(false);
        loadedProfileUserIdRef.current = null;
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      }, 2500);

    } catch (err) {
      console.error('Password change error:', err);
      setPasswordStatus('error:An unexpected error occurred. Please try again.');
      setPasswordLoading(false);
    }
  };

  // Spreadsheet Cell modification helper
  const handleCellChange = (productId, fieldName, val) => {
    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, [fieldName]: val } : p
    ));
  };

  // Add Product row
  const handleAddRow = () => {
    const newPriority = products.length > 0 ? Math.min(...products.map(p => Number(p.priority) || 0)) - 1 : 0;
    const newRow = {
      id: `temp-${Date.now()}`,
      product: 'New Peptide Name',
      category: 'Weight Loss & Metabolism',
      priceUsd: '$100',
      priceCrc: '₡45,448',
      originalPriceUsd: '',
      originalPriceCrc: '',
      discount: 'Buy 5+ vials, get 15% off',
      saleStartTime: '',
      saleEndTime: '',
      status: 'In Stock',
      inventoryCount: null,
      lowStockThreshold: 5,
      coa: '',
      imageUrl: '',
      priority: newPriority
    };
    setProducts([newRow, ...products]);
  };

  // Delete row
  const handleDeleteRow = (productId) => {
    setProducts(products.filter(p => p.id !== productId));
  };

  // Move row up or down
  const handleMoveRow = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= products.length) return;
    const updated = [...products];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    // Update priority values so the order persists on save
    const withPriority = updated.map((p, i) => ({ ...p, priority: i }));
    setProducts(withPriority);
  };

  // CSV drag uploader
  const handleCsvDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setCsvDragActive(true);
    } else if (e.type === "dragleave") {
      setCsvDragActive(false);
    }
  };

  const handleCsvDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCsvDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseUploadedCsv(e.dataTransfer.files[0]);
    }
  };

  const handleCsvFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      parseUploadedCsv(e.target.files[0]);
    }
  };

  const parseUploadedCsv = (file) => {
    setCsvLoading(true);
    setCsvStatus('');

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const lines = results.data;
        const headerIndex = lines.findIndex(l => l.some(cell => cell && cell.toLowerCase().includes('product')));

        if (headerIndex === -1) {
          setCsvStatus("Could not find product header row. Please verify CSV columns.");
          setCsvLoading(false);
          return;
        }

        const headers = lines[headerIndex].map(h => h.toLowerCase().trim());
        const dataLines = lines.slice(headerIndex + 1);

        const imported = dataLines
          .filter(line => line[0])
          .map((line, idx) => {
            const p = {};
            headers.forEach((h, i) => {
              const key = h.replace(/\s+/g, '');
              if (key.includes('product') || key.includes('producto')) p.product = line[i];
              else if (key.includes('category') || key.includes('categoría')) p.category = line[i];
              else if (key.includes('price') || key.includes('precio')) p.priceUsd = line[i];
              else if (key.includes('status') || key.includes('estado')) p.status = line[i];
              else if (key.includes('discount(en)') || key.includes('descuento(en)')) p.bulkDiscountEn = line[i];
              else if (key.includes('discount(es)') || key.includes('descuento(es)')) p.bulkDiscountEs = line[i];
              else if (key.includes('coa')) p.coa = line[i];
              else if (key.includes('image') || key.includes('imagen')) p.imageUrl = line[i];
            });

            const usdNum = parseFloat((p.priceUsd || '').replace(/[^0-9.]/g, '')) || 0;
            const calculatedCrc = Math.round(usdNum * exchangeRate);

            return {
              id: `imported-${idx}-${Date.now()}`,
              product: p.product || '',
              category: p.category || '',
              priceUsd: p.priceUsd || '',
              priceCrc: p.priceCrc || (calculatedCrc > 0 ? `₡${calculatedCrc.toLocaleString('en-US')}` : ''),
              originalPriceUsd: '',
              originalPriceCrc: '',
              discount: p.bulkDiscountEs || p.bulkDiscountEn || '',
              status: p.status || 'In Stock',
              inventoryCount: null,
              lowStockThreshold: 5,
              coa: p.coa || '',
              imageUrl: p.imageUrl || '',
              priority: idx
            };
          });

        setProducts(imported);
        setCsvStatus(`Successfully loaded ${imported.length} products from CSV into grid. Click "Save Changes" to sync database.`);
        setCsvLoading(false);
      },
      error: (err) => {
        setCsvStatus(`Parsing error: ${err.message}`);
        setCsvLoading(false);
      }
    });
  };

  // Image Upload handler for cell
  const handleImageCellUpload = async (productId, e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // Show indicator
    handleCellChange(productId, 'imageUrl', 'Uploading...');

    if (isSupabaseConfigured && supabase) {
      try {
        // 1. Delete old image from storage if it exists
        const currentProduct = products.find(p => p.id === productId);
        if (currentProduct && currentProduct.imageUrl && currentProduct.imageUrl.includes('product-pics')) {
          try {
            // Extract file name from the public URL
            const urlParts = currentProduct.imageUrl.split('/product-pics/');
            if (urlParts[1]) {
              const oldFileName = decodeURIComponent(urlParts[1].split('?')[0]);
              await supabase.storage.from('product-pics').remove([oldFileName]);
              console.log('Old image deleted:', oldFileName);
            }
          } catch (delErr) {
            console.warn('Could not delete old image (non-critical):', delErr);
          }
        }

        // 2. Upload new image
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-pics')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 3. Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('product-pics')
          .getPublicUrl(filePath);

        handleCellChange(productId, 'imageUrl', publicUrl);
        fetchBucketImages(); // Refresh the list of images in the background
      } catch (err) {
        console.error("Storage upload error:", err);
        handleCellChange(productId, 'imageUrl', '');
        alert("Image upload failed. Please verify that your Supabase Storage bucket 'product-pics' exists and is set to public.");
      }
    } else {
      // Local simulation URL
      const dummyUrl = URL.createObjectURL(file);
      handleCellChange(productId, 'imageUrl', dummyUrl);
      alert("Local Simulation: Image loaded inside browser memory. To upload permanently, connect Supabase!");
    }
  };

  // Image Upload handler for Blog Cover
  const handleBlogImageUpload = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // Show uploading indicator in the field
    setEditingBlog(prev => ({ ...prev, image_url: 'Uploading...' }));

    if (isSupabaseConfigured && supabase) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `blog-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-pics')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-pics')
          .getPublicUrl(filePath);

        setEditingBlog(prev => ({ ...prev, image_url: publicUrl }));
        fetchBucketImages(); // Refresh the list of images so it appears in dropdowns
      } catch (err) {
        console.error("Blog storage upload error:", err);
        setEditingBlog(prev => ({ ...prev, image_url: '' }));
        alert("Image upload failed. Please verify that your Supabase Storage bucket 'product-pics' exists and is set to public.");
      }
    } else {
      const dummyUrl = URL.createObjectURL(file);
      setEditingBlog(prev => ({ ...prev, image_url: dummyUrl }));
      alert("Local Simulation: Image loaded inside browser memory. To upload permanently, connect Supabase!");
    }
  };

  // Order status update
  const handleOrderStatusUpdate = async (orderId, newStatus) => {
    const prevOrder = orders.find((o) => o.id === orderId);
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    if (selectedOrderDetails?.id === orderId) {
      setSelectedOrderDetails({ ...selectedOrderDetails, status: newStatus });
    }

    try {
      const res = await adminFetch('/api/admin/orders/update', {
        method: 'PATCH',
        body: JSON.stringify({
          orderId,
          updates: { status: newStatus },
          activity: {
            type: 'status_change',
            message: `Status changed to ${newStatus}`,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        handleOrderUpdated(data.order);
      }
    } catch (err) {
      console.error('Order status update error:', err);
    }

    if (isSupabaseConfigured && supabase) {
      try {
        if (newStatus === 'Completed' || newStatus === 'Order Complete') {
          const updatedOrder = prevOrder || orders.find(o => o.id === orderId);
          if (updatedOrder && updatedOrder.customer_email) {
            fetch('/api/order-shipped-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...updatedOrder, status: newStatus })
            }).then(res => res.json()).then(data => {
              if (data.success) {
                alert(`Shipping tracking email successfully sent to ${updatedOrder.customer_email}`);
              }
            }).catch(err => console.error('Failed to send shipping email:', err));
          }
        }
      } catch(err) {
        console.error("Order shipped email error:", err);
      }
    }
  };

  // Order sales agent update
  const handleOrderSalesAgentUpdate = async (orderId, agentName) => {
    let finalAgentName = agentName;

    setOrders(orders.map(o => o.id === orderId ? { ...o, sales_agent: finalAgentName } : o));

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('orders')
          .update({ sales_agent: finalAgentName || null })
          .eq('id', orderId);

        if (error) {
          console.error("Supabase order sales agent update error:", error);
        }
      } catch (err) {
        console.error("Order sales agent update error:", err);
      }
    }
  };

  // Order tracking update
  const handleOrderTrackingUpdate = async (orderId, trackingNumber) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, tracking_number: trackingNumber } : o));

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('orders')
          .update({ tracking_number: trackingNumber })
          .eq('id', orderId);
      } catch(err) {
        console.error("Order tracking update error:", err);
      }
    }
  };

  // Delete a single order
  const handleDeleteOrder = async (orderId) => {
    if (!confirm('Delete this order? This cannot be undone.')) return;
    setOrders(prev => prev.filter(o => o.id !== orderId));
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('orders').delete().eq('id', orderId);
      } catch(err) {
        console.error('Order delete error:', err);
      }
    }
  };

  // Delete a single abandoned cart entry
  const handleDeleteCart = async (sessionId) => {
    if (!confirm('Remove this cart entry? This cannot be undone.')) return;
    setAbandonedCarts(prev => prev.filter(c => c.session_id !== sessionId));
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('abandoned_carts').delete().eq('session_id', sessionId);
      } catch(err) {
        console.error('Cart delete error:', err);
      }
    }
  };

  // Send recovery email
  const handleSendRecoveryEmail = async (acart) => {
    setSendingRecoveryEmail(prev => ({ ...prev, [acart.session_id]: true }));
    try {
      const response = await fetch('/api/abandoned-cart-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: acart.session_id,
          customer_name: acart.customer_name,
          customer_email: acart.customer_email,
          cart_data: acart.cart_data,
          lang: acart.lang || 'es',
          currency: acart.currency || 'CRC',
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        alert('Recovery email sent successfully!');
        loadAdminData();
      } else {
        alert('Failed to send recovery email: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send recovery email: ' + err.message);
    } finally {
      setSendingRecoveryEmail(prev => ({ ...prev, [acart.session_id]: false }));
    }
  };

  // Send recovery WhatsApp message
  const handleSendRecoveryWhatsApp = async (acart) => {
    if (!acart.customer_phone) return;
    
    setSendingRecoveryWhatsApp(prev => ({ ...prev, [acart.session_id]: true }));
    try {
      const response = await fetch('/api/abandoned-cart-whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: acart.session_id,
          customer_name: acart.customer_name,
          customer_phone: acart.customer_phone,
          lang: acart.lang || 'es',
        }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        alert('Recovery WhatsApp message sent successfully!');
        loadAdminData();
      } else {
        alert('Failed to send recovery WhatsApp message: ' + (result.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send recovery WhatsApp message: ' + err.message);
    } finally {
      setSendingRecoveryWhatsApp(prev => ({ ...prev, [acart.session_id]: false }));
    }
  };

  const getCartValue = (acart) => {
    if (!acart.cart_data) return 0;
    return acart.cart_data.reduce((acc, item) => {
      const rawPrice = item.priceUsd || item.price_usd || item.price || '0';
      const price = typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^0-9.]/g, '')) : Number(rawPrice);
      return acc + ((price || 0) * (item.qty || 0));
    }, 0);
  };

  const handleExportCartsCSV = (filteredCartsToExport) => {
    if (!filteredCartsToExport || filteredCartsToExport.length === 0) {
      alert('No carts to export.');
      return;
    }
    
    const headers = ['email', 'phone', 'first_name', 'last_name', 'value', 'currency', 'status'];
    
    const rows = filteredCartsToExport.map(c => {
      const nameParts = (c.customer_name || '').split(' ');
      const fn = nameParts[0] || '';
      const ln = nameParts.slice(1).join(' ') || '';
      return [
        c.customer_email || '',
        c.customer_phone || '',
        fn,
        ln,
        getCartValue(c).toFixed(2),
        'USD',
        getCartRecoveryStatus(c) || 'not_contacted'
      ].map(v => `"${v}"`).join(',');
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `abandoned_carts_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bulk Email reminders
  const handleBulkEmail = async () => {
    const cartsToProcess = abandonedCarts.filter(c => selectedCartIds.includes(c.session_id) && c.customer_email);
    if (cartsToProcess.length === 0) {
      alert('None of the selected carts have an email address.');
      return;
    }
    if (!confirm(`Are you sure you want to send recovery emails to ${cartsToProcess.length} customers?`)) return;
    
    setBulkProcessing(true);
    let successCount = 0;
    for (let i = 0; i < cartsToProcess.length; i++) {
      const acart = cartsToProcess[i];
      setBulkProgressText(`Sending email ${i + 1}/${cartsToProcess.length} to ${acart.customer_name || 'Customer'}...`);
      try {
        const response = await fetch('/api/abandoned-cart-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: acart.session_id,
            customer_name: acart.customer_name,
            customer_email: acart.customer_email,
            cart_data: acart.cart_data,
            lang: acart.lang || 'es',
            currency: acart.currency || 'CRC',
          }),
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success) successCount++;
        }
      } catch (err) {
        console.error(err);
      }
      await new Promise(r => setTimeout(r, 400));
    }
    setBulkProcessing(false);
    alert(`✅ Sent ${successCount} recovery emails successfully!`);
    setSelectedCartIds([]);
    loadAdminData();
  };

  // Bulk WhatsApp reminders
  const handleBulkWhatsApp = async () => {
    const cartsToProcess = abandonedCarts.filter(c => selectedCartIds.includes(c.session_id) && c.customer_phone);
    if (cartsToProcess.length === 0) {
      alert('None of the selected carts have a WhatsApp phone number.');
      return;
    }
    if (!confirm(`Are you sure you want to send automated WhatsApp reminders to ${cartsToProcess.length} customers?`)) return;

    setBulkProcessing(true);
    let successCount = 0;
    for (let i = 0; i < cartsToProcess.length; i++) {
      const acart = cartsToProcess[i];
      setBulkProgressText(`Sending WhatsApp ${i + 1}/${cartsToProcess.length} to ${acart.customer_name || 'Customer'}...`);
      try {
        const response = await fetch('/api/abandoned-cart-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: acart.session_id,
            customer_name: acart.customer_name,
            customer_phone: acart.customer_phone,
            lang: acart.lang || 'es',
          }),
        });
        if (response.ok) {
          const result = await response.json();
          if (result.success) successCount++;
        }
      } catch (err) {
        console.error(err);
      }
      await new Promise(r => setTimeout(r, 400));
    }
    setBulkProcessing(false);
    alert(`✅ Sent ${successCount} WhatsApp reminders successfully!`);
    setSelectedCartIds([]);
    loadAdminData();
  };

  // Bulk Delete carts
  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedCartIds.length} selected cart entries? This cannot be undone.`)) return;

    setBulkProcessing(true);
    setBulkProgressText(`Deleting ${selectedCartIds.length} carts...`);
    try {
      setAbandonedCarts(prev => prev.filter(c => !selectedCartIds.includes(c.session_id)));
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from('abandoned_carts')
          .delete()
          .in('session_id', selectedCartIds);
        if (error) throw error;
      }
      alert(`🗑️ Deleted ${selectedCartIds.length} carts successfully!`);
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert(`Failed to delete carts: ${err.message}`);
    } finally {
      setBulkProcessing(false);
      setSelectedCartIds([]);
      loadAdminData();
    }
  };

  // ─── AI INTEGRATION HANDLERS (GEMINI) ───

  // 1. Translate Product Descriptions with AI
  const handleAiTranslate = async (text, direction) => {
    if (!text || text.trim() === '') {
      alert('Please enter some text to translate.');
      return;
    }
    
    setLoadingAiTranslate(true);
    try {
      const sourceLang = direction === 'en-to-es' ? 'en' : 'es';
      const targetLang = direction === 'en-to-es' ? 'es' : 'en';
      
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'translate',
          text,
          sourceLang,
          targetLang
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (direction === 'en-to-es') {
          setEditDescEs(data.text);
        } else {
          setEditDescEn(data.text);
        }
      } else {
        alert('Translation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Translation failed: ' + err.message);
    } finally {
      setLoadingAiTranslate(false);
    }
  };

  // 2. Generate Rich Peptide Details / Info
  const handleAiGenerateDesc = async (peptideName) => {
    if (!peptideName || peptideName.trim() === '') {
      alert('Peptide name is required.');
      return;
    }

    setLoadingAiDesc(true);
    try {
      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate_info',
          text: peptideName
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Try parsing the JSON block from response text
        try {
          const cleanText = data.text.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanText);
          if (parsed.en) setEditDescEn(parsed.en);
          if (parsed.es) setEditDescEs(parsed.es);
        } catch (e) {
          // If not strict JSON, just set the raw output as English description
          setEditDescEn(data.text);
          alert('AI response received, but could not parse EN/ES split. Entire output applied to English.');
        }
      } else {
        alert('Generation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Generation failed: ' + err.message);
    } finally {
      setLoadingAiDesc(false);
    }
  };

  // WhatsApp Template Generator Spanish
  const generateWhatsAppTemplateText = (recipient, templateType, agentName) => {
    if (!recipient) return '';
    
    // Sanitize recipient name
    let cleanName = 'Cliente';
    if (recipient.name && typeof recipient.name === 'string') {
      const trimmed = recipient.name.trim();
      const lower = trimmed.toLowerCase();
      if (trimmed && !['null', 'undefined', 'n/a', 'unknown'].includes(lower)) {
        cleanName = trimmed;
      }
    }

    const agentSig = agentName ? agentName : 'asesor';
    
    // Format cart items
    let itemsStr = 'tus artículos';
    if (recipient.cartItems && recipient.cartItems.length > 0) {
      itemsStr = recipient.cartItems.map(i => `${i.product || i.name || 'Péptido'} (x${i.qty || i.quantity || 1})`).join(', ');
    }

    const recoveryLink = recipient.session_id
      ? `https://catalog.peptidescostarica.net/catalog?recover_session=${encodeURIComponent(recipient.session_id)}${agentName ? `&sales_agent=${encodeURIComponent(agentName)}` : ''}`
      : 'https://catalog.peptidescostarica.net/catalog';

    // 1. Check if recovering abandoned cart
    if (recipient.cartItems) {
      switch (templateType) {
        case 'purity':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷 

Te contacto porque notamos tu interés en ${itemsStr}. Quería recordarte que todos nuestros péptidos cuentan con pureza certificada de laboratorio ≥98% HPLC para garantizar la máxima seguridad en tu investigación.

Realizamos envíos rápidos a todo el país vía Correos de CR y coordinamos pagos seguros vía SINPE Móvil o tarjeta. ¿Te gustaría que te ayude a coordinar tu envío hoy?`;

        case 'discount':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Queremos apoyarte en tus metas de salud y rendimiento. Por eso, si completas tu orden de ${itemsStr} hoy, puedes aplicar un 10% de descuento adicional utilizando el cupón especial COSTA10.

Puedes recuperar tu carrito y aplicar tu cupón directamente ingresando aquí:
👉 ${recoveryLink}

Avísame si deseas que agilice tu orden directamente por este chat. ¡Quedo a tu total disposición!`;

        case 'dosing':
          return `¡Hola ${cleanName}! Te habla ${agentSig} de Peptides Costa Rica. 🇨🇷

Vimos que estabas consultando por ${itemsStr}. Al adquirir péptidos en polvo, sabemos que la matemática de la reconstitución con agua bacteriostática y la dosificación correcta con jeringas de insulina puede ser confusa.

Te ofrezco asesoría gratuita y directa sobre cómo prepararlos y administrarlos de forma segura. ¿Tienes alguna pregunta o te gustaría que preparemos tu envío hoy?`;

        case 'standard':
        default:
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Notamos que dejaste algunos artículos en tu carrito (${itemsStr}). Quería ponerme a tu entera disposición por si tienes alguna consulta sobre la calidad del laboratorio, las formas de pago en Costa Rica, o si gustas que te coordine la entrega vía Correos de CR.

Puedes finalizar tu orden de forma segura en este link:
👉 ${recoveryLink}

¡Quedo atento a tus mensajes!`;
      }
    } 
    // 2. Order follow up
    else if (recipient.orderNumber) {
      switch (templateType) {
        case 'payment':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Recibimos tu orden #${recipient.orderNumber} por ${itemsStr}. Quería verificar si tuviste algún inconveniente al realizar tu pago SINPE Móvil o con Tarjeta.

Quedamos atentos a la confirmación o comprobante de pago por este medio para procesar y despachar tus productos de inmediato. ¡Muchas gracias!`;

        case 'purity':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Muchas gracias por tu compra de ${itemsStr} (Orden #${recipient.orderNumber}). Quería compartirte de forma directa nuestra guía digital de reconstitución, almacenamiento y uso seguro para que comiences tu protocolo de la mejor manera.

¿Hay algo más en lo que te pueda asesorar o apoyar en este momento? ¡Un gusto atenderte!`;

        case 'discount':
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Te escribo para confirmarte que estamos preparando tu orden #${recipient.orderNumber} conteniendo ${itemsStr}. En las próximas horas te estaremos compartiendo el número de guía de Correos de Costa Rica para que puedas rastrear tu paquete.

¡Muchas gracias por tu confianza en nosotros para tu investigación!`;

        case 'standard':
        default:
          return `¡Hola ${cleanName}! Te saluda ${agentSig} de Peptides Costa Rica. 🇨🇷

Te contacto respecto a tu orden #${recipient.orderNumber} de ${itemsStr}. Queríamos verificar si todo marcha bien y si tienes alguna duda respecto al envío, las instrucciones de almacenamiento de los viales, o la dosificación.

¡Quedo a tus órdenes para lo que necesites!`;
      }
    }

    return `Hola ${cleanName}, te saluda ${agentSig} de Peptides Costa Rica. ¿Cómo te podemos ayudar hoy?`;
  };

  // 3. Open Custom WhatsApp Composer Modal
  const openWhatsAppComposer = (recipient, defaultTemplate = 'standard') => {
    setWaRecipient(recipient);
    
    // Default Dynamic templates states
    setWaSelectedTemplate(defaultTemplate);
    
    let defaultAgent = '';
    if (agents && agents.length > 0) {
      const firstAgent = agents[0];
      if (firstAgent && !firstAgent.includes('@')) {
        defaultAgent = firstAgent;
      }
    }
    setWaSelectedAgent(defaultAgent);

    // Initial message based on template and default agent signature
    const initialMsg = generateWhatsAppTemplateText(recipient, defaultTemplate, defaultAgent);
    setWaMessageText(initialMsg);
    
    setWaModalOpen(true);
  };

  // 4. Draft Personalized WhatsApp message using AI
  const handleDraftWaMessage = async () => {
    if (!waRecipient) return;
    
    setWaDrafting(true);
    try {
      let prompt = `Write a friendly, professional, highly persuasive e-commerce customer support/sales message for a customer named "${waRecipient.name}" who `;
      if (waRecipient.orderNumber) {
        prompt += `placed an order (Order Ref: ${waRecipient.orderNumber}) containing: ${waRecipient.cartItems ? waRecipient.cartItems.map(i => `${i.product} (x${i.qty})`).join(', ') : 'peptides'}. Write a status check-in, coordinating delivery details in a warm, polite tone.`;
      } else if (waRecipient.cartItems) {
        prompt += `has an active abandoned cart containing: ${waRecipient.cartItems.map(i => `${i.product} (x${i.qty || i.quantity})`).join(', ')}. Politely remind them that we saved their items, offer support, and include a brief call to action.`;
      } else {
        prompt += `is in our CRM database. Highlight our premium lab-tested peptides, fast local shipping in Costa Rica, and invite them to ask any questions.`;
      }
      
      prompt += ` Keep it brief, conversational, and split with natural line breaks. Write the message in Spanish, as that is our primary language. Do not include subject lines, greetings placeholders, or quotes. Just give the exact chat body ready to send.`;

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setWaMessageText(data.text.trim());
      } else {
        alert('Failed to draft AI message: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to draft AI message: ' + err.message);
    } finally {
      setWaDrafting(false);
    }
  };

  // 5. Send Automated Outbound WhatsApp Message
  const handleSendWaMessage = async () => {
    if (!waRecipient || !waMessageText.trim()) return;

    setWaSending(true);
    try {
      const res = await adminFetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: waRecipient.phone,
          message: waMessageText,
          customerName: waRecipient.name,
          orderId: waRecipient.orderDbId,
          sessionId: waRecipient.session_id
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ WhatsApp message sent automatically from your business number!');
        setWaModalOpen(false);
        setWaRecipient(null);
        setWaMessageText('');
        loadAdminData(); // Refresh to log into outbound history
      } else {
        alert('❌ Failed to send WhatsApp automatically: ' + (data.error || 'Unknown error') + '\n\nYou can still use the "Open in Personal WhatsApp" fallback link below.');
      }
    } catch (err) {
      console.error(err);
      alert('❌ Failed to send WhatsApp: ' + err.message);
    } finally {
      setWaSending(false);
    }
  };

  // 6. AI Copilot Chat Handler
  const handleSendAiChatMessage = async () => {
    if (!aiInputText.trim()) return;

    const userMessage = { role: 'user', text: aiInputText };
    setAiChatMessages(prev => [...prev, userMessage]);
    const promptToSend = aiInputText;
    setAiInputText('');
    setAiLoading(true);

    try {
      // Generate Lead attribution counts
      const leadAttributions = {};
      leads.forEach(l => {
        const src = l.utm_source || l.source || 'Organic/Direct';
        leadAttributions[src] = (leadAttributions[src] || 0) + 1;
      });

      // Generate Carts item counts & active vs completed
      const cartItemsCount = {};
      const activeCarts = abandonedCarts.filter(c => c.status === 'active' || !c.status);
      activeCarts.forEach(c => {
        if (Array.isArray(c.cart_data)) {
          c.cart_data.forEach(item => {
            const pName = item.product || 'Unknown Product';
            cartItemsCount[pName] = (cartItemsCount[pName] || 0) + (item.qty || 1);
          });
        }
      });

      const context = {
        products: products.map(p => ({
          product: p.product,
          category: p.category,
          priceUsd: p.price_usd || p.priceUsd,
          priceCrc: p.price_crc || p.priceCrc
        })),
        stats: {
          totalOrders: orders.length,
          abandonedCartsCount: abandonedCarts.length,
          activeCartsCount: activeCarts.length,
          leadsCount: leads.length,
          leadAttributions,
          cartItemsCount
        }
      };

      const res = await adminFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          prompt: promptToSend,
          context
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAiChatMessages(prev => [...prev, { role: 'assistant', text: data.text }]);
      } else {
        setAiChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Error de Copiloto: ${data.error || 'No se pudo obtener respuesta.'}` }]);
      }
    } catch (err) {
      console.error(err);
      setAiChatMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Error de conexión: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Clear ALL active abandoned carts
  const handleClearAllCarts = async () => {
    if (!confirm('Clear ALL active cart data? This cannot be undone.')) return;
    setAbandonedCarts([]);
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('abandoned_carts').delete().eq('status', 'active');
      } catch(err) {
        console.error('Clear carts error:', err);
      }
    }
  };

  // Centralized Export Handler
  const handleExport = (format) => {
    setExportLoading(true);
    setTimeout(() => {
      try {
        let headers = [];
        let dataRows = [];
        let filename = `peptidescr-export-${new Date().toISOString().slice(0, 10)}`;
        let title = 'Export';

        if (exportModalType === 'orders') {
          headers = [ 'Order ID', 'Order Number', 'Date', 'Customer Name', 'ID Number', 'ID Type', 'Phone', 'Shipping Address', 'Status', 'Payment Method', 'Items', 'Total (CRC)', 'Total (USD)' ];
          dataRows = orders.map(order => {
             const items = Array.isArray(order.items) ? order.items : [];
             const itemsSummary = items.map(i => `${i.product} x${i.qty}`).join(' | ');
             const orderDate = new Date(order.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
             return [ order.id, order.order_number || 'N/A', orderDate, order.customer_name || 'N/A', order.customer_id_number || '', formatCustomerIdType(order.customer_id_type) || '', order.customer_phone || '', order.shipping_address || 'N/A', order.status || 'Pending', order.payment_method || 'whatsapp', itemsSummary, order.total_crc || '', order.total_usd || '' ];
          });
          filename = `peptidescr-orders-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Orders Export';
        } else if (exportModalType === 'products') {
          headers = [ 'Product Name', 'Category', 'Price (USD)', 'Price (CRC)', 'Status', 'Bulk Discount' ];
          dataRows = products.map(p => [ p.product, p.category, p.priceUsd, p.priceCrc, p.status, p.discount ]);
          filename = `peptidescr-products-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Products Export';
        } else if (exportModalType === 'carts') {
          headers = [ 
            'Session ID', 'Date', 'Customer Name', 'Phone', 'Email', 'Cart Items', 'Status',
            'Recovery Email Sent', 'Recovery Email Sent At', 
            'Recovery WhatsApp Sent', 'Recovery WhatsApp Sent At' 
          ];
          dataRows = abandonedCarts.map(c => {
             const itemsSummary = c.cart_data ? c.cart_data.map(i => `${i.product} x${i.qty}`).join(' | ') : '';
             const date = new Date(c.last_updated).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
             const emailSentAt = c.recovery_email_sent_at ? new Date(c.recovery_email_sent_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }) : '';
             const waSentAt = c.recovery_whatsapp_sent_at ? new Date(c.recovery_whatsapp_sent_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }) : '';
             return [ 
               c.session_id, date, c.customer_name || '', c.customer_phone || '', c.customer_email || '', itemsSummary, c.status,
               c.recovery_email_sent ? 'Yes' : 'No', emailSentAt,
               c.recovery_whatsapp_sent ? 'Yes' : 'No', waSentAt
             ];
          });
          filename = `peptidescr-carts-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Abandoned Carts Export';
        } else if (exportModalType === 'leads') {
          headers = [ 'Lead ID', 'Date Captured', 'Method', 'Contact Info', 'IP Address', 'City', 'Region', 'Country', 'Referrer', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Language' ];
          dataRows = leads.map(l => [
            l.id,
            new Date(l.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }),
            l.contact_method,
            l.contact_value,
            l.ip_address || '',
            l.city || '',
            l.region || '',
            l.country || '',
            l.referrer || '',
            l.utm_source || '',
            l.utm_medium || '',
            l.utm_campaign || '',
            l.language
          ]);
          filename = `peptidescr-leads-${new Date().toISOString().slice(0, 10)}`;
          title = 'Costa Rica Peptides - Catalog Leads Export';
        }

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
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
          XLSX.writeFile(workbook, `${filename}.xlsx`);
        } else if (format === 'pdf') {
          const doc = new jsPDF('landscape');
          doc.setFontSize(16);
          doc.text(title, 14, 15);
          doc.setFontSize(10);
          doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
          doc.autoTable({
            head: [headers],
            body: dataRows,
            startY: 28,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [14, 22, 38], textColor: 255 },
            alternateRowStyles: { fillColor: [240, 240, 240] }
          });
          doc.save(`${filename}.pdf`);
        }
      } finally {
        setExportLoading(false);
        setExportModalType(null);
      }
    }, 500);
  };

  // Leads Actions
  const handleLeadUpdate = async (id) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, contact_value: editLeadValue, contact_method: editLeadMethod } : l));
    setEditingLeadId(null);

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('catalog_leads')
          .update({ contact_value: editLeadValue, contact_method: editLeadMethod })
          .eq('id', id);
      } catch (err) {
        console.error("Failed to update lead:", err);
      }
    }
  };
  
  const handleLeadDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    
    setLeads(prev => prev.filter(l => l.id !== id));
    
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('catalog_leads')
          .delete()
          .eq('id', id);
      } catch (err) {
        console.error("Failed to delete lead:", err);
      }
    }
  };

  const handleSelectLead = (id, checked, shiftKey, index) => {
    if (shiftKey && lastSelectedLeadIndex !== null) {
      const start = Math.min(lastSelectedLeadIndex, index);
      const end = Math.max(lastSelectedLeadIndex, index);
      const idsInRange = paginatedLeads.slice(start, end + 1).map(l => l.id);
      
      setSelectedLeads(prev => {
        if (checked) {
          const newSelection = new Set([...prev, ...idsInRange]);
          return Array.from(newSelection);
        } else {
          return prev.filter(leadId => !idsInRange.includes(leadId));
        }
      });
    } else {
      setSelectedLeads(prev =>
        checked ? [...prev, id] : prev.filter(leadId => leadId !== id)
      );
    }
    setLastSelectedLeadIndex(index);
  };

  const handleSelectCart = (id, checked, shiftKey, index) => {
    if (shiftKey && lastSelectedCartIndex !== null) {
      const start = Math.min(lastSelectedCartIndex, index);
      const end = Math.max(lastSelectedCartIndex, index);
      const idsInRange = abandonedCarts.slice(start, end + 1).map(c => c.session_id);
      
      setSelectedCartIds(prev => {
        if (checked) {
          const newSelection = new Set([...prev, ...idsInRange]);
          return Array.from(newSelection);
        } else {
          return prev.filter(cartId => !idsInRange.includes(cartId));
        }
      });
    } else {
      setSelectedCartIds(prev =>
        checked ? [...prev, id] : prev.filter(cartId => cartId !== id)
      );
    }
    setLastSelectedCartIndex(index);
  };

  useEffect(() => {
    setLastSelectedLeadIndex(null);
  }, [leadsCurrentPage, leadsSearch, leadsSourceFilter, leadsAreaFilter]);

  useEffect(() => {
    setLastSelectedCartIndex(null);
  }, [abandonedCarts]);

  const filteredLeads = leads.filter(lead => {
    // 1. Search Query
    if (leadsSearch.trim() !== '') {
      const q = leadsSearch.toLowerCase();
      const contactVal = (lead.contact_value || '').toLowerCase();
      const cityVal = (lead.city || '').toLowerCase();
      const regionVal = (lead.region || '').toLowerCase();
      const countryVal = (lead.country || '').toLowerCase();
      const campaignVal = (lead.utm_campaign || '').toLowerCase();
      const mediumVal = (lead.utm_medium || '').toLowerCase();
      const sourceVal = (lead.utm_source || '').toLowerCase();
      
      const match = contactVal.includes(q) || 
                    cityVal.includes(q) || 
                    regionVal.includes(q) || 
                    countryVal.includes(q) ||
                    campaignVal.includes(q) ||
                    mediumVal.includes(q) ||
                    sourceVal.includes(q);
      if (!match) return false;
    }

    // 2. Source Filter
    if (leadsSourceFilter !== 'All') {
      if (leadsSourceFilter === 'Direct') {
        if (lead.utm_source) return false;
      } else if (leadsSourceFilter === 'Ads') {
        if (!lead.utm_source) return false;
      } else {
        if ((lead.utm_source || '').toLowerCase() !== leadsSourceFilter.toLowerCase()) return false;
      }
    }

    // 3. Area Filter
    if (leadsAreaFilter !== 'All') {
      const leadArea = lead.region || lead.city || 'Unknown';
      if (leadArea !== leadsAreaFilter) return false;
    }

    return true;
  });

  const paginatedLeads = filteredLeads.slice(
    (leadsCurrentPage - 1) * leadsPerPage,
    leadsCurrentPage * leadsPerPage
  );

  const handleSelectAllLeads = (checked) => {
    setSelectedLeads(checked ? paginatedLeads.map(l => l.id) : []);
  };

  const handleBulkDeleteLeads = async () => {
    if (selectedLeads.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedLeads.length} leads?`)) return;

    setLeads(prev => prev.filter(l => !selectedLeads.includes(l.id)));
    
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('catalog_leads')
          .delete()
          .in('id', selectedLeads);
      } catch (err) {
        console.error("Failed to bulk delete leads:", err);
      }
    }
    setSelectedLeads([]);
  };

  // Save changes batch
  const handleSaveChanges = async () => {
    setSaveLoading(true);
    setSaveStatus('');

    if (!isDbConnected) {
      setSaveStatus("❌ Cannot save: Database is offline or in local fallback mode. Verify database connection before saving.");
      setSaveLoading(false);
      setTimeout(() => setSaveStatus(''), 5000);
      return;
    }

    // Auto-fill missing CRC prices from USD before saving
    const filled = products.map(p => {
      let newP = { ...p };
      if (newP.priceUsd && (!newP.priceCrc || newP.priceCrc.trim() === '')) {
        const usdNum = parseFloat(String(newP.priceUsd).replace(/[^0-9.]/g, '')) || 0;
        if (usdNum > 0) {
          newP.priceCrc = `₡${Math.round(usdNum * exchangeRate).toLocaleString('en-US')}`;
        }
      }
      if (newP.originalPriceUsd && (!newP.originalPriceCrc || newP.originalPriceCrc.trim() === '')) {
        const origUsdNum = parseFloat(String(newP.originalPriceUsd).replace(/[^0-9.]/g, '')) || 0;
        if (origUsdNum > 0) {
          newP.originalPriceCrc = `₡${Math.round(origUsdNum * exchangeRate).toLocaleString('en-US')}`;
        }
      }
      return newP;
    });
    // Update state so the UI reflects the auto-filled values
    setProducts(filled);

    if (isSupabaseConfigured && supabase) {
      try {
        // Get all currently existing database UUIDs from the active list
        const activeIds = filled
          .map(p => p.id)
          .filter(id => id && !id.toString().startsWith('temp-') && !id.toString().startsWith('local-'));

        // 1. Delete products that were removed in the editor
        let deleteQuery = supabase.from('products').delete();
        if (activeIds.length > 0) {
          deleteQuery = deleteQuery.not('id', 'in', `(${activeIds.join(',')})`);
        } else {
          // If no products remain, delete all safely
          deleteQuery = deleteQuery.neq('id', '00000000-0000-0000-0000-000000000000');
        }
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;

        // 2. Format row fields
        const itemsToUpdate = [];
        const itemsToInsert = [];

        filled.forEach((p, idx) => {
          const row = {
            product: p.product,
            category: p.category,
            price_usd: p.priceUsd,
            price_crc: p.priceCrc,
            original_price_usd: p.originalPriceUsd || null,
            original_price_crc: p.originalPriceCrc || null,
            discount: p.discount || null,
            sale_start_time: p.saleStartTime ? new Date(p.saleStartTime).toISOString() : null,
            sale_end_time: p.saleEndTime ? new Date(p.saleEndTime).toISOString() : null,
            status: p.status,
            inventory_count: p.inventoryCount === '' ? null : p.inventoryCount,
            low_stock_threshold: p.lowStockThreshold === '' ? 5 : p.lowStockThreshold,
            coa: p.coa,
            image_url: p.imageUrl,
            description_en: p.descriptionEn || '',
            description_es: p.descriptionEs || '',
            emoji: p.imageUrl ? '' : getEmojiForCategory(p.category),
            priority: idx
          };
          if (p.id && !p.id.toString().startsWith('temp-') && !p.id.toString().startsWith('local-')) {
            row.id = p.id;
            itemsToUpdate.push(row);
          } else {
            itemsToInsert.push(row);
          }
        });

        // 3. Batch upsert existing records
        if (itemsToUpdate.length > 0) {
          const { error: upsertError } = await supabase
            .from('products')
            .upsert(itemsToUpdate);
          if (upsertError) throw upsertError;
        }

        // 4. Batch insert new records
        if (itemsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('products')
            .insert(itemsToInsert);
          if (insertError) throw insertError;
        }

        setSaveStatus("Changes successfully saved to database!");
        loadAdminData(); // reload fresh rows
      } catch (err) {
        console.error("Database save changes error:", err);
        setSaveStatus(`Failed to save: ${err.message || 'Row Level Security error'}`);
      }
    } else {
      setSaveStatus("Local Simulation: Saved products data state inside browser memory!");
    }

    setSaveLoading(false);
    setTimeout(() => setSaveStatus(''), 4000);
  };

  const getEmojiForCategory = (cat) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('weight') || c.includes('peso')) return '⚖️';
    if (c.includes('sleep') || c.includes('sueño')) return '🌙';
    if (c.includes('sexual')) return '🔥';
    if (c.includes('skin') || c.includes('piel')) return '✨';
    if (c.includes('immune') || c.includes('inmune')) return '🛡️';
    if (c.includes('supply') || c.includes('suministro')) return '💧';
    if (c.includes('brain') || c.includes('cerebro')) return '🧠';
    if (c.includes('muscle') || c.includes('músculo')) return '💪';
    return '🧪';
  };

  const handleApproveReview = async (id) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('product_reviews').update({ status: 'Approved' }).eq('id', id);
      if (!error) {
        setReviews(reviews.map(r => r.id === id ? { ...r, status: 'Approved' } : r));
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteReview = async (id) => {
    if (!supabase) return;
    if (!confirm('Are you sure you want to delete this review?')) return;
    try {
      const { error } = await supabase.from('product_reviews').delete().eq('id', id);
      if (!error) {
        setReviews(reviews.filter(r => r.id !== id));
      }
    } catch (err) { console.error(err); }
  };

  const handleMarkNotificationRead = async (id) => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase
        .from('facebook_notifications')
        .update({ status: 'read' })
        .eq('id', id);
      if (error) throw error;
      setFacebookNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n));
    } catch (err) {
      console.error("Failed to update notification status:", err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase
        .from('facebook_notifications')
        .update({ status: 'read' })
        .eq('status', 'unread');
      if (error) throw error;
      setFacebookNotifications(prev => prev.map(n => ({ ...n, status: 'read' })));
    } catch (err) {
      console.error("Failed to mark all notifications read:", err);
    }
  };

  const handleDeleteNotification = async (id) => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!confirm('Are you sure you want to delete this notification?')) return;
    try {
      const { error } = await supabase
        .from('facebook_notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setFacebookNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  // Science/peptide themed icon for visual rendering (no pills!)
  const getCategoryIcon = (cat, size = 20) => {
    const c = (cat || '').toLowerCase();
    const props = { size, className: 'category-icon', strokeWidth: 1.8 };
    if (c.includes('weight') || c.includes('peso') || c.includes('metaboli')) return <Atom {...props} />;
    if (c.includes('exercise') || c.includes('mimetic')) return <Zap {...props} />;
    if (c.includes('recovery') || c.includes('healing') || c.includes('recuper')) return <Dna {...props} />;
    if (c.includes('anti-inflam') || c.includes('antiinflam')) return <Shield {...props} />;
    if (c.includes('performance') || c.includes('hormon') || c.includes('rendimiento')) return <Syringe {...props} />;
    if (c.includes('aging') || c.includes('longevity') || c.includes('envejecimiento')) return <TestTubes {...props} />;
    if (c.includes('immune') || c.includes('inmune') || c.includes('antioxidant')) return <Microscope {...props} />;
    if (c.includes('cognitive') || c.includes('mood') || c.includes('cognitivo')) return <Brain {...props} />;
    if (c.includes('sleep') || c.includes('dormir') || c.includes('sueño')) return <Moon {...props} />;
    if (c.includes('sexual') || c.includes('tanning') || c.includes('bronceado')) return <Flame {...props} />;
    if (c.includes('skin') || c.includes('hair') || c.includes('piel') || c.includes('cabello')) return <Sparkles {...props} />;
    if (c.includes('supply') || c.includes('suministro') || c.includes('reconstitution')) return <FlaskConical {...props} />;
    return <FlaskConical {...props} />;
  };

  // Copy shareable link
  const getShareUrl = () => {
    const domain = typeof window !== 'undefined' ? window.location.origin : 'https://costapeptides.vercel.app';
    let url = `${domain}/catalog?lang=${shareLang}&currency=${shareCurrency}`;
    if (shareProduct !== 'all') {
      url += `&product=${encodeURIComponent(shareProduct)}`;
    }
    if (shareSource !== 'none') {
      url += `&utm_source=${shareSource}`;
    }
    if (shareMedium.trim() !== '') {
      url += `&utm_medium=${encodeURIComponent(shareMedium.trim())}`;
    }
    if (shareCampaign.trim() !== '') {
      url += `&utm_campaign=${encodeURIComponent(shareCampaign.trim())}`;
    }
    return url;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareUrl());
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  // CMS Handlers
  const handleSaveBusinessLinks = async () => {
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('site_settings').upsert({
          id: 'business_links',
          value: businessLinks
        });
        if (!error) {
          setCmsSaveStatus('success:Business links saved successfully.');
          return;
        }
        throw error;
      }
    } catch (err) {
      console.error("Failed to save business links:", err);
      setCmsSaveStatus(`error:Failed to save business links (${err.message})`);
    } finally {
      setCmsSaveLoading(false);
    }
  };

  const handleSaveSiteSettings = async () => {
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('site_settings').upsert({
          id: 'landing_page',
          value: siteSettings
        });
        if (error) throw error;
        setCmsSaveStatus('success:Settings saved successfully.');
      } catch (err) {
        console.error("Failed to save settings:", err);
        setCmsSaveStatus(`error:Failed to save settings (${err.message})`);
      }
    }
    setCmsSaveLoading(false);
    setTimeout(() => setCmsSaveStatus(''), 3000);
  };

  const handleSaveBlog = async (e) => {
    e.preventDefault();
    setCmsSaveLoading(true);
    setCmsSaveStatus('');
    if (isSupabaseConfigured && supabase) {
      try {
        const isNew = !editingBlog.id;
        const payload = {
          slug: editingBlog.slug,
          title_en: editingBlog.title_en,
          title_es: editingBlog.title_es,
          excerpt_en: editingBlog.excerpt_en,
          excerpt_es: editingBlog.excerpt_es,
          content_en: editingBlog.content_en,
          content_es: editingBlog.content_es,
          image_url: editingBlog.image_url,
          published: editingBlog.published
        };
        
        let error;
        if (isNew) {
          const res = await supabase.from('blogs').insert(payload).select();
          error = res.error;
          if (!error && res.data) setBlogs([res.data[0], ...blogs]);
        } else {
          const res = await supabase.from('blogs').update(payload).eq('id', editingBlog.id).select();
          error = res.error;
          if (!error && res.data) setBlogs(blogs.map(b => b.id === editingBlog.id ? res.data[0] : b));
        }
        
        if (error) throw error;
        setCmsSaveStatus('success:Blog post saved successfully.');
        setEditingBlog(null);
      } catch (err) {
        console.error("Failed to save blog:", err);
        setCmsSaveStatus(`error:Failed to save blog (${err.message})`);
      }
    }
    setCmsSaveLoading(false);
    setTimeout(() => setCmsSaveStatus(''), 3000);
  };

  const handleDeleteBlog = async (id) => {
    if (!confirm('Are you sure you want to delete this blog post?')) return;
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('blogs').delete().eq('id', id);
        setBlogs(blogs.filter(b => b.id !== id));
      } catch (err) {
        console.error("Failed to delete blog:", err);
      }
    }
  };

  // Prevent hydration mismatch by skipping SSR for admin portal entirely
  if (!mounted) return null;

  // Render Login Card if not logged in
  if (!isAuthenticated) {
    return (
      <div className="admin-layout" suppressHydrationWarning>
        <div className="admin-login-container">
          <div className="admin-login-card">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <img src="/logo.png" alt="Peptides Costa Rica Admin" style={{ maxHeight: '60px', width: 'auto', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 2px 16px rgba(0,0,0,0.25)' }} />
            </div>
            <p>Admin Security Dashboard</p>
            
            {loginError && <div className="error-msg">{loginError}</div>}
            
            <form onSubmit={handleLogin}>
              <input 
                type="email" 
                placeholder="Admin Email Address" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input 
                type="password" 
                placeholder="Access Password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" disabled={loginLoading}>
                {loginLoading ? (
                  <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                ) : (
                  'Authenticate Access'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="admin-layout" suppressHydrationWarning>
        <div className="admin-login-container">
          <div className="sync-spinner" style={{ width: '32px', height: '32px', marginBottom: '16px' }}></div>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading admin permissions...</p>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured && !adminProfile) {
    return (
      <div className="admin-layout" suppressHydrationWarning>
        <div className="admin-login-container">
          <div className="admin-login-card">
            <p>Access Denied</p>
            <div className="error-msg">Your account is not authorized for the admin dashboard.</div>
            <button type="button" onClick={handleLogout} style={{ marginTop: '16px' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout min-h-screen" suppressHydrationWarning>
      {/* Toast Alert Notification */}
      {toastMessage && (
        <div className="admin-toast" role="status" aria-live="polite">
          <Bell className="animate-bounce" size={20} />
          <span>{toastMessage}</span>
          <button type="button" className="admin-toast-close" onClick={() => setToastMessage('')} aria-label="Dismiss notification">
            <X size={18} />
          </button>
        </div>
      )}
      {/* Navbar Header */}
      <nav className="admin-navbar">
        <div className="admin-nav-top-row">
          <div className="admin-nav-logo-container">
            <img src="/logo.png" alt="Peptides Costa Rica Admin Logo" className="admin-logo-img" />
            <div className="db-status-indicator">
              <span className={`status-dot ${isDbConnected ? 'connected' : 'simulation'}`}></span>
              <span className="status-text">{isDbConnected ? 'Live Connection' : 'Simulation Mode'}</span>
            </div>
          </div>
          <div className="admin-nav-tools">
            <button type="button" className="admin-search-trigger" onClick={() => setGlobalSearchOpen(true)}>
              <Search size={14} />
              <span className="admin-search-label">Search</span>
              <kbd>⌘K</kbd>
            </button>
            <NotificationCenter
              onNavigate={navigateToTab}
              refreshKey={notifRefreshKey}
              adminUserId={adminProfile?.user_id}
            />
          </div>
        </div>

        <div className="admin-nav-scroll-wrap">
        <div className="admin-nav-sections">
          <div className="admin-nav-section">
            <div className="admin-nav-section-title">Overview</div>
            <div className="admin-nav-section-items">
              {hasAccess('home') && (
                <button
                  className={`admin-tab-btn ${activeTab === 'home' ? 'active' : ''}`}
                  onClick={() => navigateToTab('home')}
                >
                  <LayoutDashboard size={14} />
                  <span className="tab-label">{isStaffAgent ? 'My Pay' : 'Today'}</span>
                </button>
              )}
            </div>
          </div>

          {['spreadsheet','orders','customers','inquiries','leads'].some(hasAccess) && (
          <div className="admin-nav-section">
            <div className="admin-nav-section-title">Core Operations</div>
            <div className="admin-nav-section-items">
              {hasAccess('spreadsheet') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'spreadsheet' ? 'active' : ''}`}
                  onClick={() => navigateToTab('spreadsheet')}
                >
                  <Table size={14} />
                  <span className="tab-label">Products</span>
                </button>
              )}
              {hasAccess('orders') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
                  onClick={() => navigateToTab('orders')}
                >
                  <ClipboardList size={14} />
                  <span className="tab-label">Orders</span>
                  {visibleOrders.filter(o => (o.status || 'Pending') === 'Pending').length > 0 && (
                    <span className="tab-count badge-danger">
                      {visibleOrders.filter(o => (o.status || 'Pending') === 'Pending').length}
                    </span>
                  )}
                </button>
              )}
              {hasAccess('customers') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
                  onClick={() => navigateToTab('customers')}
                >
                  <Users size={14} />
                  <span className="tab-label">Customers</span>
                </button>
              )}
              {hasAccess('inquiries') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'inquiries' ? 'active' : ''}`}
                  onClick={() => navigateToTab('inquiries')}
                >
                  <Inbox size={14} />
                  <span className="tab-label">Inquiries</span>
                  {inquiryCount > 0 && <span className="admin-more-tab-badge">{inquiryCount}</span>}
                </button>
              )}
              {hasAccess('leads') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'leads' ? 'active' : ''}`}
                  onClick={() => navigateToTab('leads')}
                >
                  <Target size={14} />
                  <span className="tab-label">Leads</span>
                  {leads.length > 0 && (
                    <span className="tab-count badge-success">
                      {leads.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
          )}

          {['carts','share','reviews','facebook','marketing','affiliates','broadcasts'].some(hasAccess) && (
          <div className="admin-nav-section">
            <div className="admin-nav-section-title">Sales & Marketing</div>
            <div className="admin-nav-section-items">
              {hasAccess('carts') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'carts' ? 'active' : ''}`}
                  onClick={() => navigateToTab('carts')}
                >
                  <ShoppingCart size={14} />
                  <span className="tab-label">Carts</span>
                  {abandonedCarts.length > 0 && (
                    <span className="tab-count badge-warning">
                      {abandonedCarts.length}
                    </span>
                  )}
                </button>
              )}
              {hasAccess('share') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'share' ? 'active' : ''}`}
                  onClick={() => navigateToTab('share')}
                >
                  <Link2 size={14} />
                  <span className="tab-label">Share</span>
                </button>
              )}
              {hasAccess('reviews') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
                  onClick={() => navigateToTab('reviews')}
                >
                  <Star size={14} />
                  <span className="tab-label">Reviews</span>
                  {reviews.filter(r => r.status === 'Pending').length > 0 && (
                    <span className="tab-count badge-info">
                      {reviews.filter(r => r.status === 'Pending').length}
                    </span>
                  )}
                </button>
              )}
              {hasAccess('facebook') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'facebook' ? 'active' : ''}`}
                  onClick={() => navigateToTab('facebook')}
                >
                  <FacebookIcon size={14} style={{ color: activeTab === 'facebook' ? 'inherit' : '#1877f2' }} />
                  <span className="tab-label">Facebook</span>
                  {facebookNotifications.filter(n => n.status === 'unread').length > 0 && (
                    <span className="tab-count badge-info">
                      {facebookNotifications.filter(n => n.status === 'unread').length}
                    </span>
                  )}
                </button>
              )}
              {hasAccess('marketing') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'marketing' ? 'active' : ''}`}
                  onClick={() => navigateToTab('marketing')}
                >
                  <Mail size={14} />
                  <span className="tab-label">Marketing Studio</span>
                </button>
              )}
              {hasAccess('affiliates') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'affiliates' ? 'active' : ''}`}
                  onClick={() => navigateToTab('affiliates')}
                >
                  <UserPlus size={14} />
                  <span className="tab-label">Affiliates and Promotions</span>
                </button>
              )}
              {hasAccess('broadcasts') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'broadcasts' ? 'active' : ''}`}
                  onClick={() => navigateToTab('broadcasts')}
                >
                  <Megaphone size={14} />
                  <span className="tab-label">Broadcasts</span>
                </button>
              )}
            </div>
          </div>
          )}

          {['analytics','cms'].some(hasAccess) && (
          <div className="admin-nav-section">
            <div className="admin-nav-section-title">Analytics & Content</div>
            <div className="admin-nav-section-items">
              {hasAccess('analytics') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                  onClick={() => navigateToTab('analytics')}
                >
                  <BarChart2 size={14} />
                  <span className="tab-label">Analytics</span>
                </button>
              )}
              {hasAccess('cms') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'cms' ? 'active' : ''}`}
                  onClick={() => navigateToTab('cms')}
                >
                  <FileText size={14} />
                  <span className="tab-label">Content (CMS)</span>
                </button>
              )}
            </div>
          </div>
          )}

          {(['whatsapp_ai','wa_session','team_chat'].some(hasAccess) || adminProfile?.is_superadmin) && (
          <div className="admin-nav-section">
            <div className="admin-nav-section-title">System & AI</div>
            <div className="admin-nav-section-items">
              {hasAccess('whatsapp_ai') && (
              <button 
                className={`admin-tab-btn ${activeTab === 'whatsapp_ai' ? 'active' : ''}`}
                onClick={() => navigateToTab('whatsapp_ai')}
              >
                <MessageSquare size={14} style={{ color: activeTab === 'whatsapp_ai' ? 'inherit' : '#10b981' }} />
                <span className="tab-label" style={{ color: activeTab === 'whatsapp_ai' ? 'inherit' : '#10b981', fontWeight: 'bold' }}>Sales WhatsApp</span>
              </button>
              )}
              {hasAccess('wa_session') && (
                <button
                  className={`admin-tab-btn ${activeTab === 'wa_session' ? 'active' : ''}`}
                  onClick={() => navigateToTab('wa_session')}
                >
                  <Smartphone size={14} style={{ color: activeTab === 'wa_session' ? 'inherit' : '#34d399' }} />
                  <span className="tab-label" style={{ color: activeTab === 'wa_session' ? 'inherit' : '#34d399', fontWeight: '600' }}>WA Session (2nd Device)</span>
                </button>
              )}
              {adminProfile?.is_superadmin && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'team' ? 'active' : ''}`}
                  onClick={() => navigateToTab('team')}
                >
                  <Shield size={14} />
                  <span className="tab-label">Team</span>
                </button>
              )}
              {hasAccess('team_chat') && (
                <button 
                  className={`admin-tab-btn ${activeTab === 'team_chat' ? 'active' : ''}`}
                  onClick={() => navigateToTab('team_chat')}
                >
                  <MessageCircle size={14} />
                  <span className="tab-label">Team Chat</span>
                  {unreadTeamMsgCount > 0 && <span className="admin-more-tab-badge">{unreadTeamMsgCount}</span>}
                </button>
              )}
            </div>
          </div>
          )}
        </div>
        </div>

        {/* Bottom Pinned Admin Session Card */}
        <div className="admin-sidebar-footer">
          <div className="admin-user-info">
            <div className="admin-user-avatar">
              {adminProfile?.email?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="admin-user-details">
              <span className="admin-user-name" title={adminProfile?.email || 'Administrator'}>
                {adminProfile?.email ? adminProfile.email.split('@')[0] : 'Admin'}
              </span>
              <span className="admin-user-role">
                {adminProfile?.is_superadmin ? 'Super Admin' : 'Staff Agent'}
              </span>
            </div>
          </div>
          <div className="admin-session-actions">
            <button 
              className="admin-footer-btn" 
              onClick={() => setShowPasswordModal(true)} 
              title="Change Password"
            >
              <KeyRound size={14} />
            </button>
            <button 
              className="admin-footer-btn logout" 
              onClick={handleLogout} 
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Admin dashboard container */}
      <div className="admin-container">
        <header className="admin-page-header">
          <h1 className="admin-page-title">{ADMIN_TAB_TITLES[activeTab] || 'Admin'}</h1>
          {(() => {
            const subtitle = getAdminPageSubtitle(activeTab, {
              orders: visibleOrders,
              abandonedCarts,
              leads,
              reviews,
              isStaffAgent,
            });
            return subtitle ? <p className="admin-page-subtitle">{subtitle}</p> : null;
          })()}
        </header>

        {/* TAB 1: SPREADSHEET EDITOR */}
        {activeTab === 'home' && (
          isStaffAgent ? (
            <AgentDashboard
              currentUserProfile={adminProfile}
              currentUserEmail={adminProfile?.email}
              title="My Pay"
              onOpenOrder={setSelectedOrderDetails}
              onNavigate={navigateToTab}
            />
          ) : (
            <DashboardHome
              orders={orders}
              abandonedCarts={abandonedCarts}
              leads={leads}
              products={products}
              inquiryCount={inquiryCount}
              onNavigate={navigateToTab}
              onOpenOrder={setSelectedOrderDetails}
              onCreateOrder={() => setManualOrderOpen(true)}
            />
          )
        )}

        {activeTab === 'spreadsheet' && (
          <div>
            <div className="admin-toolbar">
              <div>
                <h3>Master Inventory Products</h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                  Edit details in place exactly like Excel. Changes will sync live to customers once you click <strong>Save Changes</strong>.
                </p>
              </div>
              <div className="admin-actions-row">
                <div className="admin-search-wrapper">
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    style={{ paddingLeft: '32px' }}
                  />
                  {productSearch && (
                    <button 
                      onClick={() => setProductSearch('')}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button className="admin-btn" onClick={() => setIsCsvOpen(!isCsvOpen)}>
                  <Upload size={16} />
                  {isCsvOpen ? 'Hide CSV Importer' : 'Import CSV'}
                </button>
                <button className="admin-btn admin-btn-accent" onClick={handleAddRow}>
                  <Plus size={16} />
                  Add Product Row
                </button>
                <button className="admin-btn admin-btn-primary" onClick={handleSaveChanges} disabled={saveLoading}>
                  <Save size={16} />
                  {saveLoading ? 'Syncing DB...' : 'Save Changes'}
                </button>
                {products.length > 0 && (
                  <button
                    className="admin-btn"
                    onClick={() => setExportModalType('products')}
                    style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.2)' }}
                  >
                    <Download size={14} />
                    Export Data
                  </button>
                )}
              </div>
            </div>

            {saveStatus && (
              <div className="csv-status-banner" style={{ background: saveStatus.includes('Failed') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)', borderColor: saveStatus.includes('Failed') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)', color: saveStatus.includes('Failed') ? '#f87171' : '#4ade80' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saveStatus.includes('Failed') ? <AlertCircle size={16} /> : <Check size={16} />}
                  <span>{saveStatus}</span>
                </div>
              </div>
            )}

            {/* Collapsible Google sheet drag uploader */}
            {isCsvOpen && (
              <div 
                className={`csv-dropzone ${csvDragActive ? 'drag-active' : ''}`}
                onDragEnter={handleCsvDrag}
                onDragOver={handleCsvDrag}
                onDragLeave={handleCsvDrag}
                onDrop={handleCsvDrop}
              >
                <Upload className="csv-dropzone-icon" />
                <h4>Import Google Spreadsheet CSV</h4>
                <p>Drag and drop your exported `master_sheet.csv` here, or click to browse files from your computer.</p>
                <input 
                  type="file" 
                  accept=".csv" 
                  style={{ display: 'none' }} 
                  id="csvFileInput" 
                  onChange={handleCsvFileSelect}
                />
                <button 
                  className="admin-btn" 
                  style={{ marginTop: '8px' }}
                  onClick={() => document.getElementById('csvFileInput').click()}
                >
                  Choose CSV File
                </button>
              </div>
            )}

            {csvStatus && (
              <div className="csv-status-banner" style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                <span>{csvStatus}</span>
                <button className="admin-btn" style={{ fontSize: '0.7rem', padding: '4px 8px' }} onClick={() => setCsvStatus('')}>Dismiss</button>
              </div>
            )}

            {/* Main Spreadsheet grid */}
            {loadingProducts ? (
              <div className="loader">
                <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
                <div>Fetching master inventory table...</div>
              </div>
            ) : (
              <div className="spreadsheet-container">
                <table className="spreadsheet-table responsive-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th style={{ minWidth: '220px' }}>Product Peptide Name</th>
                      <th style={{ minWidth: '180px' }}>Category</th>
                      <th style={{ width: '100px' }}>Price (USD)</th>
                      <th style={{ width: '100px' }}>Price (CRC)</th>
                      <th style={{ width: '110px' }}>Orig. Price (USD)</th>
                      <th style={{ width: '110px' }}>Orig. Price (CRC)</th>
                      <th style={{ width: '130px' }}>Sale Start</th>
                      <th style={{ width: '130px' }}>Sale End</th>
                      <th style={{ minWidth: '180px' }}>Stock Status</th>
                      <th style={{ width: '100px' }}>Inventory Count</th>
                      <th style={{ width: '100px' }}>Low Stock Alert</th>
                      <th style={{ minWidth: '180px' }}>Volume/Bulk Discount Info</th>
                      <th style={{ minWidth: '200px' }}>Image URL / Physical Upload</th>
                      <th style={{ minWidth: '220px' }}>COA URL Link</th>
                      <th style={{ width: '120px', textAlign: 'center' }}>Info/Blog</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => !productSearch || p.product.toLowerCase().includes(productSearch.toLowerCase()) || (p.category && p.category.toLowerCase().includes(productSearch.toLowerCase()))).map((p, filteredIdx) => {
                      const idx = products.findIndex(prod => prod.id === p.id);
                      return (
                      <tr 
                        key={p.id}
                        id={`product-row-${p.id}`}
                        className={highlightedProductId === p.id ? 'row-highlight' : ''}
                      >
                        <td data-label="#" style={{ color: '#64748b', fontWeight: 'bold', textAlign: 'center' }}>{idx + 1}</td>
                        
                        {/* Name */}
                        <td data-label="Product Peptide Name">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => handleCellChange(p.id, 'product', e.target.innerText)}
                          >
                            {p.product}
                          </div>
                        </td>

                        {/* Category */}
                        <td data-label="Category">
                          <select 
                            className="cell-select"
                            value={p.category}
                            onChange={(e) => {
                              if (e.target.value === '__ADD_NEW__') {
                                const newCat = window.prompt("Enter new category (Format: English / Español):");
                                if (newCat && newCat.trim() !== "") {
                                  handleCellChange(p.id, 'category', newCat.trim());
                                }
                              } else {
                                handleCellChange(p.id, 'category', e.target.value);
                              }
                            }}
                          >
                            {Array.from(new Set([
                              ...Object.keys(CATEGORY_TRANSLATIONS),
                              ...products.map(prod => prod.category).filter(Boolean)
                            ])).sort().map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                            <option disabled>──────────</option>
                            <option value="__ADD_NEW__">➕ Create New Category...</option>
                          </select>
                        </td>

                        {/* USD Price */}
                        <td data-label="Price (USD)">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => {
                              const v = e.target.innerText;
                              handleCellChange(p.id, 'priceUsd', v);
                              // Auto calculate CRC price whenever USD changes
                              const usdNum = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
                              if (usdNum > 0) {
                                const calc = Math.round(usdNum * exchangeRate);
                                handleCellChange(p.id, 'priceCrc', `₡${calc.toLocaleString('en-US')}`);
                              }
                            }}
                          >
                            {p.priceUsd}
                          </div>
                        </td>

                        {/* CRC Price */}
                        <td data-label="Price (CRC)">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => handleCellChange(p.id, 'priceCrc', e.target.innerText)}
                          >
                            {p.priceCrc}
                          </div>
                        </td>

                        {/* Orig USD Price */}
                        <td data-label="Orig. Price (USD)">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => {
                              const v = e.target.innerText;
                              handleCellChange(p.id, 'originalPriceUsd', v);
                              const origUsdNum = parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
                              if (origUsdNum > 0) {
                                const calc = Math.round(origUsdNum * exchangeRate);
                                handleCellChange(p.id, 'originalPriceCrc', `₡${calc.toLocaleString('en-US')}`);
                              }
                            }}
                          >
                            {p.originalPriceUsd}
                          </div>
                        </td>

                        {/* Orig CRC Price */}
                        <td data-label="Orig. Price (CRC)">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => handleCellChange(p.id, 'originalPriceCrc', e.target.innerText)}
                          >
                            {p.originalPriceCrc}
                          </div>
                        </td>

                        {/* Sale Start Time */}
                        <td data-label="Sale Start">
                          <input 
                            type="datetime-local" 
                            className="cell-input"
                            value={p.saleStartTime || ''}
                            onChange={(e) => handleCellChange(p.id, 'saleStartTime', e.target.value)}
                            style={{ background: 'transparent', color: '#fff', border: 'none', width: '100%', fontSize: '0.75rem', outline: 'none' }}
                          />
                        </td>

                        {/* Sale End Time */}
                        <td data-label="Sale End">
                          <input 
                            type="datetime-local" 
                            className="cell-input"
                            value={p.saleEndTime || ''}
                            onChange={(e) => handleCellChange(p.id, 'saleEndTime', e.target.value)}
                            style={{ background: 'transparent', color: '#fff', border: 'none', width: '100%', fontSize: '0.75rem', outline: 'none' }}
                          />
                        </td>

                        {/* Status */}
                        <td data-label="Stock Status">
                          <select 
                            className="cell-select"
                            value={p.status || 'In Stock'}
                            onChange={(e) => handleCellChange(p.id, 'status', e.target.value)}
                            style={{ 
                              color: (p.status || '').toLowerCase().includes('in stock') || (p.status || '').toLowerCase().includes('disponible') ? '#4ade80' : (p.status || '').toLowerCase().includes('coming soon') || (p.status || '').toLowerCase().includes('próximamente') ? '#facc15' : '#f87171',
                              fontWeight: 'bold'
                            }}
                          >
                            <option value="In Stock">In Stock / Disponible</option>
                            <option value="Out of Stock">Out of Stock / Agotado</option>
                            <option value="Coming Soon">Coming Soon / Próximamente</option>
                          </select>
                        </td>

                        {/* Inventory Count */}
                        <td data-label="Inventory Count">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => {
                              const val = e.target.innerText.trim();
                              const num = parseInt(val, 10);
                              handleCellChange(p.id, 'inventoryCount', isNaN(num) ? null : num);
                            }}
                          >
                            {p.inventoryCount !== null && p.inventoryCount !== undefined ? p.inventoryCount : ''}
                          </div>
                        </td>

                        {/* Low Stock Threshold */}
                        <td data-label="Low Stock Alert">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => {
                              const val = e.target.innerText.trim();
                              const num = parseInt(val, 10);
                              handleCellChange(p.id, 'lowStockThreshold', isNaN(num) ? 5 : num);
                            }}
                          >
                            {p.lowStockThreshold !== null && p.lowStockThreshold !== undefined ? p.lowStockThreshold : 5}
                          </div>
                        </td>

                        {/* Discount */}
                        <td data-label="Volume/Bulk Discount Info">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            onBlur={(e) => handleCellChange(p.id, 'discount', e.target.innerText)}
                          >
                            {p.discount}
                          </div>
                        </td>

                        {/* Image cell with Dropdown & Direct Physical Upload */}
                        <td data-label="Image URL / Physical Upload">
                          <div className="admin-image-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px' }}>
                            <div className="admin-image-preview" style={{ width: '32px', height: '32px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                              {p.imageUrl && p.imageUrl.startsWith('http') ? (
                                <img src={p.imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                getCategoryIcon(p.category)
                              )}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1, minWidth: '120px' }}>
                              <select
                                className="cell-select"
                                value={bucketImages.find(img => img.url === p.imageUrl)?.url || (p.imageUrl ? 'custom' : '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'custom') return;
                                  handleCellChange(p.id, 'imageUrl', val);
                                }}
                                style={{
                                  padding: '3px 6px',
                                  borderRadius: '6px',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  background: '#0f172a',
                                  color: '#e2e8f0',
                                  fontSize: '0.7rem',
                                  width: '100%',
                                  outline: 'none',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="">-- No Image / Select --</option>
                                {p.imageUrl && !bucketImages.some(img => img.url === p.imageUrl) && (
                                  <option value="custom">Custom: {p.imageUrl.split('/').pop()?.substring(0, 15) || 'URL'}</option>
                                )}
                                {bucketImages.map((img) => (
                                  <option key={img.name} value={img.url}>
                                    {img.name.length > 20 ? img.name.substring(0, 17) + '...' : img.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <input 
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              id={`imageUpload-${p.id}`}
                              onChange={(e) => handleImageCellUpload(p.id, e)}
                            />
                            
                            <button 
                              className="admin-image-upload-btn"
                              title="Upload new image"
                              onClick={() => document.getElementById(`imageUpload-${p.id}`).click()}
                              style={{
                                width: '26px',
                                height: '26px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#e2e8f0',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                flexShrink: 0
                              }}
                            >
                              <Upload size={11} />
                            </button>
                          </div>
                        </td>

                        {/* COA Link */}
                        <td data-label="COA URL Link">
                          <div 
                            contentEditable 
                            suppressContentEditableWarning
                            className="cell-editable"
                            style={{ minWidth: '80px', maxWidth: '150px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                            onBlur={(e) => handleCellChange(p.id, 'coa', e.target.innerText)}
                            title={p.coa}
                          >
                            {p.coa}
                          </div>
                        </td>

                        {/* Info/Blog description edit button */}
                        <td data-label="Info/Blog" style={{ textAlign: 'center' }}>
                          <button
                            className="admin-btn"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px', margin: '0 auto' }}
                            onClick={() => {
                              setEditDescProduct(p);
                              setEditDescEn(p.descriptionEn || '');
                              setEditDescEs(p.descriptionEs || '');
                              setEditDescModalOpen(true);
                            }}
                          >
                            <FileText size={12} />
                            <span>Edit Info</span>
                          </button>
                        </td>

                        {/* Actions */}
                        <td data-label="Action" style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                            <button
                              className="admin-move-btn"
                              title="Move Up"
                              onClick={() => handleMoveRow(idx, -1)}
                              disabled={idx === 0 || productSearch !== ''}
                              style={{ opacity: (idx === 0 || productSearch !== '') ? 0.25 : 1 }}
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              className="admin-move-btn"
                              title="Move Down"
                              onClick={() => handleMoveRow(idx, 1)}
                              disabled={idx === products.length - 1 || productSearch !== ''}
                              style={{ opacity: (idx === products.length - 1 || productSearch !== '') ? 0.25 : 1 }}
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button className="admin-delete-btn" onClick={() => handleDeleteRow(p.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ORDERS LEDGER HISTORY */}
        {activeTab === 'orders' && (() => {
          const scopedOrders = visibleOrders;
          const filteredOrders = scopedOrders.filter(o => {
            if (orderStatusFilter !== 'All' && o.status !== orderStatusFilter) return false;
            if (orderSearch) {
              const s = orderSearch.toLowerCase();
              return (
                o.customer_name?.toLowerCase().includes(s) || 
                o.customer_phone?.toLowerCase().includes(s) ||
                o.customer_email?.toLowerCase().includes(s) ||
                o.id?.toLowerCase().includes(s) ||
                o.order_number?.toLowerCase().includes(s) ||
                o.customer_id_number?.toLowerCase().includes(s) ||
                o.tracking_number?.toLowerCase().includes(s)
              );
            }
            return true;
          });

          const totalOrdersPages = Math.ceil(filteredOrders.length / ordersPerPage);
          const paginatedOrders = filteredOrders.slice(
            (ordersCurrentPage - 1) * ordersPerPage,
            ordersCurrentPage * ordersPerPage
          );

          return (
            <div className="admin-tab-panel admin-tab-orders-panel">
            <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <h3>{isStaffAgent ? 'My Orders' : 'Customer Orders Log Ledger'}</h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 12px 0' }}>
                  {isStaffAgent
                    ? 'You see orders assigned to you and unassigned orders. Assign yourself on an order to claim it for commission.'
                    : 'A secure listing of all catalog order intents placed by customers. Double check entries here before coordinating dispatches on WhatsApp.'}
                </p>
                <div className="admin-toolbar-filters">
                  <input 
                    className="admin-input admin-filter-input"
                    type="text" 
                    placeholder="Search by name, phone, email, or tracking..." 
                    value={orderSearch}
                    onChange={(e) => {
                      setOrderSearch(e.target.value);
                      setOrdersCurrentPage(1);
                    }}
                  />
                  <select
                    className="admin-select"
                    value={orderStatusFilter}
                    onChange={(e) => {
                      setOrderStatusFilter(e.target.value);
                      setOrdersCurrentPage(1);
                    }}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Payment Pending">Payment Pending</option>
                    <option value="Processing">Processing</option>
                    <option value="Order Complete">Order Complete</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="admin-toolbar-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setManualOrderOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Plus size={14} />
                  Manual Order
                </button>
                {orders.length > 0 && (
                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={() => setExportModalType('orders')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Download size={14} />
                    Export Orders
                  </button>
                )}
              </div>
            </div>

            {loadingOrders ? (
              <div className="loader">
                <div className="sync-spinner" style={{ marginBottom: '16px' }}></div>
                <div>Fetching logs from database...</div>
              </div>
            ) : orders.length === 0 ? (
              <div className="loader" style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                <Database size={32} style={{ margin: '0 auto 16px auto', opacity: 0.3, display: 'block' }} />
                No orders registered in the system yet.
              </div>
            ) : (
              <div className="table-responsive admin-table-wrap" style={{ background: '#0e1626', borderRadius: '12px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table className="spreadsheet-table responsive-table admin-orders-table">
                  <thead>
                    <tr>
                      <th style={{ padding: '10px 12px' }}>Date</th>
                      <th style={{ padding: '10px 12px' }}>Order Info</th>
                      <th style={{ padding: '10px 12px' }}>Customer Details</th>
                      <th style={{ padding: '10px 12px' }}>Total Amount</th>
                      <th style={{ padding: '10px 12px' }}>Payment</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Agent</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map(order => {
                        const items = Array.isArray(order.items) ? order.items : [];
                        const orderDate = new Date(order.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
                        
                        return (
                          <tr key={order.id}>
                            <td data-label="Date" style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                              {orderDate}
                            </td>
                            <td data-label="Order Info" style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: 'bold', color: '#fbbf24', fontSize: '0.85rem' }}>
                                  #{order.order_number || order.id.slice(0, 8)}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  {items.length} {items.length === 1 ? 'item' : 'items'}
                                </span>
                              </div>
                            </td>
                            <td data-label="Customer Details" style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem' }}>
                                  {order.customer_name}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  💬 {order.customer_phone}
                                </span>
                                {order.customer_id_number && (
                                  <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontFamily: 'monospace' }}>
                                    🪪 {order.customer_id_number}
                                    {order.customer_id_type ? ` (${formatCustomerIdType(order.customer_id_type)})` : ''}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td data-label="Total Amount" style={{ padding: '10px 12px', fontWeight: 'bold', color: '#38bdf8', fontSize: '0.9rem' }}>
                              {order.currency === 'USD' 
                                ? `$${Number(order.total_usd || 0).toLocaleString('en-US')}` 
                                : `₡${Number(order.total_crc || 0).toLocaleString('en-US')}`
                              }
                            </td>
                            <td data-label="Payment" style={{ padding: '10px 12px' }}>
                              <span style={{ 
                                padding: '4px 8px', 
                                borderRadius: '6px', 
                                background: 'rgba(255,255,255,0.05)', 
                                color: '#94a3b8',
                                fontSize: '0.75rem',
                                fontWeight: 'bold'
                              }}>
                                {order.payment_method === 'paypal' ? '💳 PayPal' : order.payment_method === 'sinpe' ? '📱 SINPE' : order.payment_method === 'tilopay' ? '💳 Card' : '💬 WA'}
                              </span>
                            </td>
                            <td data-label="Status" style={{ padding: '10px 12px' }}>
                              <select 
                                className="cell-select"
                                value={order.status || 'Pending'}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleOrderStatusUpdate(order.id, e.target.value);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  width: '120px',
                                  background: order.status === 'Order Complete' ? 'rgba(34, 197, 94, 0.15)' : order.status === 'Processing' ? 'rgba(56, 189, 248, 0.15)' : order.status === 'Cancelled' ? 'rgba(239, 68, 68, 0.15)' : order.status === 'Payment Pending' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: order.status === 'Order Complete' ? '#4ade80' : order.status === 'Processing' ? '#38bdf8' : order.status === 'Cancelled' ? '#f87171' : order.status === 'Payment Pending' ? '#fb7185' : '#f59e0b',
                                  fontWeight: 'bold',
                                  border: order.status === 'Order Complete' ? '1px solid rgba(34, 197, 94, 0.3)' : order.status === 'Processing' ? '1px solid rgba(56, 189, 248, 0.3)' : order.status === 'Cancelled' ? '1px solid rgba(239, 68, 68, 0.3)' : order.status === 'Payment Pending' ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                                  textAlign: 'center',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Payment Pending">Payment Pending</option>
                                <option value="Processing">Processing</option>
                                <option value="Order Complete">Order Complete</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>
                            </td>
                            <td data-label="Agent" style={{ padding: '10px 12px' }}>
                              <select 
                                className="cell-select"
                                value={order.sales_agent || ''}
                                onChange={(e) => handleOrderSalesAgentUpdate(order.id, e.target.value)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  width: '120px',
                                  background: order.sales_agent ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.03)',
                                  color: order.sales_agent ? '#c084fc' : '#94a3b8',
                                  fontWeight: 'bold',
                                  border: order.sales_agent ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                                  textAlign: 'center',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="">-- Unassigned --</option>
                                {agents.map(agent => (
                                  <option key={agent} value={agent}>{agent}</option>
                                ))}
                              </select>
                            </td>
                            <td data-label="Actions" style={{ padding: '10px 12px' }}>
                              <div className="admin-card-actions">
                                <button 
                                  className="admin-btn" 
                                  onClick={() => setSelectedOrderDetails(order)}
                                  style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                                >
                                  Details
                                </button>
                                
                                {/* Quick CTAs based on status */}
                                {(order.status || 'Pending') === 'Pending' && (
                                  <>
                                    <button 
                                      className="admin-btn admin-cta-btn" 
                                      onClick={() => handleOrderStatusUpdate(order.id, 'Processing')}
                                      style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                                    >
                                      🚚 Process
                                    </button>
                                    <button 
                                      className="admin-btn admin-cta-btn" 
                                      onClick={() => handleOrderStatusUpdate(order.id, 'Order Complete')}
                                      style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                                    >
                                      ✅ Complete
                                    </button>
                                  </>
                                )}

                                {(order.status || 'Pending') === 'Payment Pending' && (
                                  <button 
                                    className="admin-btn admin-cta-btn" 
                                    onClick={() => openWhatsAppComposer({ 
                                      name: order.customer_name, 
                                      phone: order.customer_phone, 
                                      orderNumber: order.order_number, 
                                      orderDbId: order.id, 
                                      cartItems: order.cart_data || [] 
                                    }, 'payment')}
                                    style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    💬 Ask Payment
                                  </button>
                                )}

                                {/* Quick Agent Claim CTA */}
                                {!order.sales_agent && (
                                  <button 
                                    className="admin-btn admin-cta-btn" 
                                    onClick={() => {
                                      const claimEmail = loggedInEmail.current || localStorage.getItem('admin_email') || 'info@peptidescostarica.net';
                                      handleOrderSalesAgentUpdate(order.id, claimEmail);
                                    }}
                                    style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#a855f7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                                    title="Assign this order to yourself"
                                  >
                                    👤 Claim
                                  </button>
                                )}

                                 <button 
                                  onClick={() => openWhatsAppComposer({ 
                                    name: order.customer_name, 
                                    phone: order.customer_phone, 
                                    orderNumber: order.order_number, 
                                    orderDbId: order.id, 
                                    cartItems: order.cart_data || [] 
                                  })}
                                  className="admin-btn"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#4ade80', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  WhatsApp
                                </button>
                                <button
                                  className="admin-btn"
                                  onClick={() => handleDeleteOrder(order.id)}
                                  style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '6px' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
            
            {filteredOrders.length > 0 && (
              <div className="admin-pagination-bar">
                <div className="admin-pagination-info">
                  Showing {Math.min(filteredOrders.length, (ordersCurrentPage - 1) * ordersPerPage + 1)} to {Math.min(filteredOrders.length, ordersCurrentPage * ordersPerPage)} of {filteredOrders.length} orders
                </div>
                <div className="admin-pagination-controls">
                  <button 
                    className="admin-pagination-btn"
                    onClick={() => setOrdersCurrentPage(p => Math.max(1, p - 1))}
                    disabled={ordersCurrentPage === 1}
                  >
                    &laquo; Prev
                  </button>
                  {Array.from({ length: totalOrdersPages }, (_, i) => i + 1)
                    .filter(page => {
                      return page === 1 || 
                             page === totalOrdersPages || 
                             Math.abs(page - ordersCurrentPage) <= 1;
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
                          className={`admin-pagination-btn ${ordersCurrentPage === page ? 'active' : ''}`}
                          onClick={() => setOrdersCurrentPage(page)}
                        >
                          {page}
                        </button>
                      );
                      return elements;
                    })
                  }
                  <button 
                    className="admin-pagination-btn"
                    onClick={() => setOrdersCurrentPage(p => Math.min(totalOrdersPages, p + 1))}
                    disabled={ordersCurrentPage === totalOrdersPages}
                  >
                    Next &raquo;
                  </button>
                </div>
                <div>
                  <select
                    className="admin-pagination-limit"
                    value={ordersPerPage}
                    onChange={(e) => {
                      setOrdersPerPage(Number(e.target.value));
                      setOrdersCurrentPage(1);
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

        {/* TAB 3: SHARE LINKS GENERATOR */}
        {activeTab === 'share' && (
          <div>
            <div className="admin-toolbar">
              <div>
                <h3>Share Catalog Overrides Links</h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
                  Generate custom pre-configured links for different user groups (such as English speakers or currency preferences) to share directly in WhatsApp or bio pages.
                </p>
              </div>
            </div>

            <div className="order-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <div className="share-link-builder">
                <div className="share-select-row">
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Preselected Language</label>
                    <select 
                      className="cell-select" 
                      value={shareLang}
                      onChange={(e) => setShareLang(e.target.value)}
                    >
                      <option value="es">Spanish / Español</option>
                      <option value="en">English / Inglés</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Preselected Currency</label>
                    <select 
                      className="cell-select" 
                      value={shareCurrency}
                      onChange={(e) => setShareCurrency(e.target.value)}
                    >
                      <option value="CRC">CRC / Colones Costarricenses</option>
                      <option value="USD">USD / Dólares Estadounidenses</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Specific Product</label>
                    <select 
                      className="cell-select" 
                      value={shareProduct}
                      onChange={(e) => setShareProduct(e.target.value)}
                    >
                      <option value="all">Entire Catalog</option>
                      {products.map(p => (
                        <option key={p.id || p.product} value={p.product}>
                          {p.product}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Tracking Source</label>
                    <select 
                      className="cell-select" 
                      value={shareSource}
                      onChange={(e) => setShareSource(e.target.value)}
                    >
                      <option value="none">None</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="reddit">Reddit</option>
                      <option value="pinterest">Pinterest</option>
                    </select>
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Tracking Medium</label>
                    <input 
                      type="text"
                      className="cell-select" 
                      style={{ 
                        background: '#172237',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        fontSize: '0.75rem',
                        outline: 'none',
                        width: '100%',
                        cursor: 'text'
                      }}
                      placeholder="e.g. cpc, bio, story, banner"
                      value={shareMedium}
                      onChange={(e) => setShareMedium(e.target.value)}
                    />
                  </div>
                  <div className="filter-group">
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800' }}>Tracking Campaign</label>
                    <input 
                      type="text"
                      className="cell-select" 
                      style={{ 
                        background: '#172237',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        fontSize: '0.75rem',
                        outline: 'none',
                        width: '100%',
                        cursor: 'text'
                      }}
                      placeholder="e.g. summer_promo"
                      value={shareCampaign}
                      onChange={(e) => setShareCampaign(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '800', display: 'block', marginBottom: '8px' }}>Your Customized Share URL</label>
                  <div className="share-copy-wrapper">
                    <div className="share-url-box">{getShareUrl()}</div>
                    <button 
                      className="admin-btn admin-btn-primary" 
                      onClick={handleCopyLink}
                      style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      {shareCopied ? <Check size={16} /> : <Share2 size={16} />}
                      {shareCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.1)', padding: '16px', borderRadius: '8px', fontSize: '0.8rem', color: '#cbd5e1', lineHeight: '1.5', marginTop: '16px' }}>
                  💡 **Sharing Pro-Tip:** Placing `lang=en` inside links will automatically translate all category names, buttons, and stock badges to English, and toggle the catalog to prioritize USD pricing immediately for international clients!
                  
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0, 212, 255, 0.1)' }}>
                    <p style={{ margin: '0 0 8px 0', color: '#38bdf8', fontWeight: 'bold' }}>🧪 Live Testing Links (No analytics logged):</p>
                    <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <li>
                        <a href="https://catalog.peptidescostarica.net/catalog?admin_preview=true" target="_blank" rel="noopener noreferrer" style={{ color: '#34d399', textDecoration: 'none' }}>
                          https://catalog.peptidescostarica.net/catalog?admin_preview=true
                        </a>
                      </li>
                      <li>
                        <a href="https://peptidecosta.vercel.app/catalog?admin_preview=true" target="_blank" rel="noopener noreferrer" style={{ color: '#34d399', textDecoration: 'none' }}>
                          https://peptidecosta.vercel.app/catalog?admin_preview=true
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'carts' && (
          <div className="admin-orders-tab admin-tab-panel">
            <div className="admin-section-header">
              <h2 className="admin-section-title">🛒 Active / Abandoned Carts</h2>
              <div className="admin-toolbar-actions">
                {abandonedCarts.length > 0 && (
                  <>
                    <button
                      onClick={() => setExportModalType('carts')}
                      style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Upload size={13} /> Export Data
                    </button>
                    <button
                      onClick={handleClearAllCarts}
                      style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Trash2 size={13} /> Clear All
                    </button>
                  </>
                )}
                <button className="admin-btn" onClick={loadAdminData} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                  Refresh
                </button>
              </div>
            </div>

            {/* CARTS AI RECOVERY INSIGHTS CARD */}
            <div style={{ marginBottom: '24px' }}>
              {generatingCartsAi ? (
                <div style={{ background: 'linear-gradient(135deg, rgba(14, 22, 38, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '16px', padding: '24px', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="sync-spinner" style={{ color: '#38bdf8' }}><Brain size={32} /></div>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 4px 0' }}>🧬 AI Copilot is auditing active abandoned carts and pipeline...</h4>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Compiling peptide cart values, measuring checkout leakage frequency, and drafting recovery discount hooks...</p>
                    </div>
                  </div>
                </div>
              ) : cartsAiText ? (
                <div style={{ background: 'linear-gradient(135deg, rgba(14, 26, 51, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '16px', padding: '24px', boxShadow: '0 10px 40px -10px rgba(56, 189, 248, 0.15)', position: 'relative' }}>
                  <button 
                    onClick={() => setCartsAiText('')}
                    style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    &times;
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '8px', borderRadius: '10px', color: '#38bdf8' }}>
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>🧬 Real-Time AI Cart Recovery Strategy</h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Generated by Gemini • Data-Driven Recovery hooks</span>
                    </div>
                  </div>
                  
                  <div 
                    style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{
                      __html: cartsAiText
                        .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #38bdf8">$1</strong>')
                        .replace(/^- (.*)$/gm, '<li style="margin-left: 12px; margin-bottom: 6px; list-style-type: square">$1</li>')
                    }}
                  />
                </div>
              ) : (
                <div 
                  onClick={handleGenerateCartsAi}
                  className="admin-ai-insight-card"
                  style={{ background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.25) 0%, rgba(15, 23, 42, 0.45) 100%)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '10px', borderRadius: '12px', color: '#38bdf8' }}>
                      <Brain size={20} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 2px 0' }}>✨ Generate Real-Time AI Cart Recovery Insights</h4>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Analyze abandoned carts list, map product abandonment frequency, and draft high-converting Spanish WhatsApp pitches.</p>
                    </div>
                  </div>
                  <button 
                    className="admin-btn admin-btn-primary" 
                    style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerateCartsAi();
                    }}
                  >
                    <Sparkles size={13} /> Audit Carts
                  </button>
                </div>
              )}
            </div>

            {/* BULK PROCESSING PROGRESS INDICATOR OVERLAY */}
            {bulkProcessing && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(14, 22, 38, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '20px',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div className="sync-spinner" style={{ color: '#38bdf8' }}><Brain size={32} /></div>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 4px 0' }}>⚡ Processing Bulk Operation...</h4>
                  <p style={{ fontSize: '0.85rem', color: '#38bdf8', margin: 0, fontWeight: 'bold' }}>{bulkProgressText}</p>
                </div>
              </div>
            )}

            {selectedCartIds.length > 0 && !bulkProcessing && (
              <div style={{ 
                background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)', 
                border: '1px solid rgba(56, 189, 248, 0.3)', 
                borderRadius: '12px', 
                padding: '16px 20px', 
                marginBottom: '20px', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
              }}>
                <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                  ⚡ Selected <span style={{ color: '#38bdf8', fontSize: '1rem' }}>{selectedCartIds.length}</span> {selectedCartIds.length === 1 ? 'cart' : 'carts'} for bulk actions
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={handleBulkEmail}
                    className="admin-btn"
                    style={{ background: 'rgba(56, 189, 248, 0.25)', border: '1px solid rgba(56, 189, 248, 0.4)', color: '#38bdf8', padding: '8px 16px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}
                  >
                    ✉️ Bulk Email Reminder
                  </button>
                  <button 
                    onClick={handleBulkWhatsApp}
                    className="admin-btn"
                    style={{ background: 'rgba(34, 197, 94, 0.25)', border: '1px solid rgba(34, 197, 94, 0.4)', color: '#4ade80', padding: '8px 16px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}
                  >
                    💬 Bulk WhatsApp Reminder
                  </button>
                  <button 
                    onClick={handleBulkDelete}
                    className="admin-btn"
                    style={{ background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', padding: '8px 16px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}
                  >
                    🗑️ Bulk Delete Carts
                  </button>
                </div>
              </div>
            )}

            {/* MINI REVENUE DASHBOARD & FILTERS */}
            {abandonedCarts.length > 0 && (() => {
              const totalAbandonedValue = abandonedCarts.reduce((sum, c) => sum + getCartValue(c), 0);
              const recoveredCarts = abandonedCarts.filter(c => getCartRecoveryStatus(c) === 'recovered');
              const totalRecoveredValue = recoveredCarts.reduce((sum, c) => sum + getCartValue(c), 0);
              const recoveryRate = abandonedCarts.length > 0 ? ((recoveredCarts.length / abandonedCarts.length) * 100).toFixed(1) : '0.0';

              return (
                <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  
                  {/* Dashboard Cards */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                    gap: '16px' 
                  }}>
                    <div style={{ background: 'linear-gradient(145deg, #0f172a, #1e293b)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#f87171' }}>📉</span> Lost Revenue
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc' }}>
                        ${totalAbandonedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    
                    <div style={{ background: 'linear-gradient(145deg, #0f172a, #1e293b)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#4ade80' }}>📈</span> Recovered Revenue
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc' }}>
                        ${totalRecoveredValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    
                    <div style={{ background: 'linear-gradient(145deg, #0f172a, #1e293b)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#38bdf8' }}>⚡</span> Recovery Rate
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc' }}>
                        {recoveryRate}% <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 'normal' }}>({recoveredCarts.length} saved)</span>
                      </div>
                    </div>
                  </div>

                  {/* Filters Bar */}
                  <div style={{ 
                    background: '#0e1626', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '16px', 
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <span style={{ fontSize: '1rem', color: '#e2e8f0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔍 Advanced Filters
                      </span>
                      
                      <button 
                        onClick={() => {
                          const exportData = abandonedCarts.filter(c => {
                            let matchContact = true;
                            if (cartFilterContact === 'has_email') matchContact = !!c.customer_email;
                            if (cartFilterContact === 'has_phone') matchContact = !!c.customer_phone;
                            if (cartFilterContact === 'actionable') matchContact = !!c.customer_email || !!c.customer_phone;
                            if (cartFilterContact === 'none') matchContact = !c.customer_email && !c.customer_phone;
                            
                            let matchStatus = true;
                            if (cartFilterStatus === 'not_contacted') matchStatus = !getCartRecoveryStatus(c) || getCartRecoveryStatus(c) === 'not_contacted';
                            if (cartFilterStatus === 'contacted') matchStatus = getCartRecoveryStatus(c) === 'contacted_email' || getCartRecoveryStatus(c) === 'contacted_whatsapp';
                            if (cartFilterStatus === 'recovered') matchStatus = getCartRecoveryStatus(c) === 'recovered';
                            
                            let matchValue = true;
                            const val = getCartValue(c);
                            if (cartFilterValue === 'high') matchValue = val >= 100;
                            if (cartFilterValue === 'low') matchValue = val < 100;
                            
                            return matchContact && matchStatus && matchValue;
                          });
                          handleExportCartsCSV(exportData);
                        }}
                        style={{ 
                          padding: '8px 16px', 
                          background: 'linear-gradient(90deg, #38bdf8 0%, #2563eb 100%)', 
                          border: 'none', 
                          color: '#ffffff', 
                          borderRadius: '8px', 
                          fontSize: '0.85rem', 
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 8px rgba(56, 189, 248, 0.4)',
                          transition: 'transform 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        📥 Export Filtered CSV
                      </button>
                    </div>

                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '16px'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.05em' }}>CONTACT INFO</label>
                        <select 
                          value={cartFilterContact} 
                          onChange={(e) => setCartFilterContact(e.target.value)} 
                          style={{ 
                            padding: '12px 14px', 
                            borderRadius: '10px', 
                            background: 'rgba(255,255,255,0.03)', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            color: '#f8fafc', 
                            fontSize: '0.9rem',
                            outline: 'none',
                            cursor: 'pointer',
                            appearance: 'none',
                            backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 14px top 50%',
                            backgroundSize: '10px auto',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
                          onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                        >
                          <option value="all" style={{ background: '#0f172a' }}>All Contacts</option>
                          <option value="has_email" style={{ background: '#0f172a' }}>Has Email Address</option>
                          <option value="has_phone" style={{ background: '#0f172a' }}>Has Phone Number</option>
                          <option value="actionable" style={{ background: '#0f172a' }}>Actionable (Email or Phone)</option>
                          <option value="none" style={{ background: '#0f172a' }}>No Contact Info</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.05em' }}>RECOVERY STATUS</label>
                        <select 
                          value={cartFilterStatus} 
                          onChange={(e) => setCartFilterStatus(e.target.value)} 
                          style={{ 
                            padding: '12px 14px', 
                            borderRadius: '10px', 
                            background: 'rgba(255,255,255,0.03)', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            color: '#f8fafc', 
                            fontSize: '0.9rem',
                            outline: 'none',
                            cursor: 'pointer',
                            appearance: 'none',
                            backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 14px top 50%',
                            backgroundSize: '10px auto',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
                          onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                        >
                          <option value="all" style={{ background: '#0f172a' }}>All Statuses</option>
                          <option value="not_contacted" style={{ background: '#0f172a' }}>Pending (Not Contacted)</option>
                          <option value="contacted" style={{ background: '#0f172a' }}>Contacted</option>
                          <option value="recovered" style={{ background: '#0f172a' }}>Recovered</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.05em' }}>CART VALUE</label>
                        <select 
                          value={cartFilterValue} 
                          onChange={(e) => setCartFilterValue(e.target.value)} 
                          style={{ 
                            padding: '12px 14px', 
                            borderRadius: '10px', 
                            background: 'rgba(255,255,255,0.03)', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            color: '#f8fafc', 
                            fontSize: '0.9rem',
                            outline: 'none',
                            cursor: 'pointer',
                            appearance: 'none',
                            backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 14px top 50%',
                            backgroundSize: '10px auto',
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
                          onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                        >
                          <option value="all" style={{ background: '#0f172a' }}>All Values</option>
                          <option value="high" style={{ background: '#0f172a' }}>High Value (&gt;$100)</option>
                          <option value="low" style={{ background: '#0f172a' }}>Low Value (&lt;$100)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {loadingAbandonedCarts ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading carts...</div>
            ) : abandonedCarts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                No active or abandoned carts currently.
              </div>
            ) : (
              <div className="table-responsive" style={{ background: '#0e1626', borderRadius: '12px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table className="spreadsheet-table responsive-table">
                  <thead>
                    <tr>
                      <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedCartIds.length === abandonedCarts.length && abandonedCarts.length > 0} 
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCartIds(abandonedCarts.map(c => c.session_id));
                            } else {
                              setSelectedCartIds([]);
                            }
                          }}
                          style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                        />
                      </th>
                      <th style={{ padding: '10px 12px', cursor: 'pointer' }} onClick={() => setCartSort(cartSort === 'date_desc' ? 'date_asc' : 'date_desc')}>
                        Last Updated {cartSort === 'date_desc' ? '↓' : cartSort === 'date_asc' ? '↑' : ''}
                      </th>
                      <th style={{ padding: '10px 12px', cursor: 'pointer' }} onClick={() => setCartSort(cartSort === 'customer_asc' ? 'customer_desc' : 'customer_asc')}>
                        Customer {cartSort === 'customer_asc' ? '↑' : cartSort === 'customer_desc' ? '↓' : ''}
                      </th>
                      <th style={{ padding: '10px 12px' }}>Cart Details</th>
                      <th style={{ padding: '10px 12px', cursor: 'pointer' }} onClick={() => setCartSort(cartSort === 'value_asc' ? 'value_desc' : 'value_asc')}>
                        Cart Value {cartSort === 'value_asc' ? '↑' : cartSort === 'value_desc' ? '↓' : ''}
                      </th>
                      <th style={{ padding: '10px 12px', cursor: 'pointer' }} onClick={() => setCartSort(cartSort === 'recovery_asc' ? 'recovery_desc' : 'recovery_asc')}>
                        Recovery Status {cartSort === 'recovery_asc' ? '↑' : cartSort === 'recovery_desc' ? '↓' : ''}
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let filteredCarts = abandonedCarts.filter(c => {
                        let matchContact = true;
                        if (cartFilterContact === 'has_email') matchContact = !!c.customer_email;
                        if (cartFilterContact === 'has_phone') matchContact = !!c.customer_phone;
                        if (cartFilterContact === 'actionable') matchContact = !!c.customer_email || !!c.customer_phone;
                        if (cartFilterContact === 'none') matchContact = !c.customer_email && !c.customer_phone;
                        
                        let matchStatus = true;
                        if (cartFilterStatus === 'not_contacted') matchStatus = !getCartRecoveryStatus(c) || getCartRecoveryStatus(c) === 'not_contacted';
                        if (cartFilterStatus === 'contacted') matchStatus = getCartRecoveryStatus(c) === 'contacted_email' || getCartRecoveryStatus(c) === 'contacted_whatsapp';
                        if (cartFilterStatus === 'recovered') matchStatus = getCartRecoveryStatus(c) === 'recovered';
                        
                        let matchValue = true;
                        const val = getCartValue(c);
                        if (cartFilterValue === 'high') matchValue = val >= 100;
                        if (cartFilterValue === 'low') matchValue = val < 100;
                        
                        return matchContact && matchStatus && matchValue;
                      });

                      let sortedCarts = [...filteredCarts];
                      if (cartSort === 'value_asc' || cartSort === 'value_desc') {
                        sortedCarts.sort((a, b) => {
                          const valA = getCartValue(a);
                          const valB = getCartValue(b);
                          return cartSort === 'value_asc' ? valA - valB : valB - valA;
                        });
                      } else if (cartSort === 'recovery_asc' || cartSort === 'recovery_desc') {
                        sortedCarts.sort((a, b) => {
                          const statusA = getCartRecoveryStatus(a) || '';
                          const statusB = getCartRecoveryStatus(b) || '';
                          const res = statusA.localeCompare(statusB);
                          if (res !== 0) return cartSort === 'recovery_asc' ? res : -res;
                          
                          // Secondary sort: automatically float carts with emails/phones to the top of their status group
                          const hasContactA = (a.email || a.phone) ? 1 : 0;
                          const hasContactB = (b.email || b.phone) ? 1 : 0;
                          return hasContactB - hasContactA;
                        });
                      } else if (cartSort === 'customer_asc' || cartSort === 'customer_desc') {
                        sortedCarts.sort((a, b) => {
                          const contactA = (a.email || '') + (a.phone || '');
                          const contactB = (b.email || '') + (b.phone || '');
                          const res = contactA.localeCompare(contactB);
                          return cartSort === 'customer_asc' ? res : -res;
                        });
                      } else {
                        sortedCarts.sort((a, b) => {
                          const timeA = new Date(a.updated_at).getTime();
                          const timeB = new Date(b.updated_at).getTime();
                          return cartSort === 'date_desc' ? timeB - timeA : timeA - timeB;
                        });
                      }
                      return sortedCarts.map((acart, index) => {
                      const totalQty = acart.cart_data ? acart.cart_data.reduce((acc, item) => acc + (item.qty || 0), 0) : 0;
                      
                      return (
                        <tr key={acart.session_id}>
                          <td data-label="Select" style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedCartIds.includes(acart.session_id)} 
                              onClick={(e) => {
                                const checked = e.target.checked;
                                const shiftKey = e.shiftKey;
                                handleSelectCart(acart.session_id, checked, shiftKey, index);
                              }}
                              onChange={() => {}}
                              style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                            />
                          </td>
                          <td data-label="Last Updated" style={{ padding: '10px 12px', fontSize: '0.85rem', color: '#cbd5e1' }}>
                            {new Date(acart.last_updated).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                          </td>
                          <td data-label="Customer" style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.85rem' }}>
                                {acart.customer_name || 'Anonymous User'}
                              </span>
                              {acart.customer_phone ? (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  💬 {acart.customer_phone}
                                </span>
                              ) : acart.customer_email ? (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  ✉️ {acart.customer_email}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td data-label="Cart Details" style={{ padding: '10px 12px' }}>
                            <button 
                              onClick={() => setSelectedCartDetails(acart)}
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
                              🛒 {totalQty} {totalQty === 1 ? 'Item' : 'Items'}
                            </button>
                          </td>
                          <td data-label="Cart Value" style={{ padding: '10px 12px', fontSize: '0.9rem', fontWeight: 'bold', color: '#4ade80' }}>
                            ${getCartValue(acart).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td data-label="Recovery Status" style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                              {acart.customer_email && (
                                <span style={{ 
                                  background: acart.recovery_email_sent ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                  color: acart.recovery_email_sent ? '#34d399' : '#94a3b8',
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  ✉️ {acart.recovery_email_sent ? 'Email Sent' : 'Email Not Sent'}
                                </span>
                              )}
                              {acart.customer_phone && (
                                <span style={{ 
                                  background: acart.recovery_whatsapp_sent ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                  color: acart.recovery_whatsapp_sent ? '#4ade80' : '#94a3b8',
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  💬 {acart.recovery_whatsapp_sent ? 'WhatsApp Sent' : 'WA Not Sent'}
                                </span>
                              )}
                              {!acart.customer_email && !acart.customer_phone && (
                                <span style={{ 
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#f87171',
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  display: 'inline-block'
                                }}>
                                  🚫 No Contact Info
                                </span>
                              )}
                            </div>
                          </td>
                            <td data-label="Actions" style={{ padding: '10px 12px' }}>
                              <div className="admin-card-actions">
                                <button 
                                  className="admin-btn" 
                                  onClick={() => setSelectedCartDetails(acart)}
                                  style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
                                >
                                  Details
                                </button>
                                
                                {acart.customer_email && (
                                  <button
                                    onClick={() => handleSendRecoveryEmail(acart)}
                                    disabled={sendingRecoveryEmail[acart.session_id]}
                                    className="admin-btn admin-cta-btn"
                                    style={{ 
                                      padding: '6px 12px', 
                                      fontSize: '0.8rem', 
                                      background: '#0ea5e9', 
                                      border: 'none', 
                                      color: '#fff', 
                                      borderRadius: '6px',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    {sendingRecoveryEmail[acart.session_id] ? 'Sending...' : '✉️ Recover Email'}
                                  </button>
                                )}
                                
                                {acart.customer_phone && (
                                  <button
                                    onClick={() => openWhatsAppComposer({ 
                                      name: acart.customer_name, 
                                      phone: acart.customer_phone, 
                                      cartItems: acart.cart_data || [], 
                                      session_id: acart.session_id 
                                    })}
                                    className="admin-btn admin-cta-btn"
                                    style={{ 
                                      padding: '6px 12px', 
                                      fontSize: '0.8rem', 
                                      background: '#10b981', 
                                      border: 'none', 
                                      color: '#fff', 
                                      borderRadius: '6px', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px', 
                                      fontWeight: 'bold',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    💬 Recover WA
                                  </button>
                                )}

                                {!acart.customer_email && !acart.customer_phone && (
                                  <button
                                    onClick={() => setSelectedCartDetails(acart)}
                                    className="admin-btn admin-cta-btn"
                                    style={{ 
                                      padding: '6px 12px', 
                                      fontSize: '0.8rem', 
                                      background: '#475569', 
                                      border: 'none', 
                                      color: '#fff', 
                                      borderRadius: '6px',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    ✏️ Add Info
                                  </button>
                                )}
                                
                                <button
                                  onClick={() => handleDeleteCart(acart.session_id)}
                                  className="admin-btn"
                                  style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', borderRadius: '6px' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                        </tr>
                      );
                    })})()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: REVIEWS MODERATION */}
        {activeTab === 'reviews' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}>⭐ Product Reviews Moderation</h2>
              <button className="admin-btn" onClick={loadAdminData} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                Refresh
              </button>
            </div>
            
            {loadingReviews ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading reviews...</div>
            ) : reviews.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                No reviews found.
              </div>
            ) : (
              <div className="spreadsheet-container">
                <table className="spreadsheet-table responsive-table">
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>Date</th>
                      <th style={{ width: '180px' }}>Product</th>
                      <th style={{ width: '150px' }}>Author</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Rating</th>
                      <th style={{ minWidth: '300px' }}>Review Comment</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                      <th style={{ width: '160px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map(r => (
                      <tr key={r.id} style={{ opacity: r.status === 'Approved' ? 0.75 : 1 }}>
                        <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>{r.product_name}</td>
                        <td>{r.customer_name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} size={12} fill={star <= r.rating ? '#fbbf24' : 'transparent'} color="#fbbf24" />
                            ))}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                           <div style={{ maxHeight: '60px', overflowY: 'auto', paddingRight: '4px', lineHeight: '1.4' }}>
                             {r.comment}
                           </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ 
                            background: r.status === 'Approved' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)', 
                            color: r.status === 'Approved' ? '#4ade80' : '#38bdf8', 
                            padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' 
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {r.status !== 'Approved' && (
                              <button onClick={() => handleApproveReview(r.id)} style={{ padding: '6px 10px', background: 'rgba(22, 163, 74, 0.15)', color: '#4ade80', border: '1px solid rgba(22, 163, 74, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                Approve
                              </button>
                            )}
                            <button onClick={() => handleDeleteReview(r.id)} style={{ padding: '6px 10px', background: 'rgba(220, 38, 38, 0.15)', color: '#f87171', border: '1px solid rgba(220, 38, 38, 0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>
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
          </div>
        )}

        {/* TAB: Facebook Notifications */}
        {activeTab === 'broadcasts' && (
          <BroadcastsPanel products={products} />
        )}

        {activeTab === 'facebook' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageCircle size={22} style={{ color: '#0ea5e9' }} /> Facebook Alerts & Leads
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                  Real-time Messenger conversations, feed comments, and Lead Ads submissions
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                {facebookNotifications.some(n => n.status === 'unread') && (
                  <button 
                    className="admin-btn" 
                    onClick={handleMarkAllNotificationsRead} 
                    style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.3)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}
                  >
                    Mark All Read
                  </button>
                )}
                <button 
                  className="admin-btn" 
                  onClick={loadAdminData} 
                  style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Filter toolbar */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {['All', 'unread', 'lead', 'message', 'comment'].map(filterVal => {
                const label = filterVal === 'All' ? 'All Alerts' : filterVal === 'unread' ? 'Unread Only' : filterVal.charAt(0).toUpperCase() + filterVal.slice(1) + 's';
                const isActive = fbFilter === filterVal;
                
                // Count unread for that category
                let count = 0;
                if (filterVal === 'All') count = facebookNotifications.length;
                else if (filterVal === 'unread') count = facebookNotifications.filter(n => n.status === 'unread').length;
                else count = facebookNotifications.filter(n => n.type === filterVal).length;

                return (
                  <button
                    key={filterVal}
                    onClick={() => setFbFilter(filterVal)}
                    style={{
                      background: isActive ? '#0284c7' : '#0f172a',
                      color: isActive ? 'white' : '#94a3b8',
                      border: `1px solid ${isActive ? '#0284c7' : 'rgba(255,255,255,0.08)'}`,
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {label}
                    <span style={{ 
                      fontSize: '0.7rem', 
                      background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(148,163,184,0.1)', 
                      color: isActive ? 'white' : '#64748b', 
                      padding: '2px 6px', 
                      borderRadius: '10px' 
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {loadingFbNotifications ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading alerts...</div>
            ) : facebookNotifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                <Bell size={40} style={{ color: '#475569', marginBottom: '12px' }} />
                <h3 style={{ margin: '0 0 4px 0', color: '#cbd5e1' }}>No Facebook Alerts Found</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>When Facebook Webhook triggers, alerts will instantly appear here.</p>
              </div>
            ) : (() => {
              const filtered = facebookNotifications.filter(n => {
                if (fbFilter === 'All') return true;
                if (fbFilter === 'unread') return n.status === 'unread';
                return n.type === fbFilter;
              });

              if (filtered.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px', background: '#0e1626', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                    No alerts match the selected filter.
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filtered.map(item => {
                    const isUnread = item.status === 'unread';
                    
                    // Style mapping based on type
                    let typeLabel = 'Alert';
                    let typeColor = '#64748b';
                    let typeBg = 'rgba(100, 116, 139, 0.15)';
                    let IconComponent = Bell;

                    if (item.type === 'lead') {
                      typeLabel = 'Lead Form';
                      typeColor = '#10b981';
                      typeBg = 'rgba(16, 185, 129, 0.15)';
                      IconComponent = Users;
                    } else if (item.type === 'message') {
                      typeLabel = 'Messenger';
                      typeColor = '#0ea5e9';
                      typeBg = 'rgba(14, 165, 233, 0.15)';
                      IconComponent = MessageSquare;
                    } else if (item.type === 'comment') {
                      typeLabel = 'Comment';
                      typeColor = '#ec4899';
                      typeBg = 'rgba(236, 72, 153, 0.15)';
                      IconComponent = MessageCircle;
                    }

                    return (
                      <div
                        key={item.id}
                        style={{
                          background: isUnread ? 'rgba(14, 165, 233, 0.05)' : '#0e1626',
                          borderRadius: '12px',
                          border: `1px solid ${isUnread ? 'rgba(14, 165, 233, 0.2)' : 'rgba(255,255,255,0.05)'}`,
                          borderLeft: isUnread ? '4px solid #0ea5e9' : '1px solid rgba(255,255,255,0.05)',
                          padding: '16px 20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '20px',
                          flexWrap: 'wrap',
                          transition: 'all 0.2s ease',
                          opacity: isUnread ? 1 : 0.8
                        }}
                      >
                        <div style={{ display: 'flex', gap: '16px', flex: '1', minWidth: '280px' }}>
                          <div style={{ 
                            background: typeBg, 
                            color: typeColor, 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '10px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <IconComponent size={20} />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '0.95rem' }}>
                                {item.sender_name || 'Facebook Visitor'}
                              </span>
                              <span style={{ 
                                color: typeColor, 
                                background: typeBg, 
                                padding: '2px 8px', 
                                borderRadius: '12px', 
                                fontSize: '0.7rem', 
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                              }}>
                                {typeLabel}
                              </span>
                              {isUnread && (
                                <span style={{ 
                                  color: '#0284c7', 
                                  background: 'rgba(2, 132, 199, 0.15)', 
                                  padding: '2px 8px', 
                                  borderRadius: '12px', 
                                  fontSize: '0.7rem', 
                                  fontWeight: 'bold' 
                                }}>
                                  New
                                </span>
                              )}
                            </div>

                            <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '8px 0', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                              {item.content}
                            </p>

                            {/* Additional metadata for Lead Ads */}
                            {item.type === 'lead' && (item.email || item.phone) && (
                              <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px', flexWrap: 'wrap' }}>
                                {item.email && (
                                  <span>📧 {item.email}</span>
                                )}
                                {item.phone && (
                                  <span>📞 {item.phone}</span>
                                )}
                              </div>
                            )}

                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              🕒 {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Actions buttons */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {item.external_link && (
                            <a 
                              href={item.external_link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ 
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '6px 12px', 
                                background: 'rgba(255,255,255,0.05)', 
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#f8fafc',
                                textDecoration: 'none',
                                borderRadius: '8px', 
                                fontSize: '0.75rem', 
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            >
                              Open in Meta
                            </a>
                          )}
                          {isUnread && (
                            <button 
                              onClick={() => handleMarkNotificationRead(item.id)} 
                              style={{ padding: '6px 12px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                            >
                              Mark Read
                            </button>
                          )}
                          {item.type === 'message' && (
                            <button 
                              onClick={() => setFbReplyId(fbReplyId === item.id ? null : item.id)} 
                              style={{ padding: '6px 12px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                            >
                              {fbReplyId === item.id ? 'Cancel' : 'Reply'}
                            </button>
                          )}
                          <button 
                            onClick={() => handleDeleteNotification(item.id)} 
                            style={{ 
                              padding: '6px 8px', 
                              background: 'rgba(220, 38, 38, 0.15)', 
                              color: '#f87171', 
                              border: '1px solid rgba(220, 38, 38, 0.3)', 
                              borderRadius: '8px', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Delete Alert"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        
                        {/* Inline Reply Box */}
                        {fbReplyId === item.id && (
                          <div style={{ width: '100%', marginTop: '12px', display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              value={fbReplyText}
                              onChange={(e) => setFbReplyText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSendFbReply(item);
                              }}
                              placeholder="Type your reply here..."
                              style={{ 
                                flex: '1', 
                                padding: '10px 14px', 
                                borderRadius: '8px', 
                                border: '1px solid rgba(255,255,255,0.1)', 
                                background: '#1e293b', 
                                color: '#f8fafc',
                                fontSize: '0.9rem'
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() => handleSendFbReply(item)}
                              disabled={fbReplyLoading || !fbReplyText.trim()}
                              style={{
                                padding: '10px 20px',
                                borderRadius: '8px',
                                background: fbReplyLoading || !fbReplyText.trim() ? '#475569' : '#3b82f6',
                                color: '#fff',
                                fontWeight: 'bold',
                                border: 'none',
                                cursor: fbReplyLoading || !fbReplyText.trim() ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              {fbReplyLoading ? 'Sending...' : (
                                <>
                                  <Send size={16} /> Send
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB: CMS */}
        {activeTab === 'cms' && (
          <div className="admin-orders-tab">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}><FileText size={20} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom', color: '#38bdf8' }} /> Content Management System</h2>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="admin-btn" onClick={loadAdminData} style={{ padding: '6px 14px', fontSize: '0.85rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                  Refresh
                </button>
              </div>
            </div>

            {cmsSaveStatus && (
              <div style={{ 
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px',
                background: cmsSaveStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${cmsSaveStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                color: cmsSaveStatus.startsWith('error') ? '#f87171' : '#4ade80'
              }}>
                {cmsSaveStatus.startsWith('error') ? <AlertCircle size={16} /> : <Check size={16} />}
                {cmsSaveStatus.replace(/^(error:|success:)/, '')}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
              
              {/* Landing Page Settings */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} color="#f59e0b" /> Landing Page Controls
                </h3>
                
                {loadingSettings ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading settings...</div>
                ) : siteSettings ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    


                    {/* Hero Text Controls */}
                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Hero Text (English)</h4>
                      <input type="text" placeholder="Hero Title" value={siteSettings.heroTitleEn} onChange={e => setSiteSettings({...siteSettings, heroTitleEn: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <input type="text" placeholder="Hero Subtitle" value={siteSettings.heroSubEn} onChange={e => setSiteSettings({...siteSettings, heroSubEn: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <textarea placeholder="Hero Description" value={siteSettings.heroTextEn} onChange={e => setSiteSettings({...siteSettings, heroTextEn: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem', minHeight: '60px' }} />
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Hero Text (Español)</h4>
                      <input type="text" placeholder="Hero Title" value={siteSettings.heroTitleEs} onChange={e => setSiteSettings({...siteSettings, heroTitleEs: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <input type="text" placeholder="Hero Subtitle" value={siteSettings.heroSubEs} onChange={e => setSiteSettings({...siteSettings, heroSubEs: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      <textarea placeholder="Hero Description" value={siteSettings.heroTextEs} onChange={e => setSiteSettings({...siteSettings, heroTextEs: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem', minHeight: '60px' }} />
                    </div>

                    <button onClick={handleSaveSiteSettings} disabled={cmsSaveLoading} className="admin-btn admin-btn-primary" style={{ padding: '12px', justifyContent: 'center' }}>
                      {cmsSaveLoading ? 'Saving...' : <><Save size={16} /> Save Landing Page Settings</>}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Business Links Settings */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Link2 size={18} color="#3b82f6" /> Global Business Links
                </h3>
                
                {loadingSettings ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Loading settings...</div>
                ) : businessLinks ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Contact Settings</h4>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>WhatsApp Number (Numbers Only e.g. 50684046973)</label>
                        <input type="text" value={businessLinks.whatsappNumber} onChange={e => setBusinessLinks({...businessLinks, whatsappNumber: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>WhatsApp Display Text (e.g. +506 8404-6973)</label>
                        <input type="text" value={businessLinks.whatsappDisplay} onChange={e => setBusinessLinks({...businessLinks, whatsappDisplay: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Support Email</label>
                        <input type="text" value={businessLinks.supportEmail} onChange={e => setBusinessLinks({...businessLinks, supportEmail: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                    </div>

                    <div style={{ background: '#172237', padding: '16px', borderRadius: '8px' }}>
                      <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '0.95rem' }}>Social & Map URLs</h4>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Google Maps URL</label>
                        <input type="text" value={businessLinks.googleMapsUrl} onChange={e => setBusinessLinks({...businessLinks, googleMapsUrl: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Facebook URL (Optional)</label>
                        <input type="text" value={businessLinks.facebookUrl} onChange={e => setBusinessLinks({...businessLinks, facebookUrl: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Instagram URL (Optional)</label>
                        <input type="text" value={businessLinks.instagramUrl} onChange={e => setBusinessLinks({...businessLinks, instagramUrl: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: '#0e1626', color: '#f8fafc', fontSize: '0.85rem' }} />
                      </div>
                    </div>

                    <button onClick={handleSaveBusinessLinks} disabled={cmsSaveLoading} className="admin-btn admin-btn-primary" style={{ padding: '12px', justifyContent: 'center' }}>
                      {cmsSaveLoading ? 'Saving...' : <><Save size={16} /> Save Business Links</>}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Blog Manager */}
              <div style={{ background: '#0e1626', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LayoutDashboard size={18} color="#10b981" /> Blog Post Manager
                  </h3>
                  <button className="admin-btn admin-btn-accent" onClick={() => setEditingBlog({ slug: '', title_en: '', title_es: '', excerpt_en: '', excerpt_es: '', content_en: '', content_es: '', image_url: '', published: false })}>
                    <Plus size={16} /> New Post
                  </button>
                </div>

                {loadingBlogs ? (
                   <div style={{ color: '#94a3b8' }}>Loading blogs...</div>
                ) : blogs.length === 0 ? (
                   <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>No blog posts found. Create your first post!</div>
                ) : (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     {blogs.map(b => (
                       <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#172237', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                         <div>
                           <div style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '0.95rem' }}>{b.title_en}</div>
                           <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>/{b.slug} &bull; {b.published ? <span style={{ color: '#4ade80' }}>Published</span> : <span style={{ color: '#f59e0b' }}>Draft</span>}</div>
                         </div>
                         <div style={{ display: 'flex', gap: '8px' }}>
                           <button onClick={() => setEditingBlog(b)} className="admin-btn" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Edit</button>
                           <button onClick={() => handleDeleteBlog(b.id)} className="admin-btn" style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Trash2 size={14}/></button>
                         </div>
                       </div>
                     ))}
                   </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'team_chat' && (
          <div className="admin-team-chat-shell admin-tab-panel">
            <TeamChat profile={adminProfile} />
          </div>
        )}

        {/* TAB: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="admin-orders-tab admin-tab-panel">
            <AnalyticsDashboard orders={orders} abandonedCarts={abandonedCarts} products={products} productViews={productViews} />
          </div>
        )}

        {/* TAB: CUSTOMERS CRM */}
        {activeTab === 'customers' && (
          <div className="admin-orders-tab admin-tab-panel">
            <CustomersCRM 
              orders={orders} 
              abandonedCarts={abandonedCarts} 
              onWhatsAppClick={(recipient) => openWhatsAppComposer(recipient)} 
            />
          </div>
        )}

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
        {activeTab === 'team' && (
          <div className="admin-orders-tab admin-tab-panel">
            <TeamManagement currentUserProfile={adminProfile} currentUserEmail={loggedInEmail.current} onTeamChanged={fetchAgents} />
          </div>
        )}

        {/* TAB: AFFILIATES */}
        {activeTab === 'marketing' && (
          <div className="admin-orders-tab admin-tab-panel">
            <EmailMarketingStudio />
          </div>
        )}

        {activeTab === 'wa_session' && (
          <div className="admin-orders-tab admin-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '0' }}>
            {/* Session status card */}
            <div style={{ padding: '20px 20px 0' }}>
              <WhatsAppSession />
            </div>
            {/* Full Baileys inbox */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <WhatsAppInbox
                whatsappMessages={whatsappMessages.filter(m => m.source === 'baileys_session')}
                orders={orders}
                leads={leads}
                abandonedCarts={abandonedCarts}
                loadingWhatsappMessages={loadingWhatsappMessages}
                whatsappSettings={whatsappSettings}
                setWhatsappSettings={setWhatsappSettings}
                handleSaveWhatsappSettings={handleSaveWhatsappSettings}
                savingWaSettings={savingWaSettings}
                activeChatWaId={baileysActiveChatWaId}
                setActiveChatWaId={setBaileysActiveChatWaId}
                chatInputText={baileysChatInputText}
                setChatInputText={setBaileysChatInputText}
                handleSendLiveWhatsappMessage={handleSendBaileysMessage}
                handleDraftAiChatReply={handleDraftAiChatReply}
                draftingAiReply={draftingAiReply}
                loadAdminData={loadAdminData}
              />
            </div>
          </div>
        )}

        {activeTab === 'affiliates' && (
          <div className="admin-orders-tab" style={{ padding: '20px 0' }}>
            <AffiliatesManager products={products} />
          </div>
        )}

        {/* TAB: CUSTOMER INQUIRIES */}
        {activeTab === 'inquiries' && (
          <div className="admin-orders-tab" style={{ padding: '20px 0' }}>
            <InquiriesManager adminEmail={loggedInEmail.current} products={products} />
          </div>
        )}

        {/* TAB: AI COPILOT */}
        {activeTab === 'ai' && (
          <div className="admin-split-layout admin-copilot-layout">
            
            {/* Left Column: Preset Utilities & Quick Actions */}
            <div className="admin-split-sidebar" style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🧬 Copilot Presets</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Click any preset to draft instant marketing or support copy.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: '800', color: '#38bdf8', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>💬 WhatsApp & CRM</h4>
                
                <button 
                  onClick={() => setAiInputText("Draft a polite WhatsApp message to recover an abandoned cart containing BPC-157. Include a friendly 10% discount hook.")}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  🛒 BPC-157 Cart Recovery
                </button>
                
                <button 
                  onClick={() => setAiInputText("Draft a WhatsApp order confirmation message in Spanish, thanking the customer and mentioning their order is being prepared for fast courier shipment.")}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  📦 Order Confirmed (ES)
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: '800', color: '#c084fc', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>✍️ Content Marketing</h4>
                
                <button 
                  onClick={() => setAiInputText("Write an educational newsletter in English explaining the synergistic benefits of combining BPC-157 and TB-500 for connective tissue repair.")}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  📰 BPC & TB Synergies
                </button>

                <button 
                  onClick={() => setAiInputText("Draft a short, engaging scientific Instagram caption in Spanish for Semaglutide, emphasizing metabolic research, safety, and pure laboratory testing.")}
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px', fontSize: '0.75rem', color: '#cbd5e1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  📸 Semaglutide Promo (ES)
                </button>
              </div>

              <div style={{ marginTop: 'auto', padding: '12px', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.1)', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#38bdf8', display: 'block', marginBottom: '4px' }}>💡 Dashboard Context:</span>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block' }}>Copilot is fed your active products list and orders metrics, enabling it to reference real catalog details in drafts automatically!</span>
              </div>
            </div>

            {/* Right Column: Premium AI Chat Console */}
            <div className="admin-split-main" style={{ background: '#0e1626', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} style={{ color: '#38bdf8' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc' }}>Active E-Commerce Copilot Session</span>
                </div>
                <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontSize: '0.65rem', padding: '3px 8px', borderRadius: '20px', fontWeight: 'bold', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  ● Gemini Flash Online
                </span>
              </div>

              {/* Chat Stream */}
              <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '420px', minHeight: '400px' }}>
                {aiChatMessages.map((msg, index) => (
                  <div 
                    key={index}
                    style={{ 
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      background: msg.role === 'user' ? '#1d4ed8' : 'rgba(255,255,255,0.03)',
                      border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.05)',
                      color: '#f8fafc',
                      borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                      padding: '12px 16px',
                      fontSize: '0.85rem',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap'
                    }}
                  >
                    <div style={{ fontSize: '0.65rem', color: msg.role === 'user' ? '#93c5fd' : '#38bdf8', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>
                      {msg.role === 'user' ? 'You (Administrator)' : '🧬 Costa Peptides Copilot'}
                    </div>
                    {msg.text}
                  </div>
                ))}

                {aiLoading && (
                  <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px 12px 12px 0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <div style={{ width: '6px', height: '6px', background: '#38bdf8', borderRadius: '50%' }} />
                      <div style={{ width: '6px', height: '6px', background: '#38bdf8', borderRadius: '50%' }} />
                      <div style={{ width: '6px', height: '6px', background: '#38bdf8', borderRadius: '50%' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Thinking...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Console */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <textarea
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendAiChatMessage();
                    }
                  }}
                  placeholder="Ask Copilot anything..."
                  style={{ flex: 1, height: '44px', background: '#172237', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
                />
                <button
                  className="admin-btn admin-btn-primary"
                  disabled={aiLoading || !aiInputText.trim()}
                  onClick={handleSendAiChatMessage}
                  style={{ height: '44px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', opacity: (aiLoading || !aiInputText.trim()) ? 0.5 : 1 }}
                >
                  <Send size={14} /> Send
                </button>
              </div>

            </div>
          </div>
        )}

        {/* TAB: WHATSAPP AI INBOX */}
        {activeTab === 'whatsapp_ai' && (
          <WhatsAppInbox
            whatsappMessages={whatsappMessages}
            orders={orders}
            leads={leads}
            abandonedCarts={abandonedCarts}
            loadingWhatsappMessages={loadingWhatsappMessages}
            whatsappSettings={whatsappSettings}
            setWhatsappSettings={setWhatsappSettings}
            handleSaveWhatsappSettings={handleSaveWhatsappSettings}
            savingWaSettings={savingWaSettings}
            activeChatWaId={activeChatWaId}
            setActiveChatWaId={setActiveChatWaId}
            chatInputText={chatInputText}
            setChatInputText={setChatInputText}
            handleSendLiveWhatsappMessage={handleSendLiveWhatsappMessage}
            handleDraftAiChatReply={handleDraftAiChatReply}
            draftingAiReply={draftingAiReply}
            loadAdminData={loadAdminData}
          />
        )}
      </div>

      {/* Lead Details Modal */}
      {selectedLeadDetails && (() => {
        const currentLead = leads.find(l => l.id === selectedLeadDetails.id) || selectedLeadDetails;
        return (
        <div className="modal active" onClick={() => setSelectedLeadDetails(null)} style={{ zIndex: 210 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto', background: '#0e1626', color: '#f8fafc', borderRadius: '16px', padding: '30px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button className="close-modal" onClick={() => setSelectedLeadDetails(null)} style={{ color: '#94a3b8', fontSize: '1.5rem', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '12px', color: '#38bdf8', fontSize: '1.5rem' }}>👤</div>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc', margin: 0 }}>Lead Profile</h2>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ID: {currentLead.id}</span>
              </div>
            </div>

            {/* Profile Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* SECTION: CONTACT & BASICS */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0, letterSpacing: '0.05em' }}>Contact Details</h3>
                <div className="admin-form-grid-2">
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Method</label>
                    <span style={{ 
                      background: currentLead.contact_method === 'whatsapp' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)', 
                      color: currentLead.contact_method === 'whatsapp' ? '#4ade80' : '#38bdf8', 
                      padding: '4px 10px', 
                      borderRadius: '20px', 
                      fontSize: '0.75rem', 
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      display: 'inline-block',
                      border: currentLead.contact_method === 'whatsapp' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                    }}>{currentLead.contact_method}</span>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Value</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f8fafc' }}>{currentLead.contact_value}</span>
                      {currentLead.contact_method === 'whatsapp' ? (
                        <button 
                          onClick={() => openLeadOutreachComposer(currentLead, 'whatsapp')}
                          style={{
                            color: '#4ade80',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(34, 197, 94, 0.1)',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            fontSize: '0.8rem',
                            border: '1px solid rgba(34, 197, 94, 0.2)',
                            cursor: 'pointer'
                          }}
                          title="Open AI WhatsApp Outreach Composer"
                        >
                          💬
                        </button>
                      ) : (
                        <button 
                          onClick={() => openLeadOutreachComposer(currentLead, 'email')}
                          style={{
                            color: '#38bdf8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(56, 189, 248, 0.1)',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            fontSize: '0.8rem',
                            border: '1px solid rgba(56, 189, 248, 0.2)',
                            cursor: 'pointer'
                          }}
                          title="Open AI Email Outreach Composer"
                        >
                          ✉️
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Captured On</label>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{new Date(currentLead.created_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Language</label>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>{currentLead.language ? currentLead.language.toUpperCase() : 'EN'}</span>
                  </div>
                </div>
              </div>

              {/* SECTION: GEOGRAPHICAL DETAILS */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0, letterSpacing: '0.05em' }}>Geographic Insights</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>IP Address</label>
                    <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontFamily: 'monospace' }}>🌐 {currentLead.ip_address || 'Not captured'}</span>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Location</label>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '600' }}>
                      📍 {[currentLead.city, currentLead.region, currentLead.country].filter(Boolean).join(', ') || 'Not captured'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION: ATTRIBUTION & CAMPAIGN */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0, letterSpacing: '0.05em' }}>Marketing Attribution</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Attribution Source</label>
                      <span style={{ 
                        ...getReferralBadgeStyles(getReferralLabel(currentLead)),
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        display: 'inline-block'
                      }}>{getReferralLabel(currentLead)}</span>
                    </div>
                    {currentLead.utm_campaign && (
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>UTM Campaign</label>
                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>📢 {currentLead.utm_campaign}</span>
                      </div>
                    )}
                  </div>
                  
                  {currentLead.utm_source && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>UTM Source</label>
                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{currentLead.utm_source}</span>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>UTM Medium</label>
                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{currentLead.utm_medium || '—'}</span>
                      </div>
                    </div>
                  )}

                  {currentLead.referrer && (
                    <div>
                      <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>HTTP Referrer</label>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', wordBreak: 'break-all', display: 'block', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px' }}>
                        {currentLead.referrer}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: CRM CONSULTATION NOTES */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', marginTop: 0, letterSpacing: '0.05em' }}>CRM Consultation Notes</h3>
                <textarea
                  value={currentLead.notes || ''}
                  onChange={(e) => handleLeadFieldUpdate(currentLead.id, 'notes', e.target.value)}
                  placeholder="Type manual follow-up consultation notes here... (e.g. wants Semaglutide bulk pricing, call back on Friday)"
                  style={{
                    width: '100%',
                    height: '90px',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '0.8rem',
                    color: '#f8fafc',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'sans-serif'
                  }}
                />
                <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginTop: '4px' }}>📝 Notes auto-save to database & local backup as you type.</span>
              </div>

              {/* SECTION: AI OUTREACH ASSISTANT */}
              <div style={{ 
                background: 'linear-gradient(135deg, rgba(14, 26, 51, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)', 
                padding: '20px', 
                borderRadius: '16px', 
                border: '1px solid rgba(56, 189, 248, 0.25)',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
                  <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '6px', borderRadius: '8px', color: '#38bdf8' }}>
                    <Brain size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>🧬 Personalized AI Outreach Copilot</h3>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Gemini drafts target-aware pitches using browsing history</span>
                  </div>
                </div>

                {/* Show Last Contacted Status & Anti-Spam warning */}
                <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8' }}>Last contacted:</span>
                  {(() => {
                    if (!currentLead.last_contacted_at) {
                      return <span style={{ color: '#64748b', fontWeight: 'bold' }}>Never</span>;
                    }
                    const contactedDate = new Date(currentLead.last_contacted_at);
                    const diffDays = Math.floor((new Date() - contactedDate) / (1000 * 60 * 60 * 24));
                    const isRecent = diffDays < 3;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <span style={{ color: isRecent ? '#fbbf24' : '#4ade80', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isRecent ? '⚠️ ' : '✅ '}{formatRelativeTime(currentLead.last_contacted_at)}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#64748b' }}>({contactedDate.toLocaleDateString()} {contactedDate.toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})})</span>
                      </div>
                    );
                  })()}
                </div>

                {(() => {
                  if (currentLead.last_contacted_at) {
                    const contactedDate = new Date(currentLead.last_contacted_at);
                    const isRecent = (new Date() - contactedDate) < 259200000; // < 3 days
                    if (isRecent) {
                      return (
                        <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', color: '#fbbf24', fontSize: '0.75rem', lineHeight: '1.4', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span>⚠️</span>
                          <div>
                            <strong>Spam Prevention Alert:</strong> This lead was contacted recently ({formatRelativeTime(currentLead.last_contacted_at)}). Please verify if another follow-up is necessary to avoid spamming the prospect.
                          </div>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}

                {isLocalAiDraft && individualAiText && (
                  <div style={{ 
                    marginBottom: '12px', 
                    padding: '10px 12px', 
                    background: 'rgba(56, 189, 248, 0.1)', 
                    border: '1px solid rgba(56, 189, 248, 0.25)', 
                    borderRadius: '8px', 
                    color: '#38bdf8', 
                    fontSize: '0.75rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    lineHeight: '1.3'
                  }}>
                    <span>✨</span>
                    <span><strong>Local Failover Engine Active:</strong> Gemini is currently busy. A target-aware, highly-converting research sales copy was generated locally to avoid interrupting your outreach.</span>
                  </div>
                )}

                {individualAiText ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ 
                      background: 'rgba(0,0,0,0.3)', 
                      padding: '12px', 
                      borderRadius: '10px', 
                      border: '1px solid rgba(255,255,255,0.04)',
                      fontSize: '0.8rem',
                      lineHeight: '1.5',
                      color: '#cbd5e1',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      fontFamily: 'sans-serif'
                    }}>
                      {individualAiText}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(individualAiText);
                          alert('Outreach text copied to clipboard!');
                        }}
                        className="admin-btn admin-btn-secondary"
                      >
                        <Clipboard size={12} /> Copy
                      </button>
                      {currentLead.contact_method === 'whatsapp' ? (
                        <button
                          onClick={async () => {
                            const formattedPhone = cleanPhoneNumber(currentLead.contact_value);
                            window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(individualAiText)}`, '_blank');
                            await logOutreachToNotes(currentLead, 'whatsapp', individualAiText);
                            await handleMarkAsContacted(currentLead.id);
                          }}
                          className="admin-btn admin-btn-success"
                        >
                          <Send size={12} /> Send WhatsApp
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSendEmailOutreach(currentLead, individualAiText)}
                          disabled={emailSending}
                          className="admin-btn admin-btn-primary"
                          style={{ opacity: emailSending ? 0.6 : 1 }}
                        >
                          {emailSending ? 'Sending email...' : <><Mail size={12} /> Send Email</>}
                        </button>
                      )}
                      <button
                        onClick={() => setIndividualAiText('')}
                        className="admin-btn admin-btn-secondary"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0' }}>Generate a hyper-personalized outbound draft matching their peptide interests, language, and geography.</p>
                    <button
                      onClick={() => handleGenerateIndividualAi(currentLead)}
                      disabled={generatingIndividualAi}
                      className="admin-btn admin-btn-primary"
                      style={{ margin: '0 auto' }}
                    >
                      {generatingIndividualAi ? (
                        <>
                          <div className="sync-spinner" style={{ width: '12px', height: '12px', border: '2px solid transparent', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', marginRight: '4px' }}></div>
                          Drafting pitch...
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} /> Generate Custom Outreach
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* SECTION: PRODUCT VIEWS (BEHAVIOR) */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', maxHeight: '300px', overflowY: 'auto' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', marginTop: 0, letterSpacing: '0.05em' }}>Browsing Behavior ({productViews.filter(v => v.contact_value === currentLead.contact_value).length} views)</h3>
                {(() => {
                  const views = productViews.filter(v => v.contact_value === currentLead.contact_value);
                  if (views.length === 0) {
                    return <span style={{ color: '#64748b', fontSize: '0.85rem' }}>No catalog products viewed yet.</span>;
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {views.map((v, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(56, 189, 248, 0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                          <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 'bold' }}>{v.product_name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {v.viewed_at ? new Date(v.viewed_at).toLocaleTimeString() : 'Viewed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>
        </div>
      );
      })()}

      {selectedOrderDetails && (
        <OrderDetailPanel
          order={selectedOrderDetails}
          products={products}
          onClose={() => setSelectedOrderDetails(null)}
          onUpdated={handleOrderUpdated}
          onStatusChange={handleOrderStatusUpdate}
          onTrackingChange={handleOrderTrackingUpdate}
        />
      )}

      <GlobalSearch
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        orders={visibleOrders}
        products={products}
        leads={leads}
        onSelect={handleGlobalSearchSelect}
      />

      <ManualOrderModal
        open={manualOrderOpen}
        onClose={() => setManualOrderOpen(false)}
        products={products}
        onCreated={handleManualOrderCreated}
      />

      {selectedCartDetails && (
        <AbandonedCartEditPanel
          cart={selectedCartDetails}
          products={products}
          onClose={() => setSelectedCartDetails(null)}
          onSaved={(updated) => {
            setAbandonedCarts((prev) => prev.map((c) => (c.session_id === updated.session_id ? updated : c)));
            setSelectedCartDetails(updated);
          }}
          onDeleted={(sessionId) => {
            setAbandonedCarts((prev) => prev.filter((c) => c.session_id !== sessionId));
            setSelectedCartDetails(null);
          }}
        />
      )}

      {/* Blog Editor Modal */}
      {editingBlog && (
        <div className="modal active" onClick={() => setEditingBlog(null)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setEditingBlog(null)} style={{ color: '#94a3b8' }}>&times;</button>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc', marginBottom: '20px' }}>{editingBlog.id ? 'Edit Blog Post' : 'New Blog Post'}</h2>
            
            <form onSubmit={handleSaveBlog} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Slug (URL path)</label>
                  <input required type="text" value={editingBlog.slug} onChange={e => setEditingBlog({...editingBlog, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})} placeholder="e.g. what-are-peptides" style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Cover Image</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        value={editingBlog.image_url} 
                        onChange={e => setEditingBlog({...editingBlog, image_url: e.target.value})} 
                        placeholder="Image URL (https://...)" 
                        style={{ flexGrow: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} 
                      />
                      <input 
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="blogImageUpload"
                        onChange={handleBlogImageUpload}
                      />
                      <button 
                        type="button"
                        onClick={() => document.getElementById('blogImageUpload').click()}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: '#2563eb',
                          color: '#ffffff',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Upload size={14} /> Upload
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Or select from Bucket:</span>
                      <select
                        value={bucketImages.find(img => img.url === editingBlog.image_url)?.url || (editingBlog.image_url ? 'custom' : '')}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') return;
                          setEditingBlog({ ...editingBlog, image_url: val });
                        }}
                        style={{
                          flexGrow: 1,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: '#172237',
                          color: '#f8fafc',
                          fontSize: '0.8rem',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">-- Select from Supabase Bucket --</option>
                        {editingBlog.image_url && !bucketImages.some(img => img.url === editingBlog.image_url) && (
                          <option value="custom">Custom / Manually Entered URL</option>
                        )}
                        {bucketImages.map((img) => (
                          <option key={img.name} value={img.url}>
                            {img.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Title (EN)</label>
                  <input required type="text" value={editingBlog.title_en} onChange={e => setEditingBlog({...editingBlog, title_en: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Title (ES)</label>
                  <input required type="text" value={editingBlog.title_es} onChange={e => setEditingBlog({...editingBlog, title_es: e.target.value})} style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Excerpt (EN)</label>
                  <textarea required value={editingBlog.excerpt_en} onChange={e => setEditingBlog({...editingBlog, excerpt_en: e.target.value})} style={{ width: '100%', height: '80px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Excerpt (ES)</label>
                  <textarea required value={editingBlog.excerpt_es} onChange={e => setEditingBlog({...editingBlog, excerpt_es: e.target.value})} style={{ width: '100%', height: '80px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Content (EN) - HTML/Markdown</label>
                <textarea required value={editingBlog.content_en} onChange={e => setEditingBlog({...editingBlog, content_en: e.target.value})} style={{ width: '100%', height: '200px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Content (ES) - HTML/Markdown</label>
                <textarea required value={editingBlog.content_es} onChange={e => setEditingBlog({...editingBlog, content_es: e.target.value})} style={{ width: '100%', height: '200px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '8px' }}>
                  <input type="checkbox" checked={editingBlog.published} onChange={e => setEditingBlog({...editingBlog, published: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: editingBlog.published ? '#4ade80' : '#94a3b8' }}>
                    {editingBlog.published ? 'Published (Live)' : 'Draft (Hidden)'}
                  </span>
                </label>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="admin-btn" onClick={() => setEditingBlog(null)}>Cancel</button>
                  <button type="submit" disabled={cmsSaveLoading} className="admin-btn admin-btn-primary">
                    {cmsSaveLoading ? 'Saving...' : <><Save size={16} /> Save Blog Post</>}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal active" onClick={() => setShowPasswordModal(false)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setShowPasswordModal(false)} style={{ color: '#94a3b8' }}>&times;</button>
            
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <KeyRound size={36} style={{ color: '#38bdf8', marginBottom: '12px' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc' }}>Change Password</h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>Update your admin access password</p>
            </div>

            {passwordStatus && (
              <div style={{ 
                padding: '10px 14px', 
                borderRadius: '8px', 
                marginBottom: '16px',
                fontSize: '0.8rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: passwordStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${passwordStatus.startsWith('error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`,
                color: passwordStatus.startsWith('error') ? '#f87171' : '#4ade80'
              }}>
                {passwordStatus.startsWith('error') ? <AlertCircle size={16} /> : <Check size={16} />}
                {passwordStatus.replace(/^(error:|success:)/, '')}
              </div>
            )}

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Current Password</label>
                <input 
                  type="password" 
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>New Password</label>
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Confirm New Password</label>
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <button 
                type="submit" 
                disabled={passwordLoading}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#38bdf8', color: '#050b18', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {passwordLoading ? (
                  <div className="sync-spinner" style={{ width: '16px', height: '16px' }}></div>
                ) : (
                  <><KeyRound size={16} /> Update Password</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Description Modal */}
      {editDescModalOpen && editDescProduct && (
        <div className="modal active" onClick={() => setEditDescModalOpen(false)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', background: '#0e1626', color: '#f8fafc' }}>
            <button className="close-modal" onClick={() => setEditDescModalOpen(false)} style={{ color: '#94a3b8' }}>&times;</button>
            
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <FileText size={36} style={{ color: '#38bdf8', marginBottom: '8px' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#f8fafc' }}>Edit Product Information / Blog</h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>{editDescProduct.product}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  English Description / Information
                </label>
                <textarea
                  value={editDescEn}
                  onChange={(e) => setEditDescEn(e.target.value)}
                  placeholder="Enter detailed scientific info, uses, benefits, and research details in English..."
                  style={{ width: '100%', height: '120px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                  Spanish Description / Información (Español)
                </label>
                <textarea
                  value={editDescEs}
                  onChange={(e) => setEditDescEs(e.target.value)}
                  placeholder="Ingrese información científica detallada, usos, beneficios y detalles de investigación en español..."
                  style={{ width: '100%', height: '120px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* AI Assistant Action Panel */}
              <div style={{ display: 'flex', gap: '8px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={14} style={{ color: '#38bdf8' }} /> AI Copilot (Gemini)
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    className="admin-btn"
                    disabled={loadingAiDesc || loadingAiTranslate}
                    onClick={() => handleAiGenerateDesc(editDescProduct.product)}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: '#38bdf8', cursor: 'pointer', borderRadius: '6px', opacity: (loadingAiDesc || loadingAiTranslate) ? 0.5 : 1 }}
                  >
                    {loadingAiDesc ? 'Generating...' : '🧬 Generate scientific details'}
                  </button>
                  <button
                    className="admin-btn"
                    disabled={loadingAiDesc || loadingAiTranslate}
                    onClick={() => handleAiTranslate(editDescEn, 'en-to-es')}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#4ade80', cursor: 'pointer', borderRadius: '6px', opacity: (loadingAiDesc || loadingAiTranslate) ? 0.5 : 1 }}
                  >
                    {loadingAiTranslate ? 'Translating...' : '🌎 EN ➔ ES'}
                  </button>
                  <button
                    className="admin-btn"
                    disabled={loadingAiDesc || loadingAiTranslate}
                    onClick={() => handleAiTranslate(editDescEs, 'es-to-en')}
                    style={{ padding: '6px 10px', fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.2)', color: '#c084fc', cursor: 'pointer', borderRadius: '6px', opacity: (loadingAiDesc || loadingAiTranslate) ? 0.5 : 1 }}
                  >
                    {loadingAiTranslate ? 'Translating...' : '🌎 ES ➔ EN'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  className="admin-btn"
                  onClick={() => setEditDescModalOpen(false)}
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
                >
                  Cancel
                </button>
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => {
                    handleCellChange(editDescProduct.id, 'descriptionEn', editDescEn);
                    handleCellChange(editDescProduct.id, 'descriptionEs', editDescEs);
                    setEditDescModalOpen(false);
                  }}
                >
                  Apply & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI WhatsApp Outbound Composer Modal */}
      {waModalOpen && waRecipient && (
        <div className="modal active" onClick={() => setWaModalOpen(false)} style={{ zIndex: 200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px', background: '#0e1626', color: '#f8fafc', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <button className="close-modal" onClick={() => setWaModalOpen(false)} style={{ color: '#94a3b8', fontSize: '1.5rem' }}>&times;</button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(34, 197, 94, 0.15)', borderRadius: '50%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={24} style={{ color: '#22c55e' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  WhatsApp Outbound Composer
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  Sending to: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{waRecipient.name}</span> (+{waRecipient.phone})
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {waRecipient.cartItems && waRecipient.cartItems.length > 0 && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                  <strong style={{ color: '#fbbf24' }}>🛒 Cart/Order Items:</strong> {waRecipient.cartItems.map(item => `${item.product} (x${item.qty || item.quantity || 1})`).join(', ')}
                </div>
              )}

              {/* Dynamic Agent & Template Selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                    Asignar Asesor (Firma y Comisión)
                  </label>
                  <select
                    value={waSelectedAgent}
                    onChange={(e) => {
                      const agent = e.target.value;
                      setWaSelectedAgent(agent);
                      setWaMessageText(generateWhatsAppTemplateText(waRecipient, waSelectedTemplate, agent));
                    }}
                    style={{ background: '#172237', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', borderRadius: '6px', padding: '6px', fontSize: '0.75rem', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">Ninguno / Firma genérica</option>
                    {agents && agents.map(aName => (
                      <option key={aName} value={aName}>{aName}</option>
                    ))}
                  </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                    Plantilla de Conversión
                  </label>
                  <select
                    value={waSelectedTemplate}
                    onChange={(e) => {
                      const template = e.target.value;
                      setWaSelectedTemplate(template);
                      setWaMessageText(generateWhatsAppTemplateText(waRecipient, template, waSelectedAgent));
                    }}
                    style={{ background: '#172237', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white', borderRadius: '6px', padding: '6px', fontSize: '0.75rem', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="standard">Standard Pitch (Ayuda y Link)</option>
                    <option value="purity">Purity Guarantee (Calidad ≥98%)</option>
                    <option value="discount">Discount Offer (10% Cupón COSTA10)</option>
                    <option value="dosing">Dosing & Reconstitution Support</option>
                    {waRecipient && waRecipient.orderNumber && (
                      <option value="payment">💰 Payment Reminder (SINPE / Card)</option>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Message Content
                </label>
                <button
                  className="admin-btn"
                  disabled={waDrafting || waSending}
                  onClick={handleDraftWaMessage}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#c084fc', cursor: 'pointer', borderRadius: '6px', opacity: (waDrafting || waSending) ? 0.5 : 1 }}
                >
                  <Sparkles size={12} style={{ color: '#c084fc' }} /> {waDrafting ? 'Drafting...' : '✨ Let Gemini Draft It'}
                </button>
              </div>

              <textarea
                value={waMessageText}
                onChange={(e) => setWaMessageText(e.target.value)}
                placeholder="Type your WhatsApp message..."
                style={{ width: '100%', height: '140px', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.4' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                <button
                  className="admin-btn admin-btn-primary"
                  disabled={waSending || waDrafting || !waMessageText.trim()}
                  onClick={handleSendWaMessage}
                  style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.2)', opacity: (waSending || waDrafting || !waMessageText.trim()) ? 0.5 : 1 }}
                >
                  <Zap size={16} /> {waSending ? 'Sending automatically...' : '🚀 Send from Business Number'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <a
                    href={`https://wa.me/${waRecipient.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waMessageText)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.75rem', color: '#38bdf8', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    🔗 Open manually in WhatsApp (wa.me fallback)
                  </a>
                  <button
                    onClick={() => setWaModalOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Leads Outreach Composer Modal */}
      {leadOutreachModalOpen && leadOutreachActive && (
        <div className="modal active" onClick={() => setLeadOutreachModalOpen(false)} style={{ zIndex: 210 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px', background: '#0e1626', color: '#f8fafc', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <button className="close-modal" onClick={() => setLeadOutreachModalOpen(false)} style={{ color: '#94a3b8', fontSize: '1.5rem' }}>&times;</button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ background: leadOutreachMethod === 'whatsapp' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)', borderRadius: '50%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {leadOutreachMethod === 'whatsapp' ? (
                  <MessageCircle size={24} style={{ color: '#22c55e' }} />
                ) : (
                  <Mail size={24} style={{ color: '#38bdf8' }} />
                )}
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {leadOutreachMethod === 'whatsapp' ? 'AI WhatsApp Outreach' : 'AI Email Outreach'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                  Recipient: <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>{leadOutreachActive.contact_value}</span>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Context Badges */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                  🌐 Lang: {leadOutreachActive.language ? leadOutreachActive.language.toUpperCase() : 'EN'}
                </span>
                {leadOutreachActive.city && (
                  <span style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                    📍 Location: {leadOutreachActive.city}
                  </span>
                )}
                {leadOutreachActive.browsing_history && leadOutreachActive.browsing_history.length > 0 && (
                  <span style={{ padding: '4px 10px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '20px', fontSize: '0.75rem', color: '#fbbf24', fontWeight: 'bold' }}>
                    🛒 Interested: {leadOutreachActive.browsing_history.join(', ')}
                  </span>
                )}
              </div>

              {/* Show Last Contacted Status & Anti-Spam Warning inside Composer Modal */}
              <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8' }}>Last contacted:</span>
                {(() => {
                  if (!leadOutreachActive.last_contacted_at) {
                    return <span style={{ color: '#64748b', fontWeight: 'bold' }}>Never</span>;
                  }
                  const contactedDate = new Date(leadOutreachActive.last_contacted_at);
                  const diffDays = Math.floor((new Date() - contactedDate) / (1000 * 60 * 60 * 24));
                  const isRecent = diffDays < 3;
                  return (
                    <span style={{ color: isRecent ? '#fbbf24' : '#4ade80', fontWeight: 'bold' }}>
                      {isRecent ? '⚠️ ' : '✅ '}{formatRelativeTime(leadOutreachActive.last_contacted_at)}
                    </span>
                  );
                })()}
              </div>

              {(() => {
                if (leadOutreachActive.last_contacted_at) {
                  const contactedDate = new Date(leadOutreachActive.last_contacted_at);
                  const isRecent = (new Date() - contactedDate) < 259200000; // < 3 days
                  if (isRecent) {
                    return (
                      <div style={{ padding: '10px 14px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', color: '#fbbf24', fontSize: '0.75rem', lineHeight: '1.4', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <span>⚠️</span>
                        <div>
                          <strong>Recent Outreach Warning:</strong> This lead was contacted {formatRelativeTime(leadOutreachActive.last_contacted_at)}. Proceed with caution.
                        </div>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Outreach Message Text
                </label>
                <button
                  className="admin-btn"
                  disabled={leadOutreachDrafting || leadOutreachSending}
                  onClick={handleDraftLeadOutreachMessage}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', color: '#c084fc', cursor: 'pointer', borderRadius: '6px', opacity: (leadOutreachDrafting || leadOutreachSending) ? 0.5 : 1 }}
                >
                  <Sparkles size={12} style={{ color: '#c084fc' }} /> {leadOutreachDrafting ? 'Drafting...' : '✨ Let Gemini Draft It'}
                </button>
              </div>

              <textarea
                value={leadOutreachMessage}
                onChange={(e) => setLeadOutreachMessage(e.target.value)}
                placeholder="Type your outreach message..."
                style={{ width: '100%', height: '160px', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: '#172237', color: '#f8fafc', fontSize: '0.9rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.4' }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                <button
                  className="admin-btn admin-btn-primary"
                  disabled={leadOutreachSending || leadOutreachDrafting || !leadOutreachMessage.trim()}
                  onClick={handleSendLeadOutreach}
                  style={{ width: '100%', padding: '12px', background: leadOutreachMethod === 'whatsapp' ? 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: leadOutreachMethod === 'whatsapp' ? '0 4px 12px rgba(34, 197, 94, 0.2)' : '0 4px 12px rgba(59, 130, 246, 0.2)', opacity: (leadOutreachSending || leadOutreachDrafting || !leadOutreachMessage.trim()) ? 0.5 : 1 }}
                >
                  {leadOutreachSending ? (
                    'Sending...'
                  ) : leadOutreachMethod === 'whatsapp' ? (
                    <><MessageCircle size={14} /> Send WhatsApp & Log Outreach</>
                  ) : (
                    <><Mail size={14} /> Send Email & Log Outreach</>
                  )}
                </button>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                  <button
                    onClick={() => setLeadOutreachModalOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom quick navigation */}
      <nav className="admin-mobile-quick-nav" aria-label="Quick navigation">
        {hasAccess('home') && (
          <button
            type="button"
            className={`admin-quick-nav-btn${activeTab === 'home' ? ' active' : ''}`}
            onClick={() => navigateToTab('home')}
          >
            <LayoutDashboard size={18} />
            <span>{isStaffAgent ? 'My Pay' : 'Today'}</span>
          </button>
        )}
        {hasAccess('orders') && (
          <button
            type="button"
            className={`admin-quick-nav-btn${activeTab === 'orders' ? ' active' : ''}`}
            onClick={() => navigateToTab('orders')}
          >
            <ClipboardList size={18} />
            <span>Orders</span>
            {visibleOrders.filter((o) => (o.status || 'Pending') === 'Pending').length > 0 && (
              <span className="admin-quick-nav-badge">
                {visibleOrders.filter((o) => (o.status || 'Pending') === 'Pending').length}
              </span>
            )}
          </button>
        )}
        {hasAccess('carts') && (
          <button
            type="button"
            className={`admin-quick-nav-btn${activeTab === 'carts' ? ' active' : ''}`}
            onClick={() => navigateToTab('carts')}
          >
            <ShoppingCart size={18} />
            <span>Carts</span>
            {abandonedCarts.length > 0 && (
              <span className="admin-quick-nav-badge warning">{abandonedCarts.length}</span>
            )}
          </button>
        )}
        {hasAccess('whatsapp_ai') && (
          <button
            type="button"
            className={`admin-quick-nav-btn${activeTab === 'whatsapp_ai' ? ' active' : ''}`}
            onClick={() => navigateToTab('whatsapp_ai')}
          >
            <MessageSquare size={18} />
            <span>Chat</span>
          </button>
        )}
        {hasAccess('team_chat') && (
          <button
            type="button"
            className={`admin-quick-nav-btn${activeTab === 'team_chat' ? ' active' : ''}`}
            onClick={() => navigateToTab('team_chat')}
          >
            <MessageCircle size={18} />
            <span>Team</span>
            {unreadTeamMsgCount > 0 && (
              <span className="admin-quick-nav-badge">{unreadTeamMsgCount}</span>
            )}
          </button>
        )}
        <button
          type="button"
          className={`admin-quick-nav-btn${mobileMoreOpen ? ' active' : ''}`}
          onClick={() => setMobileMoreOpen(true)}
          aria-label="More admin sections"
        >
          <ListFilter size={18} />
          <span>More</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <div className="admin-more-sheet-overlay" onClick={() => setMobileMoreOpen(false)}>
          <div className="admin-more-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="All admin sections">
            <div className="admin-more-sheet-header">
              <h2>All sections</h2>
              <button type="button" className="admin-more-sheet-close" onClick={() => setMobileMoreOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="admin-more-sheet-body">
              {ADMIN_NAV_GROUPS.map((group) => {
                const visibleTabs = group.tabs.filter((tabId) => hasAccess(tabId));
                if (visibleTabs.length === 0) return null;
                return (
                  <div key={group.title} className="admin-more-group">
                    <div className="admin-more-group-title">{group.title}</div>
                    <div className="admin-more-group-items">
                      {visibleTabs.map((tabId) => (
                        <button
                          key={tabId}
                          type="button"
                          className={`admin-more-tab-btn${activeTab === tabId ? ' active' : ''}`}
                          onClick={() => navigateToTab(tabId)}
                        >
                          {ADMIN_TAB_TITLES[tabId] || tabId}
                          {tabId === 'orders' && visibleOrders.filter((o) => (o.status || 'Pending') === 'Pending').length > 0 && (
                            <span className="admin-more-tab-badge">{visibleOrders.filter((o) => (o.status || 'Pending') === 'Pending').length}</span>
                          )}
                          {tabId === 'carts' && abandonedCarts.length > 0 && (
                            <span className="admin-more-tab-badge warning">{abandonedCarts.length}</span>
                          )}
                          {tabId === 'leads' && leads.length > 0 && (
                            <span className="admin-more-tab-badge success">{leads.length}</span>
                          )}
                          {tabId === 'facebook' && facebookNotifications.filter(n => n.status === 'unread').length > 0 && (
                            <span className="admin-more-tab-badge">{facebookNotifications.filter(n => n.status === 'unread').length}</span>
                          )}
                          {tabId === 'inquiries' && inquiryCount > 0 && (
                            <span className="admin-more-tab-badge">{inquiryCount}</span>
                          )}
                          {tabId === 'team_chat' && unreadTeamMsgCount > 0 && (
                            <span className="admin-more-tab-badge">{unreadTeamMsgCount}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="admin-more-account">
                <div className="admin-more-group-title">Account</div>
                <div className="admin-more-account-card">
                  <div className="admin-more-account-copy">
                    <span>{adminProfile?.name || adminProfile?.email?.split('@')[0] || 'Administrator'}</span>
                    <small>{adminProfile?.is_superadmin ? 'Super Admin' : 'Staff Agent'}</small>
                  </div>
                  <div className="admin-more-account-actions">
                    <button type="button" onClick={() => { setMobileMoreOpen(false); setShowPasswordModal(true); }}>
                      <KeyRound size={16} />
                      Password
                    </button>
                    <button type="button" className="logout" onClick={handleLogout}>
                      <LogOut size={16} />
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Export Modal */}
      <ExportModal 
        isOpen={!!exportModalType}
        onClose={() => setExportModalType(null)}
        title={
          exportModalType === 'orders' ? 'Export Orders' : 
          exportModalType === 'products' ? 'Export Products' : 
          exportModalType === 'carts' ? 'Export Carts' : 
          exportModalType === 'leads' ? 'Export Leads' : 'Export Data'
        }
        description={`Choose a format to download all ${exportModalType || ''} data.`}
        loading={exportLoading}
        onExportCSV={() => handleExport('csv')}
        onExportXLSX={() => handleExport('xlsx')}
        onExportPDF={() => handleExport('pdf')}
      />
    </div>
  );
}
